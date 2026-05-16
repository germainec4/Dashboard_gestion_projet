import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type QontoBankAccount = {
  status?: string
  balance_cents?: number | string | null
  authorized_balance_cents?: number | string | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Utilisateur non authentifié')
    }

    const loginId = Deno.env.get('QONTO_LOGIN_ID')
    const secretKey = Deno.env.get('QONTO_SECRET_KEY')

    if (!loginId || !secretKey) {
      throw new Error('Identifiants Qonto manquants dans les secrets Supabase')
    }

    const orgRes = await fetch('https://thirdparty.qonto.com/v2/organization', {
      headers: {
        'Authorization': `${loginId}:${secretKey}`,
        'Accept': 'application/json',
      },
    })

    if (!orgRes.ok) {
      const errorText = await orgRes.text()
      throw new Error(`Erreur Qonto (Organization): ${errorText}`)
    }

    const { organization } = await orgRes.json()
    const bankAccounts: QontoBankAccount[] = organization?.bank_accounts ?? []
    const activeAccounts = bankAccounts.filter((account) => account.status === 'active')
    const accountsToTotal = activeAccounts.length > 0 ? activeAccounts : bankAccounts

    const balanceCents = accountsToTotal.reduce((sum: number, account: QontoBankAccount) => {
      return sum + Number(account.balance_cents ?? 0)
    }, 0)

    const authorizedBalanceCents = accountsToTotal.reduce((sum: number, account: QontoBankAccount) => {
      return sum + Number(account.authorized_balance_cents ?? 0)
    }, 0)

    return new Response(JSON.stringify({
      balance_cents: balanceCents,
      authorized_balance_cents: authorizedBalanceCents,
      accounts_count: accountsToTotal.length,
      updated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('Qonto balance error:', message)
    return new Response(JSON.stringify({
      error: message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
