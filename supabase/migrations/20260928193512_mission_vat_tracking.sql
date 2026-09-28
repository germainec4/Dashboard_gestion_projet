-- Matches the applied remote migration. Historical prices remain HT and VAT-free.
alter table public.missions
  add column vat_rate numeric(5,2) not null default 0
  check (vat_rate in (0, 20));

create table public.vat_years (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year integer not null check (year between 2000 and 2200),
  deductible numeric(14,2) not null default 0 check (deductible >= 0),
  remitted numeric(14,2) not null default 0 check (remitted >= 0),
  opening_balance numeric(14,2) not null default 0,
  primary key (user_id, year)
);
alter table public.vat_years enable row level security;
revoke all on public.vat_years from anon, authenticated;
grant select, insert, update on public.vat_years to authenticated;
create policy "Owners read VAT balances" on public.vat_years
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners insert VAT balances" on public.vat_years
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update VAT balances" on public.vat_years
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
