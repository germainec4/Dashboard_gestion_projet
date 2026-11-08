import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { deduplicateExpenses, normalizeInvoice, normalizeTransaction, expenseDay, parisDay } from '../_shared/vat-expenses.js';

const sourceColumns = 'source_key,kind,source_id,supplier,reference,source_date,payment_date,proposed_period,amount_cents,currency,vat_cents,attachment_ids,file_name,document_key,credit_note,provider_duplicate,blocked_reason,auto_duplicate_of,source_missing,source_fingerprint,synced_at';
const base = 'https://thirdparty.qonto.com/v2';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function envKey(name: string, legacy: string) {
  const raw = Deno.env.get(name);
  if (raw) { try { const key = JSON.parse(raw).default; if (key) return key; } catch { /* use the legacy environment fallback */ } }
  return Deno.env.get(legacy) || '';
}

Deno.serve(async (request: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store'
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentification requise.' }, 401);
    const url = Deno.env.get('SUPABASE_URL') || '';
    const client = createClient(url, envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (authError || !user) return json({ error: 'Session expirée. Reconnecte-toi.' }, 401);
    const admin = createClient(url, envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: connection, error: connectionError } = await admin.from('qonto_vat_connections')
      .select('organization_id').eq('user_id', user.id).eq('enabled', true).maybeSingle();
    if (connectionError) throw new Error('Connexion Qonto indisponible.');
    if (!connection) return json({ error: 'Aucune connexion Qonto autorisée pour ce compte.' }, 403);
    const login = Deno.env.get('QONTO_LOGIN_ID');
    const secret = Deno.env.get('QONTO_SECRET_KEY');
    if (!login || !secret) throw new Error('Connexion Qonto non configurée.');
    const qonto = async (path: string, params: URLSearchParams = new URLSearchParams()) => {
      const response = await fetch(`${base}${path}?${params}`, {
        headers: { Authorization: `${login}:${secret}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Lecture Qonto indisponible (${response.status}). Réessaie ultérieurement.`);
      return response.json();
    };
    // The server credential is shared by the app, not by every registered user.
    // Bind it to an explicitly authorized user AND verify the organization upstream.
    const { organization } = await qonto('/organization');
    if (organization?.id !== connection.organization_id) return json({ error: 'La connexion Qonto ne correspond pas à ce compte.' }, 403);
    const body = await request.json();
    if (body.action === 'document') {
      if (!uuid.test(body.id || '')) return json({ error: 'Justificatif invalide.' }, 400);
      const { data: item, error: itemError } = await client.from('vat_expenses').select('attachment_ids').eq('id', body.id).eq('user_id', user.id).maybeSingle();
      if (itemError || !item?.attachment_ids?.length) return json({ error: 'Aucun justificatif accessible pour cette dépense.' }, 404);
      const id = item.attachment_ids[0];
      if (!uuid.test(id)) throw new Error('Référence du justificatif invalide.');
      const { attachment } = await qonto(`/attachments/${encodeURIComponent(id)}`);
      const documentUrl = attachment?.url || attachment?.file_url;
      if (!documentUrl || new URL(documentUrl).protocol !== 'https:') throw new Error('Le justificatif est momentanément indisponible.');
      return json({ url: documentUrl });
    }
    if (body.action !== 'sync') return json({ error: 'Action invalide.' }, 400);
    const period = expenseDay(body.period);
    const today = parisDay(new Date().toISOString())!;
    if (!period || !period.endsWith('-01') || period < '2000-01-01' || period > `${today.slice(0, 7)}-01`) {
      return json({ error: 'Mois invalide.' }, 400);
    }
    const list = async (path: string, key: string, params = new URLSearchParams()) => {
      const rows: any[] = [];
      for (let page = 1; page <= 100; page++) {
        const query = new URLSearchParams(params);
        query.set('page', String(page)); query.set('per_page', '100');
        const result = await qonto(path, query);
        if (!Array.isArray(result[key])) throw new Error('Réponse Qonto incomplète. Aucune nouvelle donnée importée.');
        rows.push(...result[key]);
        if (result.meta?.next_page == null && (result[key].length < 100 || result.meta?.total_pages === page)) return rows;
        if (result.meta?.next_page === null) return rows;
      }
      throw new Error('Volume Qonto trop important pour une synchronisation complète.');
    };
    const startedAt = new Date().toISOString();
    const [accounts, invoices] = await Promise.all([
      list('/bank_accounts', 'bank_accounts'), list('/supplier_invoices', 'supplier_invoices')
    ]);
    const active = accounts.filter(account => account.status === 'active');
    const accountsToRead = active.length ? active : accounts;
    if (!accountsToRead.length) throw new Error('Aucun compte Qonto accessible.');
    const start = new Date(`${period}T00:00:00Z`);
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(end.getUTCDate() + 1);
    start.setUTCDate(start.getUTCDate() - 1);
    const transactions: any[] = [];
    for (const account of accountsToRead) {
      const params = new URLSearchParams({ bank_account_id: account.id, side: 'debit',
        settled_at_from: start.toISOString(), settled_at_to: end.toISOString(), sort_by: 'settled_at:asc' });
      params.append('status[]', 'completed'); params.append('includes[]', 'attachments'); params.append('includes[]', 'vat_details');
      transactions.push(...await list('/transactions', 'transactions', params));
    }
    const previous: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from('vat_expenses').select(sourceColumns).eq('user_id', user.id).order('source_key').range(offset, offset + 999);
      if (error) throw new Error('Impossible de lire les justificatifs enregistrés.');
      previous.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
    const fresh = [
      ...invoices.map(invoice => normalizeInvoice(invoice, period)),
      ...transactions.map(transaction => normalizeTransaction(transaction, organization.legal_name || organization.name))
        .filter((row): row is NonNullable<ReturnType<typeof normalizeTransaction>> => row !== null && row.proposed_period === period)
    ];
    const incoming = new Map(fresh.map(row => [row.source_key, { ...row, synced_at: startedAt }]));
    const previousByKey = new Map(previous.map(row => [row.source_key, row]));
    for (const row of previous) {
      if (incoming.has(row.source_key)) continue;
      const fullyRead = row.kind === 'invoice' || row.proposed_period === period;
      incoming.set(row.source_key, { ...row, source_missing: fullyRead ? true : row.source_missing });
    }
    const normalized = deduplicateExpenses([...incoming.values()]).map((row: ReturnType<typeof normalizeInvoice>) => ({ ...row, user_id: user.id }));
    // One upsert statement; source fields only. Human decisions are never overwritten.
    if (normalized.length) {
      const { error } = await admin.from('vat_expenses').upsert(normalized, { onConflict: 'user_id,source_key', defaultToNull: false });
      if (error) throw new Error('Impossible d’enregistrer la synchronisation. Réessaie.');
    }
    return json({ synced_at: startedAt, imported: fresh.length, new_items: fresh.filter(row => !previousByKey.has(row.source_key)).length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronisation indisponible.';
    console.error('vat-expenses:', message);
    return json({ error: message }, 400);
  }
});
