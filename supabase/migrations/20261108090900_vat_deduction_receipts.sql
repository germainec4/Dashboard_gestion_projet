-- Qonto remains the document store. No bank credential or document URL is stored here.
create table public.qonto_vat_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id text not null,
  enabled boolean not null default true
);
alter table public.qonto_vat_connections enable row level security;
revoke all on public.qonto_vat_connections from anon, authenticated;
grant select, insert, update on public.qonto_vat_connections to service_role;

create table public.vat_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('invoice','transaction')),
  source_id text not null,
  supplier text not null,
  reference text not null default '',
  source_date date,
  payment_date date,
  proposed_period date not null check (extract(day from proposed_period) = 1),
  amount_cents bigint not null check (amount_cents between 0 and 9007199254740991),
  currency text not null,
  vat_cents bigint check (vat_cents between 0 and 9007199254740991),
  attachment_ids text[] not null default '{}',
  file_name text not null default '',
  document_key text not null,
  credit_note boolean not null default false,
  provider_duplicate boolean not null default false,
  blocked_reason text,
  auto_duplicate_of text,
  source_missing boolean not null default false,
  source_fingerprint text not null,
  synced_at timestamptz not null default now(),
  decision text not null default 'pending' check (decision in ('pending','approved','excluded')),
  approved_cents bigint check (approved_cents between 0 and 9007199254740991),
  deduction_period date check (extract(day from deduction_period) = 1),
  eligible_on date,
  reviewed_at timestamptz,
  review_fingerprint text,
  review_note text not null default '' check (length(review_note) <= 2000),
  linked_transaction_key text,
  duplicate_of text,
  unique (user_id, source_key),
  check (decision <> 'approved' or (approved_cents > 0 and deduction_period is not null and eligible_on is not null and review_fingerprint is not null))
);
create index vat_expenses_user_period on public.vat_expenses(user_id, proposed_period);
create index vat_expenses_user_deduction_period on public.vat_expenses(user_id, deduction_period);
alter table public.vat_expenses enable row level security;
revoke all on public.vat_expenses from anon, authenticated;
grant select on public.vat_expenses to authenticated;
grant update (decision,approved_cents,deduction_period,eligible_on,reviewed_at,review_fingerprint,review_note,linked_transaction_key,duplicate_of) on public.vat_expenses to authenticated;
grant select, insert, update on public.vat_expenses to service_role;
create policy "Owners read expense reviews" on public.vat_expenses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owners update expense reviews" on public.vat_expenses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.vat_months
  add column deduction_source text not null default 'manual' check (deduction_source in ('manual','receipts')),
  add column deduction_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(deduction_snapshot) = 'array'),
  add column deduction_applied_at timestamptz,
  add column deduction_needs_review boolean not null default false;

create function public.mark_vat_deduction_changes() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if row(old.source_fingerprint,old.source_missing,old.auto_duplicate_of,old.duplicate_of,old.decision,old.approved_cents,old.deduction_period)
    is distinct from row(new.source_fingerprint,new.source_missing,new.auto_duplicate_of,new.duplicate_of,new.decision,new.approved_cents,new.deduction_period) then
    update public.vat_months m set deduction_needs_review=true
    where m.user_id=new.user_id and not m.declared and m.deduction_source='receipts'
      and exists (select 1 from jsonb_array_elements(m.deduction_snapshot) snap where snap->>'id'=new.id::text);
  end if;
  return new;
end $$;
revoke all on function public.mark_vat_deduction_changes() from public,anon,authenticated;
create trigger vat_expense_changed after update on public.vat_expenses
  for each row execute function public.mark_vat_deduction_changes();

