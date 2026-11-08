# Suivi TVA

- Le montant d’une mission reste **HT**. La case TVA ajoute 20 %, arrondis au centime, et affiche le TTC. Les anciennes missions restent sans TVA.
- Les frais saisis séparément ne sont pas automatiquement taxés. Inclure les frais facturés soumis à TVA dans le montant HT du devis ; ne pas les compter deux fois.
- CA, projections et déclaration Urssaf restent hors taxes. Le rapprochement Qonto compare le paiement au TTC de la mission.
- « TVA mensuelle » remplace la vue annuelle et les seuils TVA. Elle suit les missions intégralement payées, par **mois d’encaissement**. Les acomptes/paiements partiels et l’option TVA sur les débits ne sont pas gérés. Une mission impayée n’alimente jamais la TVA encaissée.
- Le mois courant est sélectionné par défaut à l’ouverture de la TVA mensuelle, y compris lors d’une réouverture et du passage à une nouvelle année. Il affiche une provision. La déclaration et le règlement du mois M sont présentés en M+1, sans inventer de date limite fiscale.
- Solde calculé du mois = TVA collectée + TVA due par autoliquidation − TVA déductible totale − crédit reporté − crédit initial complémentaire. Les crédits passent automatiquement au mois suivant, y compris de décembre à janvier. Ils n’effacent pas une déclaration antérieure encore impayée. Le crédit initial complémentaire sert uniquement à reprendre un crédit absent de l’historique ; ne pas ressaisir un report déjà calculé.
- Chaque mois conserve son état de déclaration, son **solde réellement déclaré facultatif** (+ dû / − crédit), ses dates et sa note. Une déclaration sans solde renseigné reste estimée. Un solde déclaré renseigné est conservé si les missions changent ; un écart avec le calcul courant est signalé.
- Un prélèvement attendu n’est pas un paiement. Le montant réellement débité et la date effective du débit sont saisis ensemble après confirmation sur Qonto. Le versement est rattaché au mois de la déclaration, même s’il intervient le mois suivant. Un trop-versé est signalé sans devenir automatiquement un crédit fiscal.
- Les mois de salaire d’avance réservent le reste à payer de **tous les mois suivis**, y compris les années précédentes et le mois courant, indépendamment des filtres affichés. Un crédit TVA n’augmente pas la trésorerie disponible. L’estimation est indisponible en cas de chargement, erreur, données incohérentes ou reprise annuelle non confirmée.
- Les données mensuelles sont enregistrées dans `vat_months`, isolées par utilisateur. Les anciennes données de `vat_years` restent consultables en archives. Un ajustement annuel non nul demande une répartition manuelle par mois puis une confirmation de reprise ; il n’est jamais réparti ni compté deux fois automatiquement. La déclaration Urssaf et ses paramètres restent trimestriels.
- L’outil ne déclare ni ne verse la TVA et ne détermine pas la date d’assujettissement. Cocher la TVA uniquement lorsqu’elle est applicable.

## Justificatifs et TVA déductible

- Bloc « TVA déductible et justificatifs » fermé par défaut, sous le récapitulatif mensuel. Il propose les dépenses à documenter, les factures à vérifier, les validations et les éléments écartés. Un compteur discret signale les éléments à traiter.
- « Actualiser depuis Qonto » lit les dépenses complétées du mois et les factures fournisseurs, dont les commissions Malt réglées par compensation. La synchronisation est paginée et idempotente. Elle ne lance aucun paiement et ne modifie aucune donnée Qonto.
- Les PDF restent dans Qonto. L’aperçu lit le fichier au moment de l’ouverture, après authentification et vérification du propriétaire, puis l’affiche en mémoire dans le navigateur ; aucun fichier ni lien temporaire n’est stocké. La version PDF lisible est privilégiée sur l’original XML des factures électroniques. L’accès au compte Qonto est explicitement rattaché au propriétaire du dashboard, et non à tout utilisateur inscrit.
- Les informations de TVA proviennent de Qonto ; aucun taux de 20 % n’est inventé. Une facture présente sans montant extrait peut être complétée à la main. Une pièce absente, un avoir, une devise étrangère ou un cas particulier ne sont pas validés automatiquement.
- La validation demande le montant retenu, la date du droit à déduction, le mois retenu et la confirmation de la vérification de la facture et de l’usage professionnel. Un rapprochement avec une dépense de même montant peut être confirmé dans le suivi. Les numéros de factures et les justificatifs partagés évitent un double comptage entre facture fournisseur et transaction bancaire.
- « Utiliser le total validé » remplace le total du mois, sans addition répétée. Un montant manuel existant nécessite une confirmation explicite de remplacement. Un mois déjà déclaré n’est jamais modifié par cette action. Les justificatifs déjà utilisés sur un autre mois sont refusés.
- Une modification d’un justificatif utilisé invalide sa validation. Pour un mois ouvert déjà alimenté, la réserve de trésorerie devient indisponible jusqu’à la vérification et la réapplication du total. Les montants des déclarations déjà effectuées sont conservés.
- `vat_expenses` contient les références Qonto et les décisions, isolées par RLS. `qonto_vat_connections` est un registre réservé au serveur, sans accès client. La fonction `vat-expenses` authentifie explicitement chaque appel avant toute lecture bancaire.

