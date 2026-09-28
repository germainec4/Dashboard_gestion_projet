import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, day, defaultPeriod, declarationWindow, summarizeMissions, calendarEvent, paymentsCsv } from '../fiscal-model.js';

const now = new Date(2026, 9, 10);
const paid = (date_payment, price = 100, other = {}) => ({ title: 'Mission', status: 'payee', date_payment, price, ...other });

test('Each quarter opens the following month and closes on its last day, including year rollover', () => {
  for (const [quarter, opening, deadline] of [[1, '2026-04-01', '2026-04-30'], [2, '2026-07-01', '2026-07-31'], [3, '2026-10-01', '2026-10-31'], [4, '2027-01-01', '2027-01-31']]) {
    const window = declarationWindow(2026, quarter, now);
    assert.equal(+window.opening, +day(opening));
    assert.equal(+window.deadline, +day(deadline));
    assert.equal(declarationWindow(2026, quarter, day(opening)).state, 'open');
    assert.equal(declarationWindow(2026, quarter, new Date(+day(deadline) + 23 * 3600000)).state, 'open');
  }
  assert.equal(declarationWindow(2026, 3, day('2026-09-30')).state, 'upcoming');
  assert.equal(declarationWindow(2026, 3, day('2026-11-01')).state, 'closed');
});

test('Defaults to the quarter open for declaration, otherwise the current quarter', () => {
  assert.deepEqual(defaultPeriod(day('2027-01-15')), { year: 2026, quarter: 4 });
  assert.deepEqual(defaultPeriod(day('2026-10-31')), { year: 2026, quarter: 3 });
  assert.deepEqual(defaultPeriod(day('2026-09-28')), { year: 2026, quarter: 3 });
});

test('Declaration uses payment boundaries, regardless of validation quarter', () => {
  const summary = summarizeMissions([
    paid('2026-06-30', 500), paid('2026-07-01', 100, { date_validation: '2026-04-01' }),
    paid('2026-09-30', 200), paid('2026-10-01', 300), paid('2025-09-01', 400),
    { status: 'terminee', price: 1000, date_validation: '2026-09-01' }
  ], 2026, 3, {}, now);
  assert.equal(summary.total, 30000);
  assert.equal(summary.annual, 110000);
  assert.equal(summary.previous, 40000);
  assert.equal(summary.payments.length, 2);
});

test('Missing, invalid, future and inconsistent payment dates are excluded and flagged', () => {
  const summary = summarizeMissions([paid(null), paid('2026-02-30'), paid('2026-11-01'),
    { status: 'terminee', price: 200, date_payment: '2026-09-01' }, paid('2026-09-01', 'bad')], 2026, 3, {}, now);
  assert.equal(summary.total, 0);
  assert.equal(summary.issues.length, 5);
  assert.equal(day('2026-13-01'), null);
  assert.equal(day('2026-02-29'), null);
  assert.ok(day('2024-02-29'));
});

test('Amounts use cents and costs are added only when explicitly selected', () => {
  const missions = [paid('2026-09-01', '1 200,10', { debours: 20.2 }), paid('2026-09-02', 0.2)];
  assert.equal(summarizeMissions(missions, 2026, 3, {}, now).total, 120030);
  assert.equal(summarizeMissions(missions, 2026, 3, { includeCosts: true }, now).total, 122050);
  assert.equal(cents('bad'), null);
});

test('Accepted quotes and sent quotes are disjoint and never part of actual receipts', () => {
  const summary = summarizeMissions([
    { status: 'en_cours', price: 100, quote_sent: true, quote_accepted: true },
    { status: 'pas_commence', price: 200, quote_sent: true },
    { status: 'pas_commence', price: 900 },
    paid('2026-09-01', 300, { quote_sent: true, quote_accepted: true })
  ], 2026, 3, {}, now);
  assert.equal(summary.total, 30000);
  assert.equal(summary.committed, 10000);
  assert.equal(summary.potential, 20000);
});

test('An empty period shows zero and historic receipts do not depend on today’s year', () => {
  assert.equal(summarizeMissions([], 2026, 3, {}, now).total, 0);
  assert.equal(summarizeMissions([paid('2025-12-31', 80)], 2025, 4, {}, now).total, 8000);
});

test('Agenda event covers the full declaration window, including January of the next year', () => {
  const ics = calendarEvent(2026, 4);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270101\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270201\r\n'));
  assert.ok(ics.includes('TRIGGER;RELATED=END:-P3D'));
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
});

test('CSV preserves exact amounts, quotes, accents and prevents formula injection', () => {
  const summary = summarizeMissions([paid('2026-09-01', 123.45, { title: '=FORMULA()', client: 'Client "été"; test' })], 2026, 3, {}, now);
  const csv = paymentsCsv(summary, { confirmed: false, includeCosts: false });
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=FORMULA()"'));
  assert.ok(csv.includes('"Client ""été""; test"'));
  assert.ok(csv.includes('"TOTAL";"";"";"123,45"'));
  assert.ok(csv.includes('À vérifier'));
});
