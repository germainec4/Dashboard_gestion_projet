import test from 'node:test';
import assert from 'node:assert/strict';
import { initVatPanel } from '../vat-panel.js';
import { defaultVatPeriod, vatPeriod } from '../vat-monthly.js';

const now = new Date();
const period = defaultVatPeriod(now);
const currentPeriod = vatPeriod(now);
const today = `${currentPeriod.slice(0, 8)}${String(now.getDate()).padStart(2, '0')}`;
const paid = (price, date = period) => ({ title: '<Mission>', price, vat_rate: 20, status: 'payee', date_payment: date });

function setup(t, missions = [paid(1000), paid(500, currentPeriod)]) {
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const listeners = {}, feedback = {}, editor = {}, controls = { fiscalYear: {}, fiscalMonth: {} };
  const panel = { innerHTML: '', addEventListener: (type, handler) => { listeners[type] = handler; },
    querySelector: selector => selector === '[data-vat-editor]' ? editor : feedback, querySelectorAll: () => [] };
  globalThis.document = { getElementById: id => id === 'fiscalVatPanel' ? panel : controls[id] };
  const state = { missions, reads: [], saves: [], changes: 0, saveError: null };
  const supabase = { from(table) {
    const filters = {};
    let saved;
    return {
      select() { return this; }, eq(key, value) { filters[key] = value; return this; }, order() { return this; },
      range() { return new Promise(resolve => state.reads.push({ table, filters, resolve })); },
      upsert(data) { saved = data; state.saves.push(data); return this; },
      async single() { return { data: saved, error: state.saveError }; }
    };
  } };
  const api = initVatPanel(() => state.missions, 'test-user', supabase, () => { state.changes++; });
  const resolveReads = async (records = [], legacy = [], error = null, offset = 0) => {
    state.reads[offset].resolve({ data: records, error });
    state.reads[offset + 1].resolve({ data: legacy, error: null });
    await new Promise(resolve => setImmediate(resolve));
  };
  const save = async (values = {}) => {
    const defaults = { deductible: '0', reverse_charge_base: '0', reverse_charge_due: '0', reverse_charge_deductible: '0', opening_credit: '0', declared_balance: '', declared_on: '',
      remitted: '0', payment_date: '', expected_payment_date: '', note: '' };
    const elements = Object.fromEntries(Object.entries({ ...defaults, ...values }).map(([name, value]) => [name, { value }]));
    elements.declared = { checked: values.declared ?? true };
    await listeners.submit({ preventDefault() {}, target: { closest: () => null, reportValidity: () => true, elements, querySelector: () => feedback } });
  };
  return { api, state, resolveReads, save, panel, feedback, controls };
}

test('Reserve waits for both monthly and legacy records, and includes previous and current months', async t => {
  const { api, state, resolveReads, panel } = setup(t);
  assert.equal(api.getVatDue(), null);
  assert.deepEqual(state.reads.map(read => read.table), ['vat_months', 'vat_years']);
  assert.ok(state.reads.every(read => read.filters.user_id === 'test-user'));
  await resolveReads([{ period, deductible: 50 }]);
  assert.equal(api.getVatDue(), 25000);
  assert.match(panel.innerHTML, /TVA collectée du mois/);
  assert.match(panel.innerHTML, /&lt;Mission&gt;/);
  state.missions.push(paid(100));
  assert.equal(api.getVatDue(), 27000);
});

test('Changing the viewed month or year never removes outstanding months from the reserve', async t => {
  const { api, resolveReads } = setup(t);
  await resolveReads();
  await api.refresh(`${now.getFullYear() - 1}-12-01`);
  assert.equal(api.getVatDue(), 30000);
  await api.refresh(currentPeriod);
  assert.equal(api.getVatDue(), 30000);
});

test('Marking a declaration does not settle it; a confirmed debit changes the reserve', async t => {
  const { api, state, resolveReads, save, panel, controls } = setup(t);
  await resolveReads();
  await save({ declared_balance: '150', deductible: '50', expected_payment_date: today });
  assert.equal(api.getVatDue(), 25000);
  assert.match(panel.innerHTML, /prélèvement en attente/);
  assert.equal(state.saves[0].period, period);
  assert.equal(state.saves[0].remitted, 0);
  await save({ declared_balance: '150', deductible: '50', remitted: '150', payment_date: today });
  assert.equal(api.getVatDue(), 10000);
  assert.match(panel.innerHTML, /Payée/);
  assert.equal(controls.fiscalMonth.disabled, false);
  state.saveError = new Error('Offline');
  await save({ declared_balance: '200' });
  assert.equal(api.getVatDue(), 10000);
});

test('A failed load blocks the reserve; a forced refresh restores it', async t => {
  const { api, resolveReads } = setup(t);
  await resolveReads([], [], new Error('Offline'));
  assert.equal(api.getVatDue(), null);
  const refresh = api.refresh(period, true);
  await resolveReads([], [], null, 2);
  await refresh;
  assert.equal(api.getVatDue(), 30000);
});

test('Credits do not increase cash and unreconciled archives or invalid missions block the reserve', async t => {
  const { api, state, resolveReads } = setup(t);
  await resolveReads([{ period, deductible: 400 }]);
  assert.equal(api.getVatDue(), 0);
  state.missions.push({ ...paid(100), date_payment: null });
  assert.equal(api.getVatDue(), null);
  state.missions.pop();
  const refresh = api.refresh(period, true);
  await resolveReads([], [{ year: now.getFullYear() - 1, remitted: 50 }], null, 2);
  await refresh;
  assert.equal(api.getVatDue(), null);
});

test('Validation errors never write payment data to Supabase', async t => {
  const { state, resolveReads, save, feedback } = setup(t);
  await resolveReads();
  await save({ remitted: '200' });
  assert.equal(state.saves.length, 0);
  assert.match(feedback.textContent, /date de débit/);
});

test('An open month with changed applied receipts blocks the reserve; a declared snapshot stays fixed', async t => {
  const { api, resolveReads } = setup(t);
  await resolveReads([{ period, deductible: 50, deduction_source: 'receipts', deduction_needs_review: true }]);
  assert.equal(api.getVatDue(), null);
  const refresh = api.refresh(period, true);
  await resolveReads([{ period, deductible: 50, declared: true, deduction_needs_review: true }], [], null, 2);
  await refresh;
  assert.equal(api.getVatDue(), 25000);
});
