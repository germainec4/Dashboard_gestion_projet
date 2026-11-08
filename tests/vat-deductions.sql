-- Run inside a transaction as postgres with request.jwt.claim.sub set to an
-- existing test owner. The caller MUST roll back; this suite does not commit.
insert into public.vat_expenses(user_id,source_key,kind,source_id,supplier,source_date,proposed_period,
  amount_cents,currency,vat_cents,attachment_ids,document_key,source_fingerprint)
values
  (auth.uid(),'invoice:vat-test-a','invoice','test-a','Test supplier','2026-09-15','2026-09-01',1200,'EUR',200,array['test-pdf-a'],'test-invoice-a','v1'),
  (auth.uid(),'invoice:vat-test-b','invoice','test-b','Test supplier','2026-09-15','2026-09-01',1200,'EUR',200,array['test-pdf-a'],'test-invoice-b','v1'),
  (auth.uid(),'transaction:vat-test-missing','transaction','test-missing','Test missing','2026-09-15','2026-09-01',1200,'EUR',200,'{}','test-missing','v1');

set local role authenticated;
do $$
declare item uuid; missing uuid; failed boolean; result jsonb;
begin
  select id into item from public.vat_expenses where source_key='invoice:vat-test-a';
  select id into missing from public.vat_expenses where source_key='transaction:vat-test-missing';
  failed:=false;
  begin perform public.review_vat_expense(item,'approved',150,'2026-09-01','2026-09-15',false); exception when others then failed:=true; end;
  if not failed then raise exception 'Unchecked proof accepted'; end if;
  failed:=false;
  begin perform public.review_vat_expense(missing,'approved',150,'2026-09-01','2026-09-15',true); exception when others then failed:=true; end;
  if not failed then raise exception 'Missing proof accepted'; end if;
  failed:=false;
  begin perform public.review_vat_expense(item,'approved',1300,'2026-09-01','2026-09-15',true); exception when others then failed:=true; end;
  if not failed then raise exception 'Excess VAT accepted'; end if;
  failed:=false;
  begin update public.vat_expenses set amount_cents=99999 where id=item; exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Client can alter imported financial data'; end if;
  perform public.review_vat_expense(item,'approved',150,'2026-09-01','2026-09-15',true);
  result:=public.apply_vat_deductions('2026-09-01');
  if (result->>'deductible')::numeric<>1.50 then raise exception 'Incorrect approved total'; end if;
  result:=public.apply_vat_deductions('2026-09-01');
  if (result->>'deductible')::numeric<>1.50 then raise exception 'Repeated application doubled the deduction'; end if;
  failed:=false;
  begin perform public.review_vat_expense(item,'approved',150,'2026-11-01','2026-09-15',true); exception when others then failed:=true; end;
  if not failed then raise exception 'Applied proof moved to another month'; end if;
  insert into public.vat_months(user_id,period,deductible) values(auth.uid(),'2026-08-01',5) on conflict(user_id,period) do update set deductible=5,deduction_source='manual';
  failed:=false;
  begin perform public.apply_vat_deductions('2026-08-01'); exception when others then failed:=true; end;
  if not failed then raise exception 'Manual total silently replaced'; end if;
  result:=public.apply_vat_deductions('2026-08-01',true);
  if (result->>'deductible')::numeric<>0 then raise exception 'Manual replacement did not use the exact validated total'; end if;
  failed:=false;
  begin perform public.apply_vat_deductions('2026-10-01'); exception when others then failed:=true; end;
  if not failed then raise exception 'Declared October changed'; end if;
end $$;

reset role;
update public.vat_expenses set source_fingerprint='v2' where user_id=auth.uid() and source_key='invoice:vat-test-a';
set local role authenticated;
do $$
declare item uuid; second uuid; failed boolean; result jsonb;
begin
  if not (select deduction_needs_review from public.vat_months where user_id=auth.uid() and period='2026-09-01') then raise exception 'Changed source did not invalidate the open month'; end if;
  result:=public.apply_vat_deductions('2026-09-01');
  if (result->>'deductible')::numeric<>0 then raise exception 'Stale approval counted'; end if;
  select id into item from public.vat_expenses where source_key='invoice:vat-test-a';
  select id into second from public.vat_expenses where source_key='invoice:vat-test-b';
  perform public.review_vat_expense(item,'approved',200,'2026-09-01','2026-09-15',true);
  perform public.apply_vat_deductions('2026-09-01');
  perform public.review_vat_expense(second,'approved',200,'2026-11-01','2026-09-15',true);
  failed:=false;
  begin perform public.apply_vat_deductions('2026-11-01'); exception when others then failed:=true; end;
  if not failed then raise exception 'Same attachment deducted across months'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare failed boolean;
begin
  if (select count(*) from public.vat_expenses)<>0 then raise exception 'RLS exposed another owner'; end if;
  failed:=false;
  begin perform 1 from public.qonto_vat_connections; exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Bank authorization registry exposed to a client'; end if;
end $$;
reset role;
select 'all deduction and isolation checks passed; caller must roll back' as verification;
