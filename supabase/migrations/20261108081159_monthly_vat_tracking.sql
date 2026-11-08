-- Additive migration: retain annual data for explicit reconciliation.
alter table public.vat_years add column monthly_reconciled boolean not null default false;
create table public.vat_months (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period date not null check (extract(day from period) = 1 and period between date '2000-01-01' and date '2200-12-01'),
  deductible numeric(14,2) not null default 0 check (deductible >= 0),
  opening_credit numeric(14,2) not null default 0 check (opening_credit >= 0),
  declared boolean not null default false,
  declared_balance numeric(14,2),
  declared_on date,
  remitted numeric(14,2) not null default 0 check (remitted >= 0),
  payment_date date,
  expected_payment_date date,
  note text not null default '' check (length(note) <= 2000),
  primary key (user_id, period),
  check (declared or (declared_balance is null and declared_on is null and remitted = 0 and payment_date is null and expected_payment_date is null)),
  check ((remitted > 0) = (payment_date is not null)),
  check (declared_on is null or declared_on >= (period + interval '1 month')::date),
  check (payment_date is null or payment_date >= (period + interval '1 month')::date),
  check (expected_payment_date is null or expected_payment_date >= (period + interval '1 month')::date),
  check (declared_on is null or payment_date is null or payment_date >= declared_on)
);
alter table public.vat_months enable row level security;
revoke all on public.vat_months from anon, authenticated;
grant select, insert, update on public.vat_months to authenticated;
create policy "Owners read monthly VAT" on public.vat_months
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners insert monthly VAT" on public.vat_months
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update monthly VAT" on public.vat_months
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
