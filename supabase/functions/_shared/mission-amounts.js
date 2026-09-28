// Shared by the dashboard and bank reconciliation. price always remains HT.
export function missionAmounts(mission) {
  const price = Number(String(mission.price ?? 0).replace(/\s/g, '').replace(',', '.'));
  const rate = Number(mission.vat_rate ?? 0);
  if (!Number.isFinite(price) || price < 0 || ![0, 20].includes(rate)) return null;
  const net = Math.round(price * 100);
  const vat = Math.round(net * rate / 100);
  return { net, vat, gross: net + vat, rate };
}
