# Dashboard Gestion Projets

Dashboard personnel pour piloter les taches, projets, calendrier et suivi comptable freelance.

## Stack

- Vite
- JavaScript vanilla
- Supabase Auth + Database
- Supabase Edge Function pour la synchronisation Qonto
- Google Calendar OAuth + FullCalendar
- Chart.js pour les indicateurs comptables

## Configuration

1. Installer les dependances :

```bash
npm install
```

2. Creer un fichier `.env` a partir de `.env.example` :

```bash
cp .env.example .env
```

3. Renseigner les variables frontend :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID`

4. Configurer les secrets Supabase pour la fonction Qonto :

```bash
supabase secrets set OWNER_USER_ID=...
supabase secrets set QONTO_LOGIN_ID=...
supabase secrets set QONTO_SECRET_KEY=...
```

`OWNER_USER_ID` doit correspondre a l'utilisateur Supabase autorise a synchroniser les missions Qonto.

## Base de donnees

Les migrations Supabase sont dans `supabase/migrations/`.

La migration P0 est additive : elle cree les tables manquantes et ajoute les colonnes attendues par le code sans supprimer de donnees.

## Lancer

```bash
npm run dev
```

Puis ouvrir l'URL Vite affichee dans le terminal.

## Securite

Ne pas commiter :

- `.env`
- exports CSV clients ou missions
- fichiers SQL contenant de vraies missions
- cles API ou tokens

Si une cle a deja ete commitee dans l'historique Git, elle doit etre revoquee cote service.
