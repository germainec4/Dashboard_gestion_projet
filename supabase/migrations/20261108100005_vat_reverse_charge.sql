-- Additive: previous declarations keep their recorded amounts.
alter table public.vat_months
  add column reverse_charge_base numeric(14,2) not null default 0,
  add column reverse_charge_due numeric(14,2) not null default 0,
  add column reverse_charge_deductible numeric(14,2) not null default 0,
  add constraint vat_months_reverse_charge_check check (
    reverse_charge_base>=0 and reverse_charge_due>=0 and reverse_charge_deductible>=0
    and reverse_charge_due<=reverse_charge_base and reverse_charge_deductible<=reverse_charge_due
    and reverse_charge_deductible<=deductible and ((reverse_charge_due>0)=(reverse_charge_base>0))
  );

alter table public.vat_expenses
  add column vat_treatment text not null default 'standard' check (vat_treatment in ('standard','reverse_charge')),
  add column reverse_charge_base_cents bigint check (reverse_charge_base_cents between 1 and 999999999999),
  add column reverse_charge_rate numeric(4,2) check (reverse_charge_rate in (2.1,5.5,10,20)),
  add column reverse_charge_due_cents bigint check (reverse_charge_due_cents between 1 and 999999999999),
  add column deductible_percent numeric(5,2) not null default 100 check (deductible_percent between 0 and 100),
  add column reverse_charge_region text check (reverse_charge_region in ('eu','non_eu')),
  add column conversion_note text not null default '' check (length(conversion_note)<=500),
  drop constraint vat_expenses_check,
  add constraint vat_expenses_review_check check (decision<>'approved' or coalesce(
    approved_cents is not null and deduction_period is not null and eligible_on is not null and review_fingerprint is not null
    and (case when vat_treatment='standard' then approved_cents>0 else
      kind='invoice' and reverse_charge_base_cents is not null and reverse_charge_rate is not null
      and reverse_charge_due_cents is not null and reverse_charge_region is not null
      and reverse_charge_due_cents=round(reverse_charge_base_cents::numeric*reverse_charge_rate/100)
      and approved_cents=round(reverse_charge_due_cents::numeric*deductible_percent/100)
      and (currency<>'EUR' or reverse_charge_base_cents<=amount_cents)
      and (currency='EUR' or length(trim(conversion_note))>0)
      and date_trunc('month',eligible_on)::date=deduction_period end), false));
grant update (vat_treatment,reverse_charge_base_cents,reverse_charge_rate,reverse_charge_due_cents,
  deductible_percent,reverse_charge_region,conversion_note) on public.vat_expenses to authenticated;

create or replace function public.mark_vat_deduction_changes() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if row(old.source_fingerprint,old.source_missing,old.auto_duplicate_of,old.duplicate_of,old.decision,old.approved_cents,old.deduction_period,
      old.vat_treatment,old.reverse_charge_base_cents,old.reverse_charge_rate,old.reverse_charge_due_cents,old.deductible_percent,
      old.reverse_charge_region,old.conversion_note,old.eligible_on)
    is distinct from row(new.source_fingerprint,new.source_missing,new.auto_duplicate_of,new.duplicate_of,new.decision,new.approved_cents,new.deduction_period,
      new.vat_treatment,new.reverse_charge_base_cents,new.reverse_charge_rate,new.reverse_charge_due_cents,new.deductible_percent,
      new.reverse_charge_region,new.conversion_note,new.eligible_on) then
    update public.vat_months m set deduction_needs_review=true
    where m.user_id=new.user_id and not m.declared and m.deduction_source='receipts'
      and exists (select 1 from jsonb_array_elements(m.deduction_snapshot) snap where snap->>'id'=new.id::text);
  end if;
  return new;
end $$;

