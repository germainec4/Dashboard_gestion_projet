// Monetary calculations use cents. Only actual, dated payments enter declarations.
export function cents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function day(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value || '');
  if (!match) return null;
  const date = new Date(+match[1], +match[2] - 1, +match[3]);
  return date.getFullYear() === +match[1] && date.getMonth() === +match[2] - 1 && date.getDate() === +match[3] ? date : null;
}

export function declarationWindow(year, quarter, now = new Date()) {
  const start = new Date(year, (quarter - 1) * 3, 1);
  const opening = new Date(year, quarter * 3, 1);
  const deadline = new Date(year, quarter * 3 + 1, 0);
  const afterDeadline = new Date(year, quarter * 3 + 1, 1);
  return { start, end: new Date(year, quarter * 3, 0), opening, deadline,
    state: now < opening ? 'upcoming' : now < afterDeadline ? 'open' : 'closed' };
}

export function defaultPeriod(now = new Date()) {
  // During a declaration month, show the quarter that can currently be declared.
  const date = now.getMonth() % 3 === 0 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now;
  return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 };
}

export function summarizeMissions(missions, year, quarter, { includeCosts = false } = {}, now = new Date()) {
  const window = declarationWindow(year, quarter, now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = { window, payments: [], issues: [], total: 0, annual: 0, previous: 0, committed: 0, potential: 0, costs: 0 };
  for (const mission of missions) {
    const price = cents(mission.price);
    const costs = cents(mission.debours);
    const payment = day(mission.date_payment);
    let issue = '';
    if (price === null || price < 0 || (includeCosts && (costs === null || costs < 0))) issue = 'Montant invalide';
    else if (mission.status === 'payee' && !payment) issue = 'Mission payée sans date de paiement valide';
    else if (mission.status !== 'payee' && mission.date_payment) issue = 'Date de paiement présente mais statut non payé';
    else if (payment && payment > today) issue = 'Date de paiement future';
    if (issue) { result.issues.push({ mission, reason: issue }); continue; }
    const amount = price + (includeCosts ? costs : 0);
    if (mission.status === 'payee') {
      if (payment.getFullYear() === year) result.annual += amount;
      if (payment.getFullYear() === year - 1) result.previous += amount;
      if (payment >= window.start && payment < window.opening) {
        result.payments.push({ mission, payment, amount });
        result.total += amount;
        result.costs += costs || 0;
      }
    } else if (mission.quote_accepted) result.committed += amount;
    else if (mission.quote_sent) result.potential += amount;
  }
  result.payments.sort((a, b) => a.payment - b.payment);
  return result;
}

export function calendarEvent(year, quarter) {
  const { opening, deadline } = declarationWindow(year, quarter);
  const stamp = date => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const after = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate() + 1);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dashboard//Declarations//FR', 'BEGIN:VEVENT',
    `UID:declaration-${year}-T${quarter}@dashboard.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${stamp(opening)}`, `DTEND;VALUE=DATE:${stamp(after)}`,
    `SUMMARY:Déclaration URSSAF T${quarter} ${year}`,
    'DESCRIPTION:Vérifier le CA encaissé HT puis déclarer et payer sur autoentrepreneur.urssaf.fr.',
    'BEGIN:VALARM', 'TRIGGER;RELATED=END:-P3D', 'ACTION:DISPLAY', 'DESCRIPTION:Déclaration URSSAF à terminer',
    'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].map(foldCalendarLine).join('\r\n');
}

function foldCalendarLine(line) {
  let result = '';
  let length = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (length + bytes > 75) { result += '\r\n '; length = 1; }
    result += char;
    length += bytes;
  }
  return result;
}

export function paymentsCsv(summary, settings) {
  // Prevent user-entered titles from being interpreted as spreadsheet formulas.
  const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, match => "'" + match).replace(/"/g, '""')}"`;
  const rows = [['Mission', 'Client', 'Date encaissement', 'Montant retenu EUR'],
    ...summary.payments.map(({ mission, amount }) => [mission.title, mission.client, mission.date_payment, (amount / 100).toFixed(2).replace('.', ',')]),
    ['TOTAL', '', '', (summary.total / 100).toFixed(2).replace('.', ',')],
    ['Base', settings.includeCosts ? 'Prix + frais refacturés' : 'Prix uniquement', settings.confirmed ? 'Confirmée par utilisateur' : 'À vérifier', '']];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