create function public.review_vat_expense(
  p_id uuid, p_decision text, p_amount_cents bigint default null,
  p_period date default null, p_eligible_on date default null,
  p_confirmed boolean default false, p_match_id uuid default null, p_note text default ''
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  owner_id uuid := auth.uid();
  item public.vat_expenses;
  matched public.vat_expenses;
  today date := (now() at time zone 'Europe/Paris')::date;
begin
  if owner_id is null then raise exception 'Authentification requise.'; end if;
  if p_decision not in ('pending','approved','excluded') or p_decision is null then raise exception 'Décision invalide.'; end if;
  if length(coalesce(p_note,'')) > 2000 then raise exception 'Note trop longue.'; end if;
  select * into item from public.vat_expenses where id=p_id and user_id=owner_id for update;
  if not found then raise exception 'Dépense introuvable.'; end if;
  if p_decision='approved' then
    if p_confirmed is distinct from true then raise exception 'Vérifie le justificatif et le droit à déduction.'; end if;
    if item.source_missing or item.auto_duplicate_of is not null or item.duplicate_of is not null then
      raise exception 'Source modifiée ou doublon : actualise et vérifie cette pièce.';
    end if;
    if item.blocked_reason is not null or item.credit_note or item.currency <> 'EUR' then
      raise exception 'Ce cas doit être traité manuellement hors du module.';
    end if;
    if cardinality(item.attachment_ids)=0 then raise exception 'Ajoute un justificatif dans Qonto avant de valider.'; end if;
    if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > item.amount_cents then raise exception 'Montant de TVA retenu invalide.'; end if;
    if p_period is null or extract(day from p_period)<>1 or p_period < date '2000-01-01' or p_period > date_trunc('month',today)::date then
      raise exception 'Mois de déduction invalide.';
    end if;
    if p_eligible_on is null or p_eligible_on > today or p_eligible_on < date '2000-01-01'
      or date_trunc('month',p_eligible_on)::date > p_period
      or (item.kind='invoice' and item.source_date is not null and p_eligible_on < item.source_date) then
      raise exception 'Vérifie la date du droit à déduction et le mois retenu.';
    end if;
    if exists (select 1 from public.vat_months m, jsonb_array_elements(m.deduction_snapshot) snap
      where m.user_id=owner_id and m.period<>p_period and snap->>'id'=p_id::text) then
      raise exception 'Cette pièce a déjà été utilisée sur un autre mois. Vérifie ce mois avant de la déplacer.';
    end if;
    if p_match_id is not null then
      select * into matched from public.vat_expenses where id=p_match_id and user_id=owner_id for update;
      if not found or item.kind<>'invoice' or matched.kind<>'transaction' or matched.currency<>item.currency
        or abs(matched.amount_cents-item.amount_cents)>1 or matched.source_missing
        or (matched.duplicate_of is not null and matched.duplicate_of<>item.source_key)
        or (matched.auto_duplicate_of is not null and matched.auto_duplicate_of<>item.source_key) then
        raise exception 'Rapprochement invalide ou dépense déjà associée.';
      end if;
      update public.vat_expenses set duplicate_of=item.source_key where id=matched.id and user_id=owner_id;
      item.linked_transaction_key := matched.source_key;
    end if;
  end if;
  update public.vat_expenses set
    decision=p_decision,
    approved_cents=case when p_decision='approved' then p_amount_cents else null end,
    deduction_period=case when p_decision='approved' then p_period else null end,
    eligible_on=case when p_decision='approved' then p_eligible_on else null end,
    reviewed_at=now(), review_fingerprint=case when p_decision='approved' then source_fingerprint else null end,
    review_note=coalesce(p_note,''), linked_transaction_key=item.linked_transaction_key
    where id=p_id and user_id=owner_id returning * into item;
  return to_jsonb(item);
end $$;
revoke all on function public.review_vat_expense(uuid,text,bigint,date,date,boolean,uuid,text) from public, anon;
grant execute on function public.review_vat_expense(uuid,text,bigint,date,date,boolean,uuid,text) to authenticated;

create function public.apply_vat_deductions(p_period date, p_replace_manual boolean default false)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  owner_id uuid := auth.uid();
  target public.vat_months;
  snapshot jsonb;
  total bigint;
begin
  if owner_id is null then raise exception 'Authentification requise.'; end if;
  if p_period is null or extract(day from p_period)<>1 or p_period < date '2000-01-01'
    or p_period > date_trunc('month',now() at time zone 'Europe/Paris')::date then raise exception 'Mois invalide.'; end if;
  insert into public.vat_months(user_id,period) values(owner_id,p_period) on conflict do nothing;
  select * into target from public.vat_months where user_id=owner_id and period=p_period for update;
  if target.declared then raise exception 'Ce mois est déjà déclaré. Aucune modification automatique : examine la régularisation nécessaire.'; end if;
  if target.deduction_source='manual' and target.deductible<>0 and p_replace_manual is distinct from true then
    raise exception 'Confirme le remplacement du montant manuel pour éviter un double comptage.';
  end if;
  select coalesce(sum(e.approved_cents),0), coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'source_key',e.source_key,'document_key',e.document_key,'attachment_ids',e.attachment_ids,
    'linked_transaction_key',e.linked_transaction_key,'amount_cents',e.approved_cents,'fingerprint',e.source_fingerprint
  ) order by e.id),'[]'::jsonb) into total,snapshot
  from public.vat_expenses e where e.user_id=owner_id and e.deduction_period=p_period and e.decision='approved'
    and e.review_fingerprint=e.source_fingerprint and not e.source_missing and e.auto_duplicate_of is null
    and e.duplicate_of is null and cardinality(e.attachment_ids)>0 and e.blocked_reason is null and not e.credit_note and e.currency='EUR';
  if exists (select 1 from jsonb_array_elements(snapshot) item group by item->>'document_key' having count(*)>1) then
    raise exception 'Une facture apparaît plusieurs fois : vérifie les doublons.';
  end if;
  if exists (
    select 1 from public.vat_months m
    cross join lateral jsonb_array_elements(m.deduction_snapshot) old
    cross join jsonb_array_elements(snapshot) item
    where m.user_id=owner_id and m.period<>p_period and (
      old->>'id'=item->>'id' or old->>'source_key'=item->>'source_key'
      or old->>'document_key'=item->>'document_key'
      or old->>'source_key'=item->>'linked_transaction_key' or item->>'source_key'=old->>'linked_transaction_key'
      or (old->'attachment_ids') ?| array(select jsonb_array_elements_text(item->'attachment_ids'))
    )
  ) then raise exception 'Un justificatif a déjà été utilisé sur un autre mois.'; end if;
  update public.vat_months set deductible=total::numeric/100, deduction_source='receipts',
    deduction_snapshot=snapshot, deduction_applied_at=now(), deduction_needs_review=false
    where user_id=owner_id and period=p_period returning * into target;
  return to_jsonb(target);
end $$;
revoke all on function public.apply_vat_deductions(date,boolean) from public, anon;
grant execute on function public.apply_vat_deductions(date,boolean) to authenticated;
