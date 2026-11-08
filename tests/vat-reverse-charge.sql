-- Execute with the existing owner's JWT sub in a transaction, then ROLLBACK.
insert into public.vat_expenses(user_id,source_key,kind,source_id,supplier,source_date,proposed_period,
  amount_cents,currency,vat_cents,attachment_ids,document_key,source_fingerprint,blocked_reason)
values
  (auth.uid(),'invoice:rc-test-eur','invoice','rc-eur','Test software','2026-07-01','2026-07-01',10000,'EUR',0,array['rc-eur-proof'],'rc-eur-doc','v1',null),
  (auth.uid(),'invoice:rc-test-usd','invoice','rc-usd','Test hosting','2026-07-02','2026-07-01',760,'USD',0,array['rc-usd-proof'],'rc-usd-doc','v1','Devise étrangère · traitement manuel'),
  (auth.uid(),'invoice:rc-test-tax','invoice','rc-tax','Test with tax','2026-07-01','2026-07-01',12000,'EUR',2000,array['rc-tax-proof'],'rc-tax-doc','v1',null);
set local role authenticated;
do $$
declare item uuid; foreign_item uuid; tax_item uuid; failed boolean; result jsonb;
begin
  select id into item from public.vat_expenses where source_key='invoice:rc-test-eur';
  select id into foreign_item from public.vat_expenses where source_key='invoice:rc-test-usd';
  select id into tax_item from public.vat_expenses where source_key='invoice:rc-test-tax';
  failed:=false;
  begin perform public.review_vat_expense(tax_item,'approved',2000,'2026-07-01','2026-07-01',true,null,'','reverse_charge',10000,20,100,'eu');
    exception when others then failed:=true; end;
  if not failed then raise exception 'Already taxed invoice accepted as reverse charge'; end if;
  failed:=false;
  begin perform public.review_vat_expense(item,'approved',2000,'2026-08-01','2026-07-01',true,null,'','reverse_charge',10000,20,100,'eu');
    exception when others then failed:=true; end;
  if not failed then raise exception 'Reverse charge shifted to another month'; end if;
  failed:=false;
  begin perform public.review_vat_expense(item,'approved',2000,'2026-07-01','2026-07-01',true,null,'','reverse_charge',10000,0,100,'eu');
    exception when others then failed:=true; end;
  if not failed then raise exception 'Invalid reverse charge rate accepted'; end if;
  failed:=false;
  begin perform public.review_vat_expense(item,'approved',2000,'2026-07-01','2026-07-01',true,null,'','reverse_charge',10000,20,100,null);
    exception when others then failed:=true; end;
  if not failed then raise exception 'Unknown supplier region accepted'; end if;
  -- Server calculates both entries; a forged client amount is ignored.
  result:=public.review_vat_expense(item,'approved',1,'2026-07-01','2026-07-01',true,null,'','reverse_charge',10000,20,100,'eu');
  if (result->>'approved_cents')::bigint<>2000 or (result->>'reverse_charge_due_cents')::bigint<>2000 then raise exception 'Server failed to calculate both entries'; end if;
  result:=public.apply_vat_deductions('2026-07-01');
  if (result->>'deductible')::numeric<>20 or (result->>'reverse_charge_due')::numeric<>20 or (result->>'reverse_charge_base')::numeric<>100 then raise exception 'Unbalanced full reverse charge'; end if;
  result:=public.apply_vat_deductions('2026-07-01');
  if (result->>'reverse_charge_due')::numeric<>20 then raise exception 'Repeated apply doubled reverse charge'; end if;
  perform public.review_vat_expense(item,'approved',0,'2026-07-01','2026-07-01',true,null,'','reverse_charge',10000,20,50,'eu');
  result:=public.apply_vat_deductions('2026-07-01');
  if (result->>'deductible')::numeric<>10 or (result->>'reverse_charge_due')::numeric<>20 then raise exception 'Partial deduction removed VAT due'; end if;
  perform public.review_vat_expense(item,'approved',0,'2026-07-01','2026-07-01',true,null,'','reverse_charge',10000,20,0,'eu');
  result:=public.apply_vat_deductions('2026-07-01');
  if (result->>'deductible')::numeric<>0 or (result->>'reverse_charge_due')::numeric<>20 then raise exception 'Zero deduction removed VAT due'; end if;
  failed:=false;
  begin perform public.review_vat_expense(foreign_item,'approved',100,'2026-07-01','2026-07-02',true,null,'','reverse_charge',700,20,100,'non_eu');
    exception when others then failed:=true; end;
  if not failed then raise exception 'Foreign currency accepted without conversion evidence'; end if;
  perform public.review_vat_expense(foreign_item,'approved',0,'2026-07-01','2026-07-02',true,null,'','reverse_charge',700,20,100,'non_eu','Taux et date vérifiés');
  result:=public.apply_vat_deductions('2026-07-01');
  if (result->>'deductible')::numeric<>1.40 or (result->>'reverse_charge_due')::numeric<>21.40 then raise exception 'Converted EUR base not used'; end if;
  if jsonb_array_length(result->'deduction_snapshot')<>2 then raise exception 'Audit snapshot incomplete'; end if;
end $$;
reset role;
update public.vat_expenses set source_fingerprint='v2' where user_id=auth.uid() and source_key='invoice:rc-test-usd';
set local role authenticated;
do $$
declare failed boolean:=false;
begin
  begin perform public.apply_vat_deductions('2026-07-01'); exception when others then failed:=true; end;
  if not failed then raise exception 'Stale reverse charge silently removed tax due'; end if;
  if not(select deduction_needs_review from public.vat_months where user_id=auth.uid() and period='2026-07-01') then raise exception 'Stale reverse charge did not invalidate reserve'; end if;
  if (select reverse_charge_due from public.vat_months where user_id=auth.uid() and period='2026-07-01')<>21.40 then raise exception 'Stale source changed applied amounts'; end if;
  if not(select declared and deductible=0 and reverse_charge_due=0 from public.vat_months where user_id=auth.uid() and period='2026-10-01') then raise exception 'Existing declared October altered'; end if;
end $$;
reset role;
select 'reverse-charge checks passed; caller must roll back' as verification;
