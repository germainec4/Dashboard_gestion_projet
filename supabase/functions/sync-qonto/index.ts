import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const QONTO_API_URL = 'https://thirdparty.qonto.com/v2/transactions'

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 1. Récupérer les identifiants Qonto depuis les variables d'environnement
    const loginId = Deno.env.get('QONTO_LOGIN_ID')
    const secretKey = Deno.env.get('QONTO_SECRET_KEY')

    if (!loginId || !secretKey) {
      throw new Error('Identifiants Qonto manquants dans les secrets Supabase')
    }

    // 2. Appeler l'API Qonto pour les transactions entrantes terminées
    const qontoRes = await fetch(`${QONTO_API_URL}?status[]=completed&side=credit`, {
      headers: {
        'Authorization': `${loginId}:${secretKey}`,
        'Accept': 'application/json'
      }
    })

    if (!qontoRes.ok) {
      const error = await qontoRes.text()
      throw new Error(`Erreur Qonto: ${error}`)
    }

    const { transactions } = await qontoRes.json()

    // 3. Récupérer les missions non payées depuis Supabase
    const { data: pendingMissions, error: fetchError } = await supabase
      .from('missions')
      .select('*')
      .neq('status', 'payee')

    if (fetchError) throw fetchError

    const updates = []
    const results = { matched: 0, processed: transactions.length }

    // 4. Logique de Matching
    for (const tx of transactions) {
      const amount = tx.amount // Qonto renvoie le montant en Euros (float)
      const txDate = tx.settled_at.split('T')[0]
      const txId = tx.transaction_id
      const label = tx.label.toLowerCase()

      // On cherche une mission qui correspond au montant exact
      const match = pendingMissions.find(m => 
        Number(m.price) === Number(amount) && 
        !updates.find(u => u.id === m.id) // Éviter de matcher deux fois la même mission
      )

      if (match) {
        // Mise à jour de la mission
        const { error: updateError } = await supabase
          .from('missions')
          .update({ 
            status: 'payee', 
            date_payment: txDate,
            qonto_id: txId,
            bank_label: tx.label
          })
          .eq('id', match.id)

        if (!updateError) {
          updates.push({ id: match.id, title: match.title, amount })
          results.matched++
        }
      }
    }

    return new Response(JSON.stringify({ 
      message: 'Synchronisation terminée', 
      results,
      updates 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
