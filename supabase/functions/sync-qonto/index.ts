import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const QONTO_API_URL = 'https://thirdparty.qonto.com/v2/transactions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } }
    )

    // 1. Récupérer les identifiants Qonto depuis les variables d'environnement
    const loginId = Deno.env.get('QONTO_LOGIN_ID')
    const secretKey = Deno.env.get('QONTO_SECRET_KEY')

    console.log('QONTO_LOGIN_ID set:', !!loginId)
    console.log('QONTO_SECRET_KEY set:', !!secretKey)

    if (!loginId || !secretKey) {
      throw new Error('Identifiants Qonto manquants dans les secrets Supabase')
    }

    // 2. Récupérer l'organisation pour avoir son slug
    console.log('Récupération des infos organisation Qonto...')
    const orgRes = await fetch('https://thirdparty.qonto.com/v2/organization', {
      headers: {
        'Authorization': `${loginId}:${secretKey}`,
        'Accept': 'application/json'
      }
    })

    if (!orgRes.ok) {
      const errorText = await orgRes.text()
      throw new Error(`Erreur Qonto (Organization): ${errorText}`)
    }

    const { organization } = await orgRes.json()
    const orgSlug = organization.slug
    console.log(`Organisation trouvée: ${orgSlug}`)

    // 3. Récupérer le compte bancaire
    console.log('Récupération des comptes bancaires Qonto...')
    const accountsRes = await fetch(`https://thirdparty.qonto.com/v2/bank_accounts?slug=${orgSlug}`, {
      headers: {
        'Authorization': `${loginId}:${secretKey}`,
        'Accept': 'application/json'
      }
    })

    if (!accountsRes.ok) {
      const errorText = await accountsRes.text()
      throw new Error(`Erreur Qonto (Comptes): ${errorText}`)
    }

    const { bank_accounts } = await accountsRes.json()
    if (!bank_accounts || bank_accounts.length === 0) {
      throw new Error('Aucun compte bancaire trouvé sur Qonto')
    }

    const accountSlug = bank_accounts[0].slug
    console.log(`Compte trouvé: ${accountSlug}`)

    // 4. Appeler l'API Qonto pour les transactions
    console.log('Appel API Qonto (Transactions)...')
    const qontoRes = await fetch(`${QONTO_API_URL}?status[]=completed&side=credit&slug=${accountSlug}&iban=${bank_accounts[0].iban}`, {
      headers: {
        'Authorization': `${loginId}:${secretKey}`,
        'Accept': 'application/json'
      }
    })

    if (!qontoRes.ok) {
      const errorText = await qontoRes.text()
      console.error('Erreur API Qonto:', qontoRes.status, errorText)
      throw new Error(`Erreur Qonto (${qontoRes.status}): ${errorText}`)
    }

    const { transactions } = await qontoRes.json()
    console.log(`Transactions Qonto récupérées: ${transactions.length}`)

    // 5. Récupérer les missions non payées ET les IDs Qonto déjà utilisés
    const { data: pendingMissions, error: fetchError } = await supabase
      .from('missions')
      .select('*')
      .neq('status', 'payee')

    const { data: matchedIds, error: idsError } = await supabase
      .from('missions')
      .select('qonto_id')
      .not('qonto_id', 'is', null)

    if (fetchError || idsError) {
      console.error('Erreur Supabase Fetch:', fetchError || idsError)
      throw fetchError || idsError
    }

    const usedQontoIds = new Set(matchedIds.map(m => m.qonto_id))
    console.log(`Missions en attente: ${pendingMissions?.length ?? 0}`)
    console.log(`IDs Qonto déjà utilisés: ${usedQontoIds.size}`)

    const potentialMatches = []
    const processedTxIds = new Set()

    // 6. Logique de Matching
    for (const tx of transactions) {
      const qontoAmount = parseFloat(tx.amount.toString())
      const txDate = tx.settled_at.split('T')[0]
      const txId = tx.transaction_id

      if (usedQontoIds.has(txId)) continue
      
      const fullLabel = `${tx.label} ${tx.reference || ''}`.trim()

      // Trouver toutes les missions qui correspondent au montant
      const matches = pendingMissions.filter(m => {
        const missionPrice = parseFloat(m.price.toString())
        return Math.abs(missionPrice - qontoAmount) < 0.01
      })

      if (matches.length > 0) {
        matches.forEach(m => {
          potentialMatches.push({
            mission_id: m.id,
            mission_title: m.title,
            mission_status: m.status,
            transaction_id: txId,
            transaction_label: fullLabel,
            transaction_date: txDate,
            amount: qontoAmount
          })
        })
        processedTxIds.add(txId)
      }
    }

    console.log(`Synchronisation terminée. Potentiels: ${potentialMatches.length} / Transactions traitées: ${processedTxIds.size}`)
    
    return new Response(JSON.stringify({ 
      message: 'Recherche terminée', 
      potentialMatches,
      count: potentialMatches.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Catch Error Final:', error.message)
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
