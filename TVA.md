# Suivi TVA

- Le montant d’une mission reste **HT**. La case TVA ajoute 20 %, arrondis au centime, et affiche le TTC. Les anciennes missions restent sans TVA.
- Les frais saisis séparément ne sont pas automatiquement taxés. Inclure les frais facturés soumis à TVA dans le montant HT du devis ; ne pas les compter deux fois.
- CA, projections et déclaration Urssaf restent hors taxes. Le rapprochement Qonto compare le paiement au TTC de la mission.
- « TVA collectée » suit les missions intégralement payées, par date de paiement. Les acomptes/paiements partiels et l’option TVA sur les débits ne sont pas gérés. Une mission impayée n’alimente jamais la TVA encaissée.
- Solde estimé = TVA encaissée + solde au 1er janvier − TVA déductible − TVA déjà reversée. Les trois ajustements sont des **totaux annuels** saisis manuellement, enregistrés dans Supabase par utilisateur/année. Le report d’une année sur l’autre est manuel. Un solde négatif ne déclenche aucune demande de remboursement.
- Les mois de salaire d’avance déduisent aussi le reste à reverser de l’année en cours, quel que soit le filtre trimestriel du dashboard. Un crédit TVA n’augmente pas le solde disponible. L’estimation attend le chargement des ajustements et reste indisponible si le suivi TVA est en erreur ou contient des missions à vérifier.
- L’outil ne déclare ni ne verse la TVA et ne détermine pas la date d’assujettissement. Cocher la TVA uniquement lorsqu’elle est applicable.

## Vérification

`node --test tests/*.test.js`

Tests : arrondis, HT/TTC, historique sans TVA, encaissements, années, devis impayés, dates invalides/futures, déductions, versements, solde créditeur, réserve TVA pour les salaires et non-régression Urssaf.

Migration additive `20260928193512_mission_vat_tracking.sql` appliquée au projet Dashboard_Gestionprojet. Sauvegarde/lecture et isolation RLS vérifiées dans une transaction annulée, sans données de test conservées. Fonction Qonto existante mise à jour pour comparer le TTC, sans modifier les transactions bancaires.

Contrôle de sécurité Supabase : pas d’alerte sur les tables TVA ; alerte Auth préexistante concernant la [protection contre les mots de passe compromis désactivée](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun réglage Auth modifié.

## Références

- [Exigibilité de la TVA sur les prestations de services](https://bofip.impots.gouv.fr/bofip/283-PGP.html/identifiant=BOI-TVA-BASE-20-20-20181107)
- [Déduction de TVA sur les achats](https://www.impots.gouv.fr/professionnel/questions/comment-deduire-la-tva-sur-mes-achats)