-- One signature avoids ambiguous PostgREST overloads. Existing standard callers
-- keep working with the original eight arguments and the appended defaults.
drop function public.review_vat_expense(uuid,text,bigint,date,date,boolean,uuid,text);
create function public.review_vat_expense(
  p_id uuid, p_decision text, p_amount_cents bigint default null,
  p_period date default null, p_eligible_on date default null,
  p_confirmed boolean default false, p_match_id uuid default null, p_note text default '',
  p_vat_treatment text default 'standard', p_reverse_base_cents bigint default null,
  p_reverse_rate numeric default null, p_deductible_percent numeric default 100,
  p_reverse_region text default null, p_conversion_note text default ''
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  owner_id uuid:=auth.uid();
  item public.vat_expenses;
  matched public.vat_expenses;
  today date:=(now() at time zone 'Europe/Paris')::date;
  retained bigint:=p_amount_cents;
  due bigint;
begin
  if owner_id is null then raise exception 'Authentification requise.'; end if;
  if p_decision is null or p_decision not in ('pending','approved','excluded') then raise exception 'Décision invalide.'; end if;
  if p_vat_treatment is null or p_vat_treatment not in ('standard','reverse_charge') then raise exception 'Traitement TVA invalide.'; end if;
  if length(coalesce(p_note,''))>2000 or length(coalesce(p_conversion_note,''))>500 then raise exception 'Note trop longue.'; end if;
  select * into item from public.vat_expenses where id=p_id and user_id=owner_id for update;
  if not found then raise exception 'Dépense introuvable.'; end if;
  if p_decision='approved' then
    if p_confirmed is distinct from true then raise exception 'Vérifie le justificatif, le traitement TVA et le droit à déduction.'; end if;
    if item.source_missing or item.auto_duplicate_of is not null or item.duplicate_of is not null then
      raise exception 'Source modifiée ou doublon : actualise et vérifie cette pièce.';
    end if;
    if item.credit_note or cardinality(item.attachment_ids)=0 then raise exception 'Une facture valide avec justificatif Qonto est requise.'; end if;
    if p_vat_treatment='reverse_charge' then
      if item.kind<>'invoice' or (item.blocked_reason is not null and item.blocked_reason<>'Devise étrangère · traitement manuel')
        or coalesce(item.vat_cents,0)>0 then
        raise exception 'Autoliquidation réservée à une facture de service sans TVA facturée. Vérifie le justificatif.';
      end if;
      if p_reverse_base_cents is null or p_reverse_base_cents not between 1 and 999999999999
        or (item.currency='EUR' and p_reverse_base_cents>item.amount_cents)
        or p_reverse_rate is null or p_reverse_rate not in (2.1,5.5,10,20)
        or p_deductible_percent is null or p_deductible_percent not between 0 and 100 or round(p_deductible_percent,2)<>p_deductible_percent
        or p_reverse_region is null or p_reverse_region not in ('eu','non_eu') then
        raise exception 'Vérifie la base HT en euros, le taux, la part déductible et le pays du fournisseur.';
      end if;
      if item.currency<>'EUR' and length(trim(coalesce(p_conversion_note,'')))=0 then
        raise exception 'Précise le taux, la date et la source de conversion en euros.';
      end if;
      due:=round(p_reverse_base_cents::numeric*p_reverse_rate/100);
      retained:=round(due::numeric*p_deductible_percent/100);
      if due<=0 then raise exception 'Montant de TVA autoliquidée nul : vérifie la base.'; end if;
      if date_trunc('month',p_eligible_on)::date is distinct from p_period then
        raise exception 'L’autoliquidation doit être rattachée au mois d’exigibilité de la TVA.';
      end if;
    else
      if item.blocked_reason is not null or item.currency<>'EUR' then raise exception 'Ce cas doit être traité manuellement hors du module.'; end if;
      if retained is null or retained<=0 or retained>item.amount_cents then raise exception 'Montant de TVA retenu invalide.'; end if;
    end if;
    if p_period is null or extract(day from p_period)<>1 or p_period<date '2000-01-01' or p_period>date_trunc('month',today)::date then
      raise exception 'Mois de déclaration invalide.';
    end if;
    if p_eligible_on is null or p_eligible_on>today or p_eligible_on<date '2000-01-01'
      or date_trunc('month',p_eligible_on)::date>p_period
      or (p_vat_treatment='standard' and item.kind='invoice' and item.source_date is not null and p_eligible_on<item.source_date) then
      raise exception 'Vérifie la date d’exigibilité et le mois retenu.';
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
      item.linked_transaction_key:=matched.source_key;
    end if;
  end if;
  update public.vat_expenses set decision=p_decision,
    approved_cents=case when p_decision='approved' then retained else null end,
    deduction_period=case when p_decision='approved' then p_period else null end,
    eligible_on=case when p_decision='approved' then p_eligible_on else null end,
    reviewed_at=now(),review_fingerprint=case when p_decision='approved' then source_fingerprint else null end,
    review_note=coalesce(p_note,''),linked_transaction_key=item.linked_transaction_key,
    vat_treatment=case when p_decision='approved' then p_vat_treatment else 'standard' end,
    reverse_charge_base_cents=case when p_decision='approved' and p_vat_treatment='reverse_charge' then p_reverse_base_cents else null end,
    reverse_charge_rate=case when p_decision='approved' and p_vat_treatment='reverse_charge' then p_reverse_rate else null end,
    reverse_charge_due_cents=case when p_decision='approved' and p_vat_treatment='reverse_charge' then due else null end,
    deductible_percent=case when p_decision='approved' and p_vat_treatment='reverse_charge' then p_deductible_percent else 100 end,
    reverse_charge_region=case when p_decision='approved' and p_vat_treatment='reverse_charge' then p_reverse_region else null end,
    conversion_note=case when p_decision='approved' and p_vat_treatment='reverse_charge' then trim(coalesce(p_conversion_note,'')) else '' end
    where id=p_id and user_id=owner_id returning * into item;
  return to_jsonb(item);
end $$;
revoke all on function public.review_vat_expense(uuid,text,bigint,date,date,boolean,uuid,text,text,bigint,numeric,numeric,text,text) from public,anon;
grant execute on function public.review_vat_expense(uuid,text,bigint,date,date,boolean,uuid,text,text,bigint,numeric,numeric,text,text) to authenticated;

create or replace function public.apply_vat_deductions(p_period date,p_replace_manual boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  owner_id uuid:=auth.uid();
  target public.vat_months;
  snapshot jsonb;
  total bigint;
  rc_base bigint;
  rc_due bigint;
  rc_deductible bigint;
  invalid_reverse bigint;
begin
  if owner_id is null then raise exception 'Authentification requise.'; end if;
  if p_period is null or extract(day from p_period)<>1 or p_period<date '2000-01-01'
    or p_period>date_trunc('month',now() at time zone 'Europe/Paris')::date then raise exception 'Mois invalide.'; end if;
  insert into public.vat_months(user_id,period) values(owner_id,p_period) on conflict do nothing;
  select * into target from public.vat_months where user_id=owner_id and period=p_period for update;
  if target.declared then raise exception 'Ce mois est déjà déclaré. Aucune modification automatique : examine la régularisation nécessaire.'; end if;
  if target.deduction_source='manual' and (target.deductible<>0 or target.reverse_charge_due<>0) and p_replace_manual is distinct from true then
    raise exception 'Confirme le remplacement des montants manuels pour éviter un double comptage.';
  end if;
  with candidates as (
    select e.*, coalesce(e.review_fingerprint=e.source_fingerprint and not e.source_missing and e.auto_duplicate_of is null
      and e.duplicate_of is null and cardinality(e.attachment_ids)>0 and not e.credit_note and (
        (e.vat_treatment='standard' and e.blocked_reason is null and e.currency='EUR') or
        (e.vat_treatment='reverse_charge' and e.kind='invoice' and coalesce(e.vat_cents,0)=0
          and (e.blocked_reason is null or e.blocked_reason='Devise étrangère · traitement manuel'))),false) as valid
    from public.vat_expenses e where e.user_id=owner_id and e.deduction_period=p_period and e.decision='approved'
  )
  select coalesce(sum(approved_cents) filter(where valid),0),
    coalesce(sum(reverse_charge_base_cents) filter(where valid and vat_treatment='reverse_charge'),0),
    coalesce(sum(reverse_charge_due_cents) filter(where valid and vat_treatment='reverse_charge'),0),
    coalesce(sum(approved_cents) filter(where valid and vat_treatment='reverse_charge'),0),
    count(*) filter(where not valid and vat_treatment='reverse_charge'),
    coalesce(jsonb_agg(jsonb_build_object('id',id,'source_key',source_key,'document_key',document_key,
      'attachment_ids',attachment_ids,'linked_transaction_key',linked_transaction_key,'amount_cents',approved_cents,
      'fingerprint',source_fingerprint,'vat_treatment',vat_treatment,'reverse_charge_base_cents',reverse_charge_base_cents,
      'reverse_charge_due_cents',reverse_charge_due_cents,'reverse_charge_rate',reverse_charge_rate,
      'deductible_percent',deductible_percent,'reverse_charge_region',reverse_charge_region,'conversion_note',conversion_note,
      'eligible_on',eligible_on) order by id) filter(where valid),'[]'::jsonb)
    into total,rc_base,rc_due,rc_deductible,invalid_reverse,snapshot from candidates;
  if invalid_reverse>0 then raise exception 'Une autoliquidation est à revalider. Vérifie ou écarte explicitement la pièce avant de remplacer les montants du mois.'; end if;
  if exists(select 1 from jsonb_array_elements(snapshot) item group by item->>'document_key' having count(*)>1) then
    raise exception 'Une facture apparaît plusieurs fois : vérifie les doublons.';
  end if;
  if exists (
    select 1 from public.vat_months m cross join lateral jsonb_array_elements(m.deduction_snapshot) old
    cross join jsonb_array_elements(snapshot) item where m.user_id=owner_id and m.period<>p_period and (
      old->>'id'=item->>'id' or old->>'source_key'=item->>'source_key' or old->>'document_key'=item->>'document_key'
      or old->>'source_key'=item->>'linked_transaction_key' or item->>'source_key'=old->>'linked_transaction_key'
      or (old->'attachment_ids') ?| array(select jsonb_array_elements_text(item->'attachment_ids'))
    )
  ) then raise exception 'Un justificatif a déjà été utilisé sur un autre mois.'; end if;
  update public.vat_months set deductible=total::numeric/100,reverse_charge_base=rc_base::numeric/100,
    reverse_charge_due=rc_due::numeric/100,reverse_charge_deductible=rc_deductible::numeric/100,
    deduction_source='receipts',deduction_snapshot=snapshot,deduction_applied_at=now(),deduction_needs_review=false
    where user_id=owner_id and period=p_period returning * into target;
  return to_jsonb(target);
end $$;
notify pgrst,'reload schema';