## Vérification

`node --test tests/*.test.js`

51 tests Node : calculs HT/TTC, périodes mensuelles, encaissements, crédits, réserve de trésorerie, erreurs de chargement/sauvegarde, import des commissions, montants absents, multi-taux, doublons facture/transaction, paiement de plusieurs factures, sources modifiées, priorité au PDF lisible des factures électroniques, autoliquidation et non-régression Urssaf.

`tests/vat-deductions.sql` vérifie les validations et l’application en base dans une transaction annulée : justificatif et confirmation requis, montant valide, application idempotente, remplacement manuel explicite, protection des mois déclarés, justificatifs déjà utilisés, invalidation après modification et isolation entre utilisateurs. Aucun élément de test n’est conservé.

Migration additive `20261108081159_monthly_vat_tracking.sql` appliquée. Lecture, insertion/upsert et mise à jour authentifiées vérifiées dans des transactions annulées ; un autre utilisateur ne voit aucune ligne. Contrôle de sécurité : aucune nouvelle alerte. Vérification visuelle du sélecteur mensuel et du passage déclaration → paiement avec un aperçu local en mémoire.

Migration additive `20260928193512_mission_vat_tracking.sql` appliquée au projet Dashboard_Gestionprojet. Sauvegarde/lecture et isolation RLS vérifiées dans une transaction annulée, sans données de test conservées. Fonction Qonto existante mise à jour pour comparer le TTC, sans modifier les transactions bancaires.

Contrôle de sécurité Supabase : pas d’alerte sur les tables TVA ; alerte Auth préexistante concernant la [protection contre les mots de passe compromis désactivée](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun réglage Auth modifié.

## Références

- [Exigibilité de la TVA sur les prestations de services](https://bofip.impots.gouv.fr/bofip/283-PGP.html/identifiant=BOI-TVA-BASE-20-20-20181107)
- [Déduction de TVA sur les achats](https://www.impots.gouv.fr/professionnel/questions/comment-deduire-la-tva-sur-mes-achats)

## Autoliquidation de services étrangers

- Une case « Autoliquidation » apparaît dans le formulaire des factures sans TVA facturée, dans le bloc discret existant. Aucune classification ou validation automatique par marque. Le lieu d’établissement peut être proposé pour les raisons sociales OpenAI Ireland Limited et Render Services Inc, mais reste à vérifier sur chaque pièce.
- La base HT en euros, le taux français (20 % proposé, modifiable), la part déductible de 0 à 100 %, l’établissement UE/hors UE, la date d’exigibilité et le mois sont confirmés par l’utilisateur. L’exigibilité d’un service autoliquidé ne se déduit pas de la seule date du débit bancaire ; le mois doit correspondre à la date d’exigibilité confirmée. La date de réalisation peut précéder l’émission de la facture.
- Pour une facture en devise, la base fiscale en euros et une note précisant le taux, la date et la source de conversion sont obligatoires. Aucune conversion au montant bancaire frais compris ou au cours actuel n’est inventée. Les devises restent exclues des déductions ordinaires.
- Le serveur calcule et arrondit séparément la TVA due et sa part déductible. La déduction autoliquidée est **incluse** dans la TVA déductible totale ; elle n’est jamais retranchée deux fois. Une facture de 100 € HT au taux de 20 % entièrement déductible ajoute 20 € dus et 20 € déductibles, effet net nul. Avec un droit à déduction nul, les 20 € dus entrent dans la réserve de trésorerie.
- « Utiliser ces montants pour le mois » remplace simultanément la déduction totale, la base HT autoliquidée et la TVA due/déductible d’autoliquidation. Le récapitulatif distingue les bases UE et hors UE sans figer des numéros de lignes CA3 susceptibles d’évoluer. La carte de TVA encaissée continue à représenter les seuls encaissements clients.
- Les données sont enregistrées dans `vat_expenses`, et les montants appliqués et le détail auditable dans `vat_months`. Les ajustements manuels permettent de renseigner aussi la contrepartie due : une déduction autoliquidée isolée est refusée. Les déclarations antérieures ne sont pas recalculées par l’application des justificatifs.
- Une autoliquidation approuvée dont la source change bloque le remplacement des montants jusqu’à revalidation ou décision explicite. La TVA due n’est pas supprimée silencieusement. Les contrôles d’authentification, RLS, justificatif, doublons et mois déjà déclaré restent actifs.
- Migration `20261108100005_vat_reverse_charge.sql`. `tests/vat-reverse-charge.sql` vérifie en transaction annulée le calcul serveur, les déductions partielle/nulle, les devises, l’idempotence, le mois d’exigibilité, la source périmée et la conservation d’octobre déclaré. La suite SQL ordinaire passe également.
- [Prestations entre assujettis : achats auprès de fournisseurs étrangers](https://www.impots.gouv.fr/professionnel/prestations-entre-assujettis)
