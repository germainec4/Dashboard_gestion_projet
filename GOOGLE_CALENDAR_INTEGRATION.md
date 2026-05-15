# Documentation de l'Intégration Google Calendar

Ce document détaille le fonctionnement technique du lien entre le Dashboard et Google Calendar. Il est conçu pour permettre à un agent IA de comprendre, maintenir ou faire évoluer cette intégration.

---

## 1. Authentification (OAuth2)
- **Méthode** : Utilisation de **Google Identity Services (GSI)** pour l'authentification côté client (Implicit Flow).
- **Configuration** : Le `CLIENT_ID` est stocké dans l'environnement (`VITE_GOOGLE_CLIENT_ID`).
- **Scopes requis** : `https://www.googleapis.com/auth/calendar.events` (Lecture/Écriture des événements).
- **Persistence** : Le `access_token` est stocké en mémoire (`googleAccessToken`) après connexion. L'UI affiche un bouton "Google Connecté" ou "Se connecter à Google".

## 2. Chargement des Données
La fonction `fetchGoogleEvents` orchestre la récupération :
1. **Multi-calendriers** : Récupère les événements du calendrier principal (`primary`) et d'un calendrier secondaire identifié par son nom (ex: "Decathlon - Sync").
2. **Plage temporelle** : Basée sur la vue actuelle de FullCalendar (ex: la semaine en cours).
3. **Mapping** : Les données brutes de l'API sont transformées en objets compatibles FullCalendar.

## 3. Système de Tâches (Checklist)
L'intégration traite certains événements comme des tâches interactives basées sur une convention de titrage :
- **Détection** :
    - Si le titre commence par `☐` → Tâche à faire (`isGoogleTask: true`, `isTaskCompleted: false`).
    - Si le titre commence par `✅` → Tâche terminée (`isGoogleTask: true`, `isTaskCompleted: true`).
- **Rendu Custom (`eventContent`)** :
    - Affiche une **checkbox cliquable** à gauche du titre.
    - Le titre est affiché en premier, l'heure en dessous (si la place le permet).
    - Les tâches terminées ont un style barré et une opacité réduite.
- **Interactivité (Toggle)** :
    - Un clic sur la checkbox déclenche `toggleTaskCompletion`.
    - Cette fonction envoie une requête `PATCH` à l'API Google Calendar pour modifier le `summary` (ex: remplace `☐ Faire les courses` par `✅ Faire les courses`).
    - L'UI est mise à jour instantanément avant même le retour de l'API pour une sensation de fluidité.

## 4. Interaction avec le Dashboard (Drag & Drop)
Le lien avec le système de gestion de projet interne :
- **Time-Blocking** : Les tâches du dashboard (sidebar droite) peuvent être glissées sur le calendrier.
- **Création** : Lors du drop (`eventReceive`), un nouvel événement est créé via `POST` sur l'API Google Calendar.
- **Mapping des Piliers** : La couleur de la bordure gauche est déterminée par le "Pillier" de la tâche dashboard (Engineer, Design, Commerce, etc.).

## 5. Opérations CRUD
- **Mise à jour (Move/Resize)** : Déclenche `updateGoogleEvent` (`PATCH` sur les horaires).
- **Précision** : Le calendrier est configuré sur des **tranches de 15 minutes** (`slotDuration: '00:15:00'`).
- **Suppression** : Utilise une modale de confirmation custom avant d'envoyer un `DELETE` à l'API.
- **Édition** : Le bouton "Modifier" ouvre directement la page d'édition native de Google Calendar (`calendar.google.com/.../eventedit/...`) dans un nouvel onglet.

## 6. Structure des Classes CSS
- `fc-event-source-primary` vs `fc-event-source-decathlon` : Gère la couleur de fond du rectangle.
- `fc-event-pillar-[nom]` : Gère la couleur de la bordure gauche (4px).
- `fc-google-task` : Applique les bordures pointillées (dashed).
- `fc-task-done` : Applique le style barré et l'opacité.

---

## Guide pour un Agent IA
Pour modifier le comportement :
- **Logique métier** : Voir `initCalendar` et les callbacks (`eventContent`, `eventClick`).
- **Appels API** : Voir les fonctions `fetchGoogleEvents`, `updateGoogleEvent`, `toggleTaskCompletion`, et `deleteSelectedEvent`.
- **Style** : Les surcharges CSS se trouvent dans la section `/* --- CALENDAR --- */` de `styles.css`.
