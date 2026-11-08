# Suivi TVA

- Le montant d’une mission reste **HT**. La case TVA ajoute 20 %, arrondis au centime, et affiche le TTC. Les anciennes missions restent sans TVA.
- Les frais saisis séparément ne sont pas automatiquement taxés. Inclure les frais facturés soumis à TVA dans le montant HT du devis ; ne pas les compter deux fois.
- CA, projections et déclaration Urssaf restent hors taxes. Le rapprochement Qonto compare le paiement au TTC de la mission.
- « TVA mensuelle » remplace la vue annuelle et les seuils TVA. Elle suit les missions intégralement payées, par **mois d’encaissement**. Les acomptes/paiements partiels et l’option TVA sur les débits ne sont pas gérés. Une mission impayée n’alimente jamais la TVA encaissée.
- Le mois précédent est sélectionné à l’ouverture ; le mois courant affiche une provision. La déclaration et le règlement du mois M sont présentés en M+1, sans inventer de date limite fiscale.
- Solde calculé du mois = TVA collectée − TVA déductible − crédit reporté − crédit initial complémentaire. Les crédits passent automatiquement au mois suivant, y compris de décembre à janvier. Ils n’effacent pas une déclaration antérieure encore impayée. Le crédit initial complémentaire sert uniquement à reprendre un crédit absent de l’historique ; ne pas ressaisir un report déjà calculé.
- Chaque mois conserve son état de déclaration, son **solde réellement déclaré facultatif** (+ dû / − crédit), ses dates et sa note. Une déclaration sans solde renseigné reste estimée. Un solde déclaré renseigné est conservé si les missions changent ; un écart avec le calcul courant est signalé.
- Un prélèvement attendu n’est pas un paiement. Le montant réellement débité et la date effective du débit sont saisis ensemble après confirmation sur Qonto. Le versement est rattaché au mois de la déclaration, même s’il intervient le mois suivant. Un trop-versé est signalé sans devenir automatiquement un crédit fiscal.
- Les mois de salaire d’avance réservent le reste à payer de **tous les mois suivis**, y compris les années précédentes et le mois courant, indépendamment des filtres affichés. Un crédit TVA n’augmente pas la trésorerie disponible. L’estimation est indisponible en cas de chargement, erreur, données incohérentes ou reprise annuelle non confirmée.
- Les données mensuelles sont enregistrées dans `vat_months`, isolées par utilisateur. Les anciennes données de `vat_years` restent consultables en archives. Un ajustement annuel non nul demande une répartition manuelle par mois puis une confirmation de reprise ; il n’est jamais réparti ni compté deux fois automatiquement. La déclaration Urssaf et ses paramètres restent trimestriels.
- L’outil ne déclare ni ne verse la TVA et ne détermine pas la date d’assujettissement. Cocher la TVA uniquement lorsqu’elle est applicable.

## Vérification

`node --test tests/*.test.js`

29 tests : arrondis, HT/TTC, historique sans TVA, périodes mensuelles, passage décembre/janvier, paiements décalés, crédit sur plusieurs mois, déclaration sans paiement, montant déclaré conservé, dates invalides/futures, reprise annuelle, erreurs de chargement/sauvegarde, réserve pour les salaires et non-régression Urssaf.

Migration additive `20261108081159_monthly_vat_tracking.sql` appliquée. Lecture, insertion/upsert et mise à jour authentifiées vérifiées dans des transactions annulées ; un autre utilisateur ne voit aucune ligne. Contrôle de sécurité : aucune nouvelle alerte. Vérification visuelle du sélecteur mensuel et du passage déclaration → paiement avec un aperçu local en mémoire.

Migration additive `20260928193512_mission_vat_tracking.sql` appliquée au projet Dashboard_Gestionprojet. Sauvegarde/lecture et isolation RLS vérifiées dans une transaction annulée, sans données de test conservées. Fonction Qonto existante mise à jour pour comparer le TTC, sans modifier les transactions bancaires.

Contrôle de sécurité Supabase : pas d’alerte sur les tables TVA ; alerte Auth préexistante concernant la [protection contre les mots de passe compromis désactivée](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun réglage Auth modifié.

## Références

- [Exigibilité de la TVA sur les prestations de services](https://bofip.impots.gouv.fr/bofip/283-PGP.html/identifiant=BOI-TVA-BASE-20-20-20181107)
- [Déduction de TVA sur les achats](https://www.impots.gouv.fr/professionnel/questions/comment-deduire-la-tva-sur-mes-achats)
