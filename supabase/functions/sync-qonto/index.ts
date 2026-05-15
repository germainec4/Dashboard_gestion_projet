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
    const ownerUserId = Deno.env.get('OWNER_USER_ID')

    console.log('QONTO_LOGIN_ID set:', !!loginId)
    console.log('QONTO_SECRET_KEY set:', !!secretKey)
    console.log('OWNER_USER_ID set:', !!ownerUserId)

    if (!loginId || !secretKey) {
      throw new Error('Identifiants Qonto manquants dans les secrets Supabase')
    }
    if (!ownerUserId) {
      throw new Error('OWNER_USER_ID manquant dans les secrets Supabase')
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
      .eq('user_id', ownerUserId)
      .neq('status', 'payee')

    const { data: matchedIds, error: idsError } = await supabase
      .from('missions')
      .select('qonto_id')
      .eq('user_id', ownerUserId)
      .not('qonto_id', 'is', null)

    if (fetchError || idsError) {
      console.error('Erreur Supabase Fetch:', fetchError || idsError)
      throw fetchError || idsError
    }

    const usedQontoIds = new Set(matchedIds.map(m => m.qonto_id))
    console.log(`Missions en attente: ${pendingMissions?.length ?? 0}`)
    console.log(`IDs Qonto déjà utilisés: ${usedQontoIds.size}`)

    const updates = []
    const results = { matched: 0, processed: transactions.length }

    // 6. Logique de Matching Robuste
    for (const tx of transactions) {
      const qontoAmount = parseFloat(tx.amount.toString())
      const txDate = tx.settled_at.split('T')[0]
      const txId = tx.transaction_id

      // SÉCURITÉ : Si ce virement a déjà été utilisé pour une mission, on l'ignore
      if (usedQontoIds.has(txId)) {
        console.log(`Transaction ${txId} déjà traitée par le passé. Skip.`)
        continue
      }
      
      // On combine Label et Référence pour avoir le maximum d'infos (ex: "Malt" + "Facture #123")
      const fullLabel = `${tx.label} ${tx.reference || ''}`.trim()
      const searchString = fullLabel.toLowerCase()

      console.log(`Analyse transaction Qonto: ${fullLabel} | Montant: ${qontoAmount}€`)

      // Trouver toutes les missions qui correspondent au montant
      const potentialMatches = pendingMissions.filter(m => {
        const missionPrice = parseFloat(m.price.toString())
        const isAlreadyMatched = updates.find(u => u.id === m.id)
        return Math.abs(missionPrice - qontoAmount) < 0.01 && !isAlreadyMatched
      })

      let finalMatch = null

      if (potentialMatches.length === 1) {
        // Un seul match par montant, on valide
        finalMatch = potentialMatches[0]
      } else if (potentialMatches.length > 1) {
        // Plusieurs missions au même montant ! On doit départager par le texte
        console.log(`Conflit : ${potentialMatches.length} missions trouvées pour ${qontoAmount}€. Recherche dans "${fullLabel}"...`)
        
        finalMatch = potentialMatches.find(m => {
          const title = m.title.toLowerCase()
          const client = (m.client || '').toLowerCase()
          const ref = (m.external_ref || '').toLowerCase()
          
          // 1. Match direct par ID (si déjà lié auparavant ou via Réf)
          if (m.qonto_id === txId || m.external_ref === txId) return true
          
        // 2. Match par texte intelligent (Mots-clés)
          if (title) {
            // On nettoie le titre pour extraire les mots significatifs
            const keywords = title
              .replace(/[:.,!?-]/g, ' ') // Enlever la ponctuation
              .split(' ')
              .filter(word => word.length > 3) // Garder les mots de plus de 3 lettres
              .filter(word => !['test', 'mission', 'projet'].includes(word.toLowerCase())) // Ignorer les mots génériques
            
            // Si l'un des mots-clés du titre est dans le libellé Qonto
            const hasKeywordMatch = keywords.some(word => searchString.includes(word.toLowerCase()))
            if (hasKeywordMatch) return true
          }

          // 3. Match par client ou référence externe
          return (ref && searchString.includes(ref)) || 
                 (client && searchString.includes(client))
        })

        if (!finalMatch) {
          console.warn(`Impossible de départager les missions pour le virement de ${qontoAmount}€. Aucune mise à jour effectuée.`)
          continue
        }
      }

      if (finalMatch) {
        console.log(`Match validé ! Mission "${finalMatch.title}" correspond au virement de ${qontoAmount}€`)
        const { error: updateError } = await supabase
          .from('missions')
          .update({ 
            status: 'payee', 
            date_payment: txDate,
            qonto_id: txId,
            bank_label: fullLabel // On stocke le libellé complet pour historique
          })
          .eq('id', finalMatch.id)
          .eq('user_id', ownerUserId)

        if (!updateError) {
          updates.push({ id: finalMatch.id, title: finalMatch.title, amount: qontoAmount })
          results.matched++
        } else {
          console.error(`Erreur update mission ${finalMatch.id}:`, updateError)
        }
      }
    }

    console.log(`Synchronisation terminée. Matches: ${results.matched} / Processed: ${transactions.length}`)
    
    return new Response(JSON.stringify({ 
      message: 'Synchronisation terminée', 
      results,
      updates 
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
