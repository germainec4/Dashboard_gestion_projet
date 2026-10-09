import test from 'node:test';
import assert from 'node:assert/strict';
import { initVatPanel } from '../vat-panel.js';

const year = new Date().getFullYear();
const paid = (price, other = {}) => ({ price, vat_rate: 20, status: 'payee', date_payment: `${year}-01-01`, ...other });

function setup(t, missions) {
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const listeners = {};
  const feedback = {};
  const panel = {
    innerHTML: '',
    addEventListener: (type, handler) => { listeners[type] = handler; },
    querySelector: selector => selector === 'details' ? {} : feedback
  };
  const yearInput = {};
  globalThis.document = { getElementById: id => id === 'fiscalVatPanel' ? panel : yearInput };
  const state = { missions, reads: [], saves: [], changes: 0, saveError: null };
  const supabase = {
    from(table) {
      assert.equal(table, 'vat_years');
      const filters = {};
      let saved;
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        maybeSingle() { return new Promise(resolve => state.reads.push({ filters, resolve })); },
        upsert(data) { saved = data; state.saves.push(data); return this; },
        async single() { return { data: saved, error: state.saveError }; }
      };
    }
  };
  const api = initVatPanel(() => state.missions, 'test-user', supabase, () => { state.changes++; });
  const resolveRead = async (index, data = {}, error = null) => {
    state.reads[index].resolve({ data, error });
    await new Promise(resolve => setImmediate(resolve));
  };
  const save = async values => {
    const form = {
      reportValidity: () => true,
      elements: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }])),
      querySelector: () => ({})
    };
    await listeners.submit({ preventDefault() {}, target: form });
  };
  return { api, state, resolveRead, save };
}

test('Salary reserve waits for current-year adjustments and deducts remittances and deductible VAT', async t => {
  const { api, state, resolveRead } = setup(t, [paid(1000), paid(9000, { status: 'en_cours', date_payment: null, quote_accepted: true })]);
  assert.equal(api.getVatDue(), null);
  assert.deepEqual(state.reads[0].filters, { user_id: 'test-user', year });
  await resolveRead(0, { deductible: 20, remitted: 50, opening_balance: 10 });
  assert.equal(api.getVatDue(), 14000);
  assert.equal(state.changes, 2);
  state.missions.push(paid(500));
  assert.equal(api.getVatDue(), 24000);
});

test('Historical VAT is covered by the opening balance, and viewing another year does not change the salary reserve', async t => {
  const { api, state, resolveRead } = setup(t, [paid(1000), paid(5000, { date_payment: `${year - 1}-12-31` })]);
  await resolveRead(0, { opening_balance: 100 });
  assert.equal(api.getVatDue(), 30000);
  const refresh = api.refresh(year - 1);
  assert.equal(api.getVatDue(), 30000);
  await resolveRead(1, { remitted: 1000 });
  await refresh;
  assert.equal(state.reads[1].filters.year, year - 1);
  assert.equal(api.getVatDue(), 30000);
});

test('A credit never increases available cash and a year without an adjustment record uses zero adjustments', async t => {
  const { api, resolveRead } = setup(t, [paid(1000)]);
  await resolveRead(0, { deductible: 250 });
  assert.equal(api.getVatDue(), 0);
  const refresh = api.refresh(year, true);
  assert.equal(api.getVatDue(), null);
  await resolveRead(1, null);
  await refresh;
  assert.equal(api.getVatDue(), 20000);
});

test('Loading failures and inconsistent taxable missions make the estimate unavailable; retry restores it', async t => {
  const { api, state, resolveRead } = setup(t, [paid(1000)]);
  await resolveRead(0, null, new Error('Offline'));
  assert.equal(api.getVatDue(), null);
  const refresh = api.refresh(year, true);
  await resolveRead(1);
  await refresh;
  assert.equal(api.getVatDue(), 20000);
  state.missions.push(paid(200, { date_payment: null }));
  assert.equal(api.getVatDue(), null);
});

test('Saving VAT remittances updates the salary reserve and notifies the dashboard; a failed save keeps the saved amount', async t => {
  const { api, state, resolveRead, save } = setup(t, [paid(1000)]);
  await resolveRead(0);
  await save({ deductible: '20', remitted: '50', opening_balance: '10' });
  assert.equal(api.getVatDue(), 14000);
  assert.equal(state.changes, 3);
  assert.deepEqual(state.saves[0], { user_id: 'test-user', year, deductible: 20, remitted: 50, opening_balance: 10 });
  state.saveError = new Error('Save failed');
  await save({ deductible: '20', remitted: '150', opening_balance: '10' });
  assert.equal(api.getVatDue(), 14000);
  assert.equal(state.changes, 3);
});
