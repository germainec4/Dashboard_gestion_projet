# Scripts et imports locaux

Les scripts d'import et fichiers de donnees reels ne doivent pas etre suivis par Git.

Pour importer des donnees historiques :

1. Place le CSV source dans un dossier local ignore, par exemple `local-data/`.
2. Utilise uniquement des variables d'environnement pour les identifiants Supabase.
3. Genere un fichier SQL temporaire dans `local-data/` si necessaire.
4. Verifie le SQL avant execution dans Supabase.

Ne jamais commiter :

- des exports CSV clients ou missions ;
- des fichiers SQL contenant de vraies missions ;
- des cles API, tokens, UUID utilisateur personnels ou secrets `.env`.
