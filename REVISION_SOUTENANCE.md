# Lexora — Document de révision pour la soutenance orale

> Objectif : pouvoir tout réexpliquer à l'oral **sans le code sous les yeux**.
> Chaque section est autonome ; les questions probables du jury sont à la fin.

---

## 1. VUE D'ENSEMBLE

### 1.1 Qu'est-ce que Lexora ?

Un **ERP full-stack pour petites équipes** organisé autour d'un **dashboard hub unique** : post-its personnels, kanban des tâches de département et calendrier unifié y sont empilés sur une seule page. S'y ajoutent un CRM clients (avec dossier documentaire dédié par client), un coffre-fort documentaire, un assistant IA local, et une page Équipe (admin : gestion des employés ; manager : **consultation en lecture seule du dashboard de chaque membre de son département**). Le planning des employés vit dans le calendrier (événements « planning » posés par les managers). Les modules Factures et Automations, non utilisés, ont été retirés du périmètre avant la soutenance.

### 1.2 Stack technique et justification des choix

| Couche | Techno | Pourquoi ce choix |
|---|---|---|
| Frontend | **React 18 + Vite** | SPA à composants réutilisables ; Vite = démarrage/build très rapides (vs CRA/Webpack), proxy dev intégré |
| Routing front | **react-router-dom v6** | Navigation côté client sans rechargement, gardes de route (`PrivateRoute`, `ManagerRoute`) |
| Calendrier | **react-big-calendar + date-fns** | Composant calendrier mature (vues mois/semaine/jour) ; date-fns est léger et modulaire (vs moment.js, lourd et déprécié) |
| Backend | **Node.js 18 + Express 4** | Même langage front/back (JS), Express = standard minimaliste pour des API REST |
| Base de données | **SQLite via better-sqlite3** | Application mono-process, petite équipe : pas besoin d'un serveur DB séparé. `better-sqlite3` a une **API synchrone** qui simplifie les routes (pas de callbacks/promesses) sans perte de perf à cette échelle |
| Auth | **jsonwebtoken (JWT) + bcryptjs** | Auth **stateless** (pas de session serveur) ; bcrypt = hachage lent avec sel, standard pour les mots de passe |
| Sécurité HTTP | **helmet, cors, express-rate-limit** | Headers de sécurité, contrôle des origines, anti brute-force |
| Upload | **multer** | Middleware standard Express pour le `multipart/form-data` |
| IA | **Ollama (llama3.2), local** | LLM auto-hébergé : gratuit, aucune donnée n'est envoyée à un tiers (confidentialité) |
| Déploiement | **Docker Compose + Nginx** | 2 conteneurs (front + back), volumes persistants, Nginx sert le build statique et fait reverse-proxy vers l'API |

### 1.3 Architecture générale

- **Monorepo** : un seul dépôt Git, avec `lexora/frontend/` et `lexora/backend/` séparés (deux `package.json` distincts). Les Dockerfiles et docker-compose sont à la racine.
- **Front et back totalement découplés** : ils ne communiquent que par HTTP/JSON via `/api/*`.
- En **développement** : Vite tourne sur `:5173` et proxifie `/api` vers Express `:3000` (config dans `vite.config.js`) → pas de problème CORS en dev.
- En **production (Docker)** : Nginx sur `:80` sert le build React et proxifie `/api/` vers le conteneur backend `:3000` (config dans `nginx.conf`). Le navigateur ne parle **jamais** directement à Express.

### 1.4 Schéma du flux global (ASCII)

```
                        NAVIGATEUR (client)
                 React SPA — fetch('/api/...')
                 JWT stocké en localStorage,
                 envoyé en header "Authorization: Bearer <token>"
                              │
                              │  HTTP :80
                              ▼
                 ┌─────────────────────────────┐
                 │  NGINX (conteneur frontend) │
                 │  • /       → fichiers React │
                 │  • /api/*  → proxy backend  │
                 └──────────────┬──────────────┘
                                │  HTTP interne :3000
                                ▼
                 ┌─────────────────────────────┐
                 │  EXPRESS (conteneur backend)│
                 │  1. helmet (headers sécu)   │
                 │  2. CORS (origines listées) │
                 │  3. rate-limit (100/15min)  │
                 │  4. express.json()          │
                 │  5. Router du domaine       │
                 │     ├─ verifyJWT            │
                 │     ├─ loadUser             │
                 │     ├─ requireRole(...)     │
                 │     └─ handler (validation  │
                 │        + requêtes SQL)      │
                 └───────┬─────────────┬───────┘
                         │             │
              better-sqlite3       fetch HTTP
               (synchrone)             │
                         ▼             ▼
                 ┌──────────────┐  ┌──────────────────┐
                 │ SQLite       │  │ OLLAMA :11434    │
                 │ lexora.db    │  │ LLM local        │
                 │ + /uploads/  │  │ (llama3.2)       │
                 └──────────────┘  └──────────────────┘

  Réponse : SQL → objet JS → res.json() → Nginx → React → setState → re-render
```

---

## 2. ARBORESCENCE COMMENTÉE

```
Lexora-V2/
├── docker-compose.yml        # Orchestre 2 services (backend, frontend) + 2 volumes (sqlite-data, uploads-data)
├── Dockerfile.backend        # Image Node 18 + toolchain C++ (compilation native de better-sqlite3)
├── Dockerfile.frontend       # Build multi-stage : Node (npm run build) → Nginx (sert /dist)
├── nginx.conf                # try_files pour la SPA + proxy_pass /api/ → backend:3000
├── .env.example              # Modèle des variables d'env (JWT_SECRET, DB_PATH, OLLAMA_URL...)
├── README.md                 # Doc projet (architecture, API, quick start)
├── docs/                     # Livrables Holberton (sprints, QA)
│
└── lexora/
    ├── backend/                          ◄── API REST Express
    │   ├── index.js                      # POINT D'ENTRÉE : middlewares globaux + montage des 10 routers
    │   ├── env.js                        # Charge .env (dotenv) — importé EN PREMIER dans index.js
    │   ├── middleware/
    │   │   └── auth.js                   # MIDDLEWARES : verifyJWT, loadUser, requireRole
    │   ├── models/
    │   │   └── db.js                     # MODEL : connexion SQLite, création du schéma, 9 migrations idempotentes, seed admin
    │   ├── services/
    │   │   └── ollamaService.js          # SERVICE : client HTTP vers Ollama (fonction chat)
    │   ├── routes/                       # ROUTES = "controllers" : 1 fichier = 1 domaine métier
    │   │   ├── auth.js                   # POST /login → vérifie bcrypt, signe le JWT
    │   │   ├── tasks.js                  # Tâches de département (kanban) — protégé JWT + rôles
    │   │   ├── todos.js                  # Post-its personnels — protégé JWT, règles créateur/assigné
    │   │   ├── departements.js           # Référentiel départements — lecture authentifiée, écriture admin
    │   │   ├── employes.js               # Annuaire employés — admin (+ /selector pour tous,
    │   │   │                             #  /equipe pour manager/admin)
    │   │   ├── clients.js                # CRM clients — protégé JWT ; crée/gère le sous-dossier
    │   │   │                             #  automatique de chaque client dans le Coffre-fort
    │   │   ├── evenements.js             # Calendrier unifié (général / planning / personnel)
    │   │   │                             #  avec règles de visibilité par rôle — protégé JWT
    │   │   ├── documents.js              # Coffre-fort : dossiers + upload/download Multer — protégé JWT
    │   │   ├── assistant.js              # POST → proxy vers ollamaService.chat() — protégé JWT
    │   │   └── dashboard.js              # GET /:userId — dashboard d'un employé en LECTURE SEULE
    │   │                                 #  (manager de son département / admin), réagrège les
    │   │                                 #  requêtes exportées par todos/tasks/evenements
    │   ├── scripts/seed.js               # Données de démo idempotentes (mdp commun : demo1234)
    │   └── uploads/                      # Fichiers physiques uploadés (volume Docker en prod)
    │
    └── frontend/                         ◄── SPA React
        ├── index.html                    # Coquille HTML, charge /src/main.jsx
        ├── vite.config.js                # Plugin React + proxy /api → localhost:3000 (dev)
        └── src/
            ├── main.jsx                  # createRoot + BrowserRouter + StrictMode
            ├── App.jsx                   # Routes, Sidebar, garde AdminRoute
            ├── index.css                 # Feuille de style globale unique
            ├── contexts/
            │   ├── AuthContext.jsx       # État global auth : token, user, login(), logout(), authHeaders
            │   └── ToastContext.jsx      # Notifications toast globales (useToast)
            ├── components/               # Briques réutilisées par le Dashboard (2 modes :
            │   │                         #  interactif, ou lecture seule via props)
            │   ├── PostItWall.jsx        # Mur de post-its (todos) avec toggle optimiste
            │   ├── TaskBoard.jsx         # Kanban 3 colonnes, drag & drop HTML5, modal création
            │   └── CalendarBoard.jsx     # react-big-calendar, création planning (manager),
            │                             #  choix de couleur, case "personnel"
            └── pages/                    # 1 fichier = 1 écran de la sidebar
                ├── Dashboard.jsx         # HUB UNIQUE : header → post-its → kanban → calendrier
                │                         #  (anciennes pages Tâches et Calendrier déplacées ici) ;
                │                         #  mode consultation lecture seule via prop targetUser
                ├── Clients.jsx           # CRM clients : liste, création (+ dossier auto), lien
                │                         #  "Voir le dossier", modale de suppression à 2 choix
                ├── Coffre_fort.jsx       # Arborescence, drag & drop upload, fil d'Ariane
                ├── Assistant.jsx         # Chat avec le LLM
                ├── Equipe.jsx            # Manager/admin : dashboards de l'équipe (lecture seule) ;
                │                         #  admin : + répertoire des employés
                └── Login.jsx             # Formulaire de connexion
```

**Vocabulaire à assumer à l'oral** : le projet n'a pas de dossier `controllers/` séparé — chaque fichier de `routes/` joue **à la fois le rôle de route et de controller** (définition de l'URL + logique de traitement). Le "model" est `db.js` (schéma + connexion), les requêtes SQL étant écrites dans les routes. Il y a **un seul service** (`ollamaService.js`) car c'est le seul appel externe.

---

## 3. CARTOGRAPHIE DES APPELS ENTRE FICHIERS

### 3.1 Côté backend : Route → Middlewares → Fichier → Table(s) → Réponse

Toutes les routes sont montées dans `index.js`. Chaîne globale : `helmet → cors → rateLimit → express.json → router`.

| Méthode + Route | Fichier | Middlewares | Table(s) SQL | Réponse |
|---|---|---|---|---|
| `POST /api/auth/login` | auth.js | — (public) | employes | `{ token, user }` ou 401 |
| `GET /api/health` | index.js | — | — | `{ status: 'ok' }` |
| `GET /api/tasks` | tasks.js | verifyJWT, loadUser | tasks ⋈ departements ⋈ employes | Tableau de tâches filtré par département |
| `POST /api/tasks` | tasks.js | + requireRole(manager, admin) | tasks | 201 + tâche créée |
| `PUT /api/tasks/:id` | tasks.js | + requireRole(manager, admin) | tasks | Tâche mise à jour |
| `PATCH /api/tasks/:id/status` | tasks.js | verifyJWT, loadUser (tout membre du département) | tasks | Tâche mise à jour |
| `DELETE /api/tasks/:id` | tasks.js | + requireRole(manager, admin) | tasks | `{ message }` |
| `GET /api/todos` | todos.js | verifyJWT, loadUser | todos ⋈ todo_assignees ⋈ employes | Mes todos (créés + assignés) |
| `POST /api/todos` | todos.js | idem | todos + todo_assignees | 201 + todo avec assignés |
| `PUT /api/todos/:id` | todos.js | idem (créateur seul) | todos + todo_assignees | Todo mis à jour |
| `PATCH /api/todos/:id/toggle` | todos.js | idem (créateur OU assigné) | todos | Todo (statut basculé) |
| `DELETE /api/todos/:id` | todos.js | idem (créateur seul) | todos | `{ message }` |
| `GET /api/departements` | departements.js | verifyJWT, loadUser | departements | Liste `{id, nom}` |
| `POST/PUT/DELETE /api/departements` | departements.js | + requireRole(admin) | departements | CRUD |
| `GET /api/employes/selector` | employes.js | verifyJWT, loadUser (tout utilisateur authentifié) | employes | `[{id, nom}]` minimal |
| `GET/POST/PUT/DELETE /api/employes` | employes.js | + requireRole(admin) | employes ⋈ departements | CRUD sans password_hash |
| `PUT /api/employes/:id/password` | employes.js | + requireRole(admin) | employes | `{ message }` |
| `GET/POST /api/clients` | clients.js | verifyJWT, loadUser | clients + dossiers | GET : liste ; POST : 201 + crée le sous-dossier client dans `Clients/`, lie `dossier_id` |
| `PUT /api/clients/:id` | clients.js | verifyJWT, loadUser | clients | Client mis à jour (le dossier n'est jamais renommé automatiquement) |
| `DELETE /api/clients/:id` | clients.js | verifyJWT, loadUser | clients (+ dossiers si demandé) | Sans dossier lié : 200. Avec dossier et sans `?deleteDossier=` : **409** + infos pour confirmation. `?deleteDossier=true` : supprime aussi le dossier (récursif) ; `?deleteDossier=false` : client seul, dossier détaché |
| `GET /api/evenements` | evenements.js | verifyJWT, loadUser | evenements ⋈ employes (cible + créateur) | Événements **visibles par moi** : généraux + planning de mon département + les miens (admin : tout) |
| `POST /api/evenements` | evenements.js | verifyJWT, loadUser | evenements | 201 ; type `planning` → réservé au manager du département de la cible, **couleur verte forcée** |
| `PUT/DELETE /api/evenements/:id` | evenements.js | verifyJWT, loadUser | evenements | Créateur (perso/général), manager du département (planning), admin partout |
| `GET /api/documents` | documents.js | verifyJWT, loadUser | documents | Liste (filtre `?dossier_id=`) |
| `POST /api/documents/upload` | documents.js | verifyJWT, loadUser + multer `upload.single('file')` | documents + disque `/uploads` | 201 + métadonnées |
| `GET /api/documents/:id/download` | documents.js | verifyJWT, loadUser | documents + disque | `res.download()` (le fichier) |
| `DELETE /api/documents/:id` | documents.js | verifyJWT, loadUser | documents + disque | `{ message }` |
| `GET/POST/DELETE /api/documents/dossiers` | documents.js | verifyJWT, loadUser | dossiers (+ récursion) | CRUD |
| `POST /api/assistant` | assistant.js | verifyJWT, loadUser | — (appelle ollamaService.chat) | `{ response }` ou 500 |
| `GET /api/employes/equipe` | employes.js | + requireRole(manager, admin) | employes ⋈ departements | Employés consultables (manager : son département sans lui ; admin : tous) |
| `GET /api/dashboard/:userId` | dashboard.js | verifyJWT, loadUser + garde manager-du-département/admin | réutilise getTodosOfUser, getTasksOfDepartment, getEventsVisibleBy | `{ user, todos, tasks, evenements }` — **lecture seule**, 403 sinon |

> **À retenir** : toute l'API métier exige un JWT (`router.use(verifyJWT, loadUser)` en tête de chaque router). Seuls `POST /api/auth/login` et `GET /api/health` sont publics — il faut bien pouvoir se connecter, et la sonde de santé sert au monitoring.

### 3.2 Côté frontend : Page → Composants → Appels API → State

| Page (route) | Composants utilisés | Appels API (fetch) | Hooks / state clés |
|---|---|---|---|
| `App.jsx` (racine) | Sidebar, AuthProvider, ToastProvider, garde ManagerRoute (Équipe) | — | `useAuth` pour la garde et la carte utilisateur ; redirections héritées : `/mon-espace`, `/taches`, `/calendrier` → `/`, `/business` → `/clients` |
| `Login.jsx` (`/login`) | — | `POST /api/auth/login` (via `login()` du AuthContext) | `form`, `error`, `loading` ; `useNavigate` : admin → `/equipe`, sinon → `/` |
| `Dashboard.jsx` (`/`) | **PostItWall + TaskBoard + CalendarBoard** empilés | mode personnel : chaque section fetch ses données ; mode consultation : un seul `GET /api/dashboard/:userId` distribué aux 3 sections via props | `targetUser`/`onBack` (consultation), `data`, `loading` ; `readOnly = !!targetUser` coupe toutes les actions |
| `Clients.jsx` (`/clients`) | — (page simple, sans onglets) | `GET/POST/DELETE /api/clients` | `clients`, `form`, `search`, `confirmDelete` (modale à 2 choix) ; bouton « Voir le dossier » → `navigate('/documents?dossier=' + id)` |
| `TaskBoard.jsx` (composant du Dashboard) | TaskCard (draggable) | interactif : `GET /api/tasks?department_id=`, `GET /api/departements`, `POST /api/tasks`, `PATCH /api/tasks/:id/status`, `DELETE /api/tasks/:id` ; readOnly : données en props | `tasks`, `prioFilter`, `depFilter`, `modalOpen`, `form` ; **update optimiste** sur le statut ; readOnly → badge statique, ni drag ni delete |
| `CalendarBoard.jsx` (composant du Dashboard) | `<Calendar>` (react-big-calendar), Modal | interactif : `GET /api/evenements`, `GET /api/employes/selector` (manager/admin), `POST/DELETE /api/evenements` ; readOnly : données en props | `events` convertis au format `{title, start, end}`, `showCreate`, `detail`, `form` ; readOnly → `selectable=false`, détail consultable sans suppression |
| `Coffre_fort.jsx` (`/documents`) | — (tout interne) | `GET /api/documents/dossiers`, `GET /api/documents`, `POST .../dossiers`, `POST .../upload` (FormData), `GET .../:id/download`, `DELETE` | `currentFolderId` (navigation, initialisé depuis `?dossier=` si présent via `useSearchParams`), `dossiers`, `documents`, `dragActive` ; fil d'Ariane recalculé |
| `Assistant.jsx` (`/assistant`) | — | `POST /api/assistant { prompt }` | `messages` (tableau {role, text, time}), `input`, `loading` ; auto-scroll via `useRef` |
| `Equipe.jsx` (`/equipe`, **ManagerRoute**) | DashboardsEquipe + (admin) Employes + **Dashboard en mode targetUser** | `GET /api/employes/equipe` ; admin : `GET/POST/DELETE /api/employes`, `GET /api/departements` | `selected` (employé consulté → rend `<Dashboard targetUser>` avec bouton retour) ; le répertoire de gestion reste admin-only |
| `PostItWall.jsx` (composant, rendu dans Dashboard) | — | `GET/POST/DELETE /api/todos`, `PATCH /api/todos/:id/toggle`, `GET /api/employes/selector` | `todos`, `content`, `color`, `assignees` ; **toggle optimiste avec rollback** |

**Modèle mental à réciter** : *chaque page suit le même cycle : `useEffect` au montage → `fetch` → `setState` → rendu conditionnel (skeleton pendant `loading`, empty-state si vide, données sinon). Les mutations mettent à jour l'état local directement (ou rechargent via `load()`), et affichent un toast.*

---

## 4. EXPLICATION DES FONCTIONS NON TRIVIALES

### 4.1 Backend — Authentification (`middleware/auth.js`)

**`verifyJWT(req, res, next)`**
- **Entrée** : la requête HTTP ; lit le header `Authorization`.
- **Retour** : rien — appelle `next()` ou répond 401.
- **Étapes** : ① vérifie que le header commence par `"Bearer "` (sinon 401 « Token manquant ») → ② extrait le token (`slice(7)` retire "Bearer ") → ③ `jwt.verify(token, JWT_SECRET)` vérifie **la signature ET l'expiration** → ④ si OK, stocke le payload décodé dans `req.admin` et passe au middleware suivant ; si le verify lève une exception (signature falsifiée, token expiré), catch → 401.
- **Pourquoi comme ça** : le `try/catch` est obligatoire car `jwt.verify` **jette** au lieu de retourner null. Un seul message d'erreur générique évite de donner des indices à un attaquant.

**`loadUser(req, res, next)`** — *le point le plus important à expliquer*
- **Entrée** : `req.admin.id` (posé par verifyJWT). **Retour** : `req.user` = ligne fraîche de la table `employes`, ou 401.
- **Ce qu'elle fait** : relit l'employé **en base** à chaque requête (`SELECT id, nom, prenom, email, role, departement_id FROM employes WHERE id = ?`).
- **Pourquoi** : le token vit 24h ; entre-temps l'utilisateur a pu être **rétrogradé, changé de département ou supprimé**. Si on faisait confiance au rôle stocké dans le JWT, un employé licencié garderait ses droits jusqu'à expiration. On ne fait donc **jamais** d'autorisation sur le payload du token — il ne sert qu'à identifier (`id`). C'est le compromis classique du JWT stateless : ici on ré-ajoute une lecture DB (très bon marché avec SQLite local) pour la fraîcheur des droits.

**`requireRole(...roles)`**
- **Entrée** : liste de rôles autorisés ; **retourne un middleware** (fonction qui retourne une fonction = *factory*).
- **Étapes** : compare `req.user.role` (donc le rôle **frais**, pas celui du token) à la liste → 403 si absent.
- **Pourquoi une factory** : permet d'écrire déclarativement `router.post('/', requireRole('manager','admin'), handler)` — le même code sert pour toutes les combinaisons de rôles.

### 4.2 Backend — Login (`routes/auth.js`)

**`POST /login`**
- **Étapes** : ① valide présence email+password (400) → ② cherche l'employé par email → ③ si absent **ou sans password_hash**, 401 → ④ `bcrypt.compareSync(password, hash)` re-hache le mot de passe fourni avec le sel stocké et compare → ⑤ construit le payload (id, email, role, nom...) → ⑥ `jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })` → ⑦ renvoie `{ token, user }`.
- **Pièges évités** : même message « Identifiants incorrects » que l'email existe ou non (pas d'énumération de comptes). Le hash n'est **jamais** renvoyé. Le rôle dans le token ne sert qu'à l'UI (cacher des boutons) — le serveur revalide tout via `loadUser`.

### 4.3 Backend — Base de données (`models/db.js`)

**Initialisation**
- Au **premier `import db`**, le module : ouvre/crée le fichier SQLite → active `PRAGMA foreign_keys = ON` (⚠️ SQLite **n'applique pas** les FK par défaut, il faut ce pragma à chaque connexion) → crée toutes les tables avec `IF NOT EXISTS` → exécute les migrations → seed un admin depuis `.env` s'il n'en existe aucun.
- Node met les modules en cache : tous les fichiers qui font `import db` partagent **la même connexion**.

**Justification des `ON DELETE`** (question RGPD garantie) :
- `tasks.department_id → CASCADE` : une tâche sans département n'a pas de sens.
- `tasks.created_by / todos.created_by → SET NULL` : **le travail survit au départ de son créateur**, mais la référence nominative disparaît (RGPD).
- `todo_assignees.* → CASCADE` : table de jointure pure ; supprimer un employé purge ses assignations.
- `employes.departement_id → SET NULL` : supprimer un département ne licencie pas les employés.
- `evenements.employe_id → CASCADE` : le planning et les événements personnels d'un employé parti sont purgés (RGPD) ; `created_by_id → SET NULL` : l'événement général survit, anonymisé.

**Migrations idempotentes** (7 au total)
- **Principe** : chaque migration **détecte l'état du schéma** avant d'agir (`PRAGMA table_info` pour lister les colonnes, `sqlite_master` pour tester l'existence d'une table). Sur une base neuve ou déjà migrée → no-op. On peut redémarrer le serveur autant de fois qu'on veut.
- Exemples à citer :
  - *Migration 2* : `employes.departement` (texte libre) → `departement_id` (FK). Crée les départements depuis les valeurs distinctes existantes, rattache chaque employé par id, puis supprime la colonne texte. Le tout **dans une transaction** : tout ou rien.
  - *Migration 3* : ancienne table `todos` (titre/description) → nouveau schéma post-its. La table est **renommée** puis reconstruite, le contenu est fusionné (`titre — description`) et rattaché au premier admin (sinon, personne ne les verrait, la lecture étant filtrée par créateur/assigné).
  - *Migration 5* : `planning.employe` (texte) → `employe_id` (FK) par correspondance de nom insensible à la casse. **Prudence** : la colonne texte n'est supprimée que si 100 % des lignes ont été appariées ; sinon elle est conservée et la migration se retente au prochain démarrage. Conservée même après la fusion planning→événements : sur une très vieille base elle s'exécute AVANT la migration 7, pour que les créneaux partent avec leur FK.
  - *Migration 6* : `evenements` gagne `employe_id` et `created_by_id` (FK) ; l'ancien `created_by` texte libre est supprimé (informatif, non migrable par nom de façon fiable).
  - *Migration 7* : **fusion planning → evenements**. Chaque créneau devient un événement `planning` vert ciblant l'employé (`date` + heures concaténées en ISO 8601), puis `DROP TABLE planning`. Les créneaux orphelins deviennent des événements généraux plutôt que d'être perdus.

### 4.4 Backend — Logique métier des tâches (`routes/tasks.js`)

**`canManage(user, departmentId)`**
- Retourne `true` si admin (partout), ou si manager **de ce département précis**. C'est la règle d'or du module : un manager n'administre que chez lui. Utilisée à la création, la modification (y compris le **département cible** en cas de déplacement), et la suppression.

**`validateFields({ status, priority, due_date, department_id })`**
- Valide chaque champ **seulement s'il est fourni** (`!== undefined`) contre des listes blanches (`STATUSES`, `PRIORITIES`), une regex de date `YYYY-MM-DD`, et l'existence réelle du département en base. Retourne un message d'erreur ou `null`.
- **Pourquoi** : centralise la validation POST/PUT (pas de duplication), et la vérification en base de `department_id` empêche de créer une tâche orpheline.

**`GET /` (lecture filtrée par rôle)**
- Construit la clause `WHERE` dynamiquement dans des tableaux `where[]`/`params[]` : admin → tout (+ filtre optionnel `?department_id=`), sinon → forcé sur `req.user.departement_id` (un employé sans département reçoit `[]`). Toujours des **requêtes préparées** (placeholders `?`) → pas d'injection SQL possible.

**`PATCH /:id/status`** : volontairement **plus permissif** (tout membre du département) que le CRUD (manager/admin) — le kanban doit être interactif pour toute l'équipe. À l'oral : « les permissions suivent l'usage réel : déplacer une carte ≠ redéfinir la tâche ».

### 4.5 Backend — Post-its (`routes/todos.js`)

**Matrice de droits** (à connaître par cœur) :
| Action | Qui |
|---|---|
| Voir | créateur + assignés |
| Modifier / supprimer | créateur uniquement |
| Toggle fait/à faire | créateur OU assigné |
| Assigner à autrui | tout utilisateur authentifié (esprit « mur de post-its » partagé ; sans assigné explicite, le post-it est pour soi-même) |

**`getTodoWithAssignees(id)`** : charge le todo + la liste de ses assignés (2 requêtes). Ne renvoie que `id` + nom affichable des assignés — **minimisation des données** (pas d'email, pas de salaire).

**`replaceAssignees = db.transaction((todoId, ids) => ...)`**
- Supprime toutes les assignations du todo puis réinsère la nouvelle liste.
- **Pourquoi une transaction** : si une insertion échoue au milieu, on ne veut pas d'un todo à moitié assigné — le DELETE+INSERT est atomique (tout ou rien). `db.transaction()` de better-sqlite3 gère le BEGIN/COMMIT/ROLLBACK automatiquement.

**`GET /`** : `SELECT DISTINCT t.id ... LEFT JOIN todo_assignees ... WHERE created_by = ? OR assignee_id = ?` — le `DISTINCT` évite les doublons quand on est à la fois créateur et assigné.

### 4.5 bis — Calendrier unifié (`routes/evenements.js`)

Trois natures d'événements dans une seule table, selon `employe_id` et `type` :

| Nature | Critère | Qui crée/modifie/supprime | Qui voit |
|---|---|---|---|
| Général | `employe_id` NULL | tout utilisateur (modif : créateur, admin) | tout le monde |
| Planning | `type='planning'` + `employe_id` | **manager du département de la cible** (ou admin) ; couleur verte imposée | tout le département de l'employé ciblé |
| Personnel | `employe_id` = soi | soi-même (couleur au choix) | créateur sur son calendrier ; manager/admin **uniquement via la consultation** `GET /api/dashboard/:userId` |

- **`VISIBILITY_WHERE`** : le calendrier du dashboard est **personnel pour tous les rôles, admin compris** — clause SQL à paramètres nommés (`@me`, `@dep`) : général OU me cible OU créé par moi OU planning de mon département. Pas de passe-droit admin/manager sur l'affichage : la vision des employés passe par la consultation. `canSee` (accès unitaire GET /:id, PUT, DELETE) reste plus large — admin partout, manager sur son département — pour préserver les droits d'administration ; un événement inaccessible renvoie **404 et non 403**, pour ne pas révéler son existence.
- **`managesTarget(user, employeId)`** : admin partout ; manager uniquement si la cible appartient à son département (relit le département de la cible en base). Même philosophie que `canManage` de tasks.js.
- **`checkTargetRights`** : à la création ET à la modification, les droits sont revérifiés sur les valeurs **finales** (changement de type ou de cible compris) — on ne peut pas transformer son événement perso en planning d'autrui.

### 4.6 Backend — Coffre-fort (`routes/documents.js`)

**Configuration Multer**
- `diskStorage` (fichiers sur disque, pas en RAM ni en base — un fichier de 50 MB en SQLite serait une très mauvaise pratique).
- Nom sur disque = `Date.now() + '-' + nomOriginal` → **deux uploads du même nom ne s'écrasent jamais**. Le nom original est conservé en base (`nom`) pour l'affichage et le téléchargement.
- Le nom original passe par `Buffer.from(name, 'latin1').toString('utf8')` : Multer décode les noms de fichiers en latin1, cette conversion restaure les accents français.
- `limits: { fileSize: 50 MB }` : Multer rejette au-delà, avant d'écrire le fichier entier.

**`supprimerDossierRecursif(dossierId)`**
- **Étapes** : ① supprime les fichiers **physiques** du dossier (fs.unlinkSync) puis leurs lignes en base → ② se rappelle elle-même sur chaque sous-dossier → ③ supprime le dossier lui-même.
- **Pourquoi récursif** : l'arborescence est de profondeur arbitraire (self-reference `parent_id`). L'ordre (fichiers d'abord, dossier en dernier) garantit qu'on ne laisse ni fichiers orphelins sur le disque ni métadonnées fantômes en base.
- **Exportée** et réutilisée telle quelle par `routes/clients.js` (voir 4.6 bis) : un seul endroit sait supprimer un dossier proprement, pas de duplication de la logique récursive.

**`GET /:id/download`** : `res.download(filePath, doc.nom)` envoie le fichier avec le header `Content-Disposition: attachment` et **le nom d'origine** (pas le nom timestampé du disque).

### 4.6 bis — Dossier client automatique (`routes/clients.js`)

Chaque client a un sous-dossier dédié dans le coffre-fort, rangé sous un dossier racine fixe **"Clients"** (créé une seule fois par la migration 9 de `db.js`, pour ne pas polluer la racine de l'arborescence).

**`POST /api/clients`** — création atomique client + dossier
- `db.transaction(() => { ... })` : insère le client, calcule son nom affichable (`nomAffichable` : raison sociale pour une entreprise, sinon "Prénom Nom", email en dernier recours), crée le sous-dossier sous `Clients/`, puis lie `dossier_id` sur le client. **Tout ou rien** : on ne veut jamais d'un client créé sans dossier lié si une étape échoue en cours de route.

**`DELETE /api/clients/:id`** — suppression en deux temps, jamais silencieuse
- Sans paramètre `deleteDossier` et si un dossier est lié : renvoie **409** (`requiresConfirmation: true`, `dossier_id`, `dossier_nom`) et **ne supprime rien**. Le frontend affiche alors sa modale à deux choix.
- `?deleteDossier=true` : supprime le client **et** le dossier (récursivement, via `supprimerDossierRecursif` importée de `documents.js`).
- `?deleteDossier=false` : supprime le client seul ; le dossier reste, simplement détaché (plus aucun client ne le référence — RGPD assumé : les documents ne sont pas des données personnelles à purger automatiquement, l'utilisateur décide).
- **Pourquoi ce flux en 2 appels plutôt qu'un simple booléen dans le body du DELETE** : un `DELETE` ne devrait pas nécessiter de body pour fonctionner normalement ; passer par un code 409 + requête de suivi avec query param garde chaque appel HTTP sémantiquement simple, et évite qu'un appel non-interactif (script, tests) supprime un dossier par accident sans confirmation explicite.

### 4.7 Backend — Assistant IA (`services/ollamaService.js`)

**`chat(prompt)`**
- `fetch` natif Node 18 vers `POST {OLLAMA_URL}/api/generate` avec `{ model, prompt, stream: false }`.
- `stream: false` → Ollama renvoie la réponse complète en un seul JSON (plus simple qu'un flux SSE ; le front affiche « ... » pendant l'attente).
- Jette une erreur si HTTP non-OK ; la route `assistant.js` la catch et renvoie un 500 avec le détail → le front affiche l'erreur **dans le chat** au lieu de planter.
- Découplage : la route ne connaît pas Ollama, le service ne connaît pas Express — on pourrait remplacer Ollama par OpenAI en ne touchant que ce fichier.

### 4.8 Frontend — Contexts

**`AuthContext.jsx`**
- État global : `token` + `user`, initialisés **paresseusement** depuis `localStorage` (`useState(() => localStorage.getItem(...))` — la fonction n'est exécutée qu'au premier rendu) → la session **survit au rafraîchissement de la page**.
- `login(email, password)` : POST `/api/auth/login`, stocke token+user dans localStorage **et** dans le state (le state déclenche le re-render, le localStorage assure la persistance).
- `authHeaders` : objet `{ Authorization: 'Bearer <token>' }` prêt à être *spreadé* dans chaque fetch — évite de répéter la construction du header dans toutes les pages.
- `parseStoredUser()` est dans un try/catch : un JSON corrompu en localStorage ne doit pas faire planter toute l'app au démarrage.

**`ToastContext.jsx`**
- **Pourquoi un Context** : les toasts sont déclenchés depuis n'importe quelle page ; sans context il faudrait passer `showToast` en prop à travers toute l'arborescence (*prop drilling*).
- La **valeur du context est directement la fonction** `addToast`, mémoïsée par `useCallback` → les consommateurs ne re-render pas quand la liste des toasts change.
- Cycle de vie d'un toast : 0 ms création → 2700 ms `setExiting(true)` (classe CSS d'animation de sortie, 300 ms) → 3000 ms retrait du state. Les deux timers sont **nettoyés dans le cleanup du useEffect** (pas de setState sur un composant démonté).
- ID unique = `Date.now() + Math.random()` : deux toasts créés dans la même milliseconde ne collisionnent pas.

### 4.9 Frontend — Patterns à expliquer

**Update optimiste avec rollback** (TaskBoard.jsx `changeStatus`, PostItWall.jsx `toggle`)
- **Étapes** : ① sauvegarder l'état courant dans une variable (`const previous = tasks`) → ② appliquer le changement localement **tout de suite** (`setTasks(...)`) → ③ appeler l'API → ④ si erreur : restaurer `previous` + toast d'erreur.
- **Pourquoi** : l'interface répond instantanément (une carte kanban qu'on dépose ne doit pas « laguer » le temps d'un aller-retour réseau) tout en restant cohérente avec le serveur en cas d'échec (droits insuffisants, réseau).

**Drag & drop natif HTML5** (TaskBoard.jsx)
- Carte : `draggable` + `onDragStart` → `e.dataTransfer.setData('text/task-id', id)`.
- Colonne : `onDragOver` avec `e.preventDefault()` (**obligatoire**, sinon le navigateur interdit le drop) + `onDrop` → relit l'id, retrouve la tâche, appelle `changeStatus`.
- Un `<select>` de secours sur chaque carte fait la même action — accessibilité + écrans tactiles.

**`useCountUp(target, duration)`** (Dashboard.jsx) — hook personnalisé
- Anime un compteur de l'ancienne valeur vers `target` via `requestAnimationFrame` : à chaque frame, calcule `progress` (0→1), applique un easing cubique (`1 - (1-p)³` : rapide au début, doux à la fin), `setValue(arrondi)`.
- `useRef(prev)` retient la dernière valeur atteinte **sans déclencher de re-render** — c'est exactement le cas d'usage de useRef vs useState.

**Calendrier unifié** (CalendarBoard.jsx `loadEvents` + modal de création)
- **Une seule source** : `/api/evenements`. Le backend renvoie déjà la liste filtrée selon la visibilité de l'utilisateur — le front ne fait que convertir au format react-big-calendar `{ title, start: Date, end: Date }` (le planning affiche « Nom de l'employé — Titre »).
- Modal de création à géométrie variable : manager/admin voient l'option type « Planning (équipe) » qui remplace la palette de couleurs par un sélecteur d'employé (couleur verte imposée par le backend) ; les autres types offrent le **choix de couleur** (pastilles, comme les post-its — le vert en est exclu, réservé au planning) et une case « Événement personnel » qui envoie `employe_id = user.id`.
- `eventPropGetter` colore chaque événement avec `event.couleur` venant de la base (les couleurs par type ne servent que de repli et de légende).
- `canDelete` (miroir client des droits serveur) ne fait que cacher le bouton : le backend reste l'autorité.
- `handleSelectSlot` : en vue mois, react-big-calendar renvoie `end` = minuit du lendemain → si `end <= start`, on force début + 1 h.

**Fil d'Ariane** (Coffre_fort.jsx `getBreadcrumbs`)
- Remonte l'arborescence : depuis `currentFolderId`, boucle `while` sur `parent_id` jusqu'à `null` (racine), en insérant chaque dossier **au début** du tableau (`unshift`) pour avoir l'ordre racine → courant.

**Gardes de route** (App.jsx)
- `PrivateRoute` enveloppe **tout le layout** : l'API entière exigeant un JWT, l'application est derrière le login (seule `/login` est accessible déconnecté).
- `AdminRoute` : en plus, vérifie `user.role === 'admin'`, sinon redirige vers `/` (`replace` : pas d'entrée dans l'historique, le bouton retour ne re-piège pas l'utilisateur). L'ancienne route `/mon-espace` redirige vers `/` depuis la fusion avec le Dashboard.

**Téléchargement authentifié** (Coffre_fort.jsx `telecharger`)
- La route de download exigeant le JWT, un simple `<a href>` ne suffit plus (impossible d'y joindre un header). On `fetch` le fichier avec `authHeaders`, on récupère un **blob**, on crée une URL objet (`URL.createObjectURL`), on déclenche un clic sur un lien temporaire avec le nom original, puis on libère la mémoire (`revokeObjectURL`).
- **À dire absolument** : ces gardes sont du **confort UX, pas de la sécurité** — n'importe qui peut modifier le JS du navigateur. La vraie barrière est côté serveur (verifyJWT + loadUser + requireRole).

---

## 5. SÉCURITÉ & CONFORMITÉ

### 5.1 JWT — cycle de vie complet

1. **Génération** (auth.js) : après vérification bcrypt, `jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })`. Signature HMAC-SHA256 (défaut) avec un secret de 32 octets aléatoires stocké dans `.env` (jamais commité — `.env.example` sert de modèle).
2. **Structure** : `header.payload.signature` en base64url. Le payload est **lisible par tous** (juste encodé, pas chiffré) → on n'y met **aucun secret**, seulement id/email/rôle/nom. La signature garantit l'**intégrité** : modifier le payload invalide le token.
3. **Stockage client** : `localStorage` (clés `lexora_jwt`, `lexora_user`). Limite assumée : vulnérable au XSS (un cookie httpOnly serait plus robuste) — atténué par React qui échappe le contenu par défaut, et helmet/CSP.
4. **Transport** : header `Authorization: Bearer <token>` sur chaque fetch protégé (via `authHeaders` du AuthContext).
5. **Vérification** : `verifyJWT` (signature + expiration) puis **`loadUser` relit le rôle en base** → un token valide d'un employé supprimé/rétrogradé ne donne aucun droit. C'est la réponse au reproche classique « le JWT ne peut pas être révoqué ».
6. **Expiration/déconnexion** : 24 h côté serveur ; `logout()` côté client efface localStorage (le token devient inutilisé, il expirera seul).

### 5.2 Mots de passe — bcrypt

- `bcrypt.hashSync(password, 10)` : 10 = **cost factor** → 2¹⁰ itérations. Lenteur **volontaire** pour rendre le brute-force hors de prix, sel aléatoire intégré au hash (deux utilisateurs avec le même mot de passe ont des hashs différents → les rainbow tables sont inutiles).
- Le hash n'apparaît dans **aucune** réponse API (le `SELECT` de employes.js liste explicitement ses colonnes, jamais `SELECT *` vers le client).

### 5.3 Les 3 middlewares globaux (index.js)

| Middleware | Ce qu'il fait | Contre quoi |
|---|---|---|
| `helmet()` | Ajoute ~14 headers HTTP (CSP, HSTS, X-Frame-Options, nosniff...) | Clickjacking, sniffing MIME, downgrade HTTPS |
| `cors({ origin: callback })` | N'autorise que les origines de `ALLOWED_ORIGINS` (.env) ; whitelist stricte, pas de `*` | Appels API depuis des sites tiers malveillants |
| `rateLimit(100 req / 15 min / IP)` sur `/api/` | Renvoie 429 au-delà | Brute-force du login, scraping, mini-DoS |

### 5.4 Injection SQL — requêtes préparées partout

Toutes les requêtes utilisent des **placeholders `?`** (`db.prepare('... WHERE id = ?').get(id)`) : la valeur est passée comme **donnée**, jamais concaténée dans le SQL. Un `email = "' OR 1=1 --"` est cherché littéralement. C'est systématique dans tout le projet — aucune concaténation de valeurs utilisateur.

### 5.5 Validation des entrées

- Listes blanches pour les enums (statuts, priorités, rôles, couleur `#rrggbb`, date `YYYY-MM-DD`).
- Vérification d'existence en base des FK reçues (department_id, employe_id, assignee_ids).
- Contraintes SQL en dernier rempart (`CHECK (status IN ...)`, `NOT NULL`, `UNIQUE`).
- Longueur max (todo : 280 caractères), taille max upload (50 MB).

### 5.6 RGPD / minimisation des données

- **Droit à l'effacement** : la suppression d'un employé purge en cascade son planning et ses assignations ; ses créations survivent mais **anonymisées** (`created_by → NULL`).
- **Minimisation** : `/api/employes/selector` ne renvoie que `{id, nom}` (pas d'email, de salaire ni de rôle) — c'est ce qui permet de l'ouvrir à tout utilisateur authentifié pour l'assignation de post-its sans exposer de données sensibles ; l'annuaire complet reste admin-only.
- **Suppression de client** : le dossier documentaire associé n'est **jamais** purgé automatiquement — la décision revient explicitement à l'utilisateur (modale à deux choix), car des documents peuvent avoir une valeur légale propre (factures, contrats) indépendante du cycle de vie de la fiche client.
- **IA locale** : Ollama tourne sur la machine → aucun prompt n'est envoyé à un service cloud.

### 5.7 Limites connues (à annoncer soi-même — ça fait gagner des points)

1. **localStorage vs cookie httpOnly** pour le JWT (voir 5.1).
2. **Pas de refresh token** : une seule durée de 24 h.
3. **HTTP interne** : Nginx→backend en clair (acceptable dans un réseau Docker privé ; en prod publique il faudrait TLS au niveau de Nginx).
4. **Pas de tests automatisés** ; QA manuelle documentée dans `QA_REPORT.md`.
5. **Pas de granularité par rôle** sur les modules métier (clients, documents...) : tout utilisateur authentifié y accède à l'identique — un raffinement possible serait de réserver l'écriture à certains rôles via `requireRole`.

---

## 6. BASE DE DONNÉES — SCHÉMA À CONNAÎTRE

```
departements (id, nom UNIQUE)
    ▲ SET NULL              ▲ CASCADE
    │                       │
employes (id, nom, prenom, email, poste, departement_id FK,
          salaire, date_embauche, role, password_hash)
    ▲ SET NULL   ▲ SET NULL   ▲ CASCADE      ▲ CASCADE
    │            │            │              │
tasks         todos       todo_assignees   evenements
(title,       (content,   (todo_id FK ⟂    (titre, dates ISO 8601, type,
 department_id color,      assignee_id FK,  couleur,
 FK CASCADE,  created_by,  PK composite)    employe_id FK CASCADE,
 created_by,  status,                       created_by_id FK SET NULL)
 status,      done_at)                      ← calendrier unifié :
 priority,                                    général / planning / perso
 due_date)

dossiers (parent_id auto-référence, NULL = racine)
    ▲ SET NULL
    │
clients (type_client particulier/entreprise, email, siret...,
         dossier_id FK SET NULL → dossiers)   ← sous-dossier auto par client

documents (nom affiché, nom_fichier disque, type, taille, dossier_id)
```

Points à savoir dire :
- Dates stockées en **TEXT** ISO 8601 (`YYYY-MM-DD` ou `YYYY-MM-DDTHH:mm:ss`) : SQLite n'a pas de type date natif ; l'ISO trie correctement en ordre lexicographique et `new Date()` le parse directement côté front.
- Booléens en **INTEGER 0/1** (pas de type booléen en SQLite).
- `todo_assignees` = table de jointure **N-N** avec clé primaire composite `(todo_id, assignee_id)` → impossible d'assigner deux fois la même personne.
- `dossiers.parent_id` = **auto-référence** (self-referencing FK) pour une arborescence de profondeur illimitée. Un dossier racine fixe nommé **"Clients"** y est créé une seule fois (migration 9) pour accueillir tous les sous-dossiers clients sans polluer la racine.
- `clients.dossier_id → SET NULL` : si le dossier est supprimé indépendamment (rare), le client survit, simplement sans dossier lié.
- Les tables `factures` et `automations` ont été **retirées** (migration 8) : fonctionnalités hors périmètre pour la soutenance.

---

## 7. DOCKER & DÉPLOIEMENT

- **`Dockerfile.backend`** : `node:18-bullseye-slim` + `python3/make/g++` car **better-sqlite3 est un module natif C++** qui doit être compilé pour l'architecture du conteneur (`npm rebuild better-sqlite3`).
- **`Dockerfile.frontend`** : **build multi-stage** — stage 1 : Node exécute `vite build` → `/dist` ; stage 2 : image `nginx:alpine` qui ne contient **que** les fichiers statiques (image finale minuscule, sans Node ni node_modules).
- **`nginx.conf`** : `try_files $uri $uri/ /index.html` → toute URL inconnue renvoie `index.html`, indispensable pour une **SPA avec BrowserRouter** (sinon F5 sur `/taches` donnerait un 404) ; `location /api/` → `proxy_pass http://backend:3000` (résolution DNS interne Docker par nom de service).
- **`docker-compose.yml`** : 2 volumes nommés — `sqlite-data` (la base) et `uploads-data` (les fichiers). Sans le volume uploads, les fichiers disparaissaient au redémarrage alors que leurs métadonnées restaient en base (bug corrigé, bon exemple à raconter). `extra_hosts: host.docker.internal:host-gateway` permet au conteneur d'atteindre Ollama qui tourne **sur la machine hôte**.

---

## 8. QUESTIONS PROBABLES DU JURY (réponses en 3 phrases max)

**« Pourquoi SQLite et pas PostgreSQL/MySQL ? »**
Application mono-process pour une petite équipe : SQLite supprime toute l'infra (pas de serveur, un fichier), et better-sqlite3 en accès synchrone local est extrêmement rapide. Les FK sont activées par pragma et le schéma est relationnel propre — la migration vers Postgres serait surtout un changement de driver. Le point de bascule serait la concurrence en écriture élevée ou plusieurs instances du backend.

**« Le JWT est stateless, comment gérez-vous un employé licencié ? »**
Le token ne sert qu'à identifier ; le middleware `loadUser` relit le rôle et le département **en base à chaque requête**. Un compte supprimé → 401 immédiat, un rôle rétrogradé → 403 sur les routes protégées, sans attendre l'expiration des 24 h.

**« Pourquoi le payload du JWT contient le rôle alors ? »**
Uniquement pour l'UI (afficher/cacher la sidebar admin sans appel réseau). Aucune autorisation serveur ne s'appuie dessus.

**« Que se passe-t-il si j'appelle l'API directement avec curl, sans passer par le front ? »**
Les gardes React ne protègent rien — c'est assumé. **Toute l'API métier** exige le Bearer token (verifyJWT + loadUser en tête de chaque router) et les rôles sont revalidés côté serveur ; sans token, curl reçoit un 401 sur tout sauf /api/auth/login et /api/health.

**« Expliquez une injection SQL et pourquoi vous êtes protégés. »**
Injection = faire interpréter une valeur utilisateur comme du code SQL. Nous utilisons exclusivement des requêtes préparées avec placeholders `?` : la valeur est transmise séparément du SQL compilé, elle ne peut jamais être interprétée comme du code.

**« C'est quoi un update optimiste ? »**
On applique le changement dans l'UI avant la réponse serveur, en gardant l'état précédent ; si l'API échoue on restaure et on affiche un toast. Réactivité perçue immédiate, cohérence garantie.

**« Pourquoi deux tables tasks ET todos ? »**
Deux usages différents : `tasks` = travail structuré au niveau d'un **département** (kanban, priorité, échéance, géré par les managers) ; `todos` = mini-notes **personnelles** multi-assignées (N-N via todo_assignees). Les fusionner aurait donné une table à moitié vide avec des règles de droits contradictoires.

**« Pourquoi avoir fusionné le planning et les événements ? »**
Les deux décrivaient la même chose — un créneau daté — et le calendrier devait recoller les deux sources à chaque affichage. On a réalisé que planning ⊂ événements : un créneau de planning est un événement de type `planning` ciblant un employé, posé par son manager. Résultat : une table et un router en moins, un onglet admin en moins, et des règles de visibilité claires (général = tous, planning = le département, personnel = soi — le manager le consulte via le dashboard de l'employé).

**« Comment marchent vos migrations sans outil type Knex/Prisma ? »**
Chaque migration inspecte le schéma réel (`PRAGMA table_info`, `sqlite_master`) et ne s'exécute que si l'ancien état est détecté, dans une transaction. Idempotent : un redémarrage sur base migrée est un no-op.

**« Pourquoi avoir supprimé Factures et Automations ? »**
Deux fonctionnalités hors périmètre réel du projet, jamais utilisées et non reliées au reste du modèle (les factures gardaient volontairement le nom du client en texte libre, aucune FK). Les retirer simplifie l'interface (plus d'onglets, `/business` devient `/clients`) et le schéma (migration 8 : `DROP TABLE` sur les deux, idempotente pour les bases déjà déployées).

**« Comment fonctionne le dossier automatique des clients ? »**
Un dossier racine fixe "Clients" est créé une seule fois au démarrage ; chaque `POST /api/clients` crée, dans la même transaction que le client, un sous-dossier à son nom sous cette racine et lie `dossier_id`. À la suppression, le dossier n'est jamais purgé silencieusement : un premier appel sans paramètre renvoie 409 si un dossier existe, et le frontend affiche une modale pour choisir explicitement entre "client seul" (`?deleteDossier=false`) et "client + dossier" (`?deleteDossier=true`, suppression récursive).

**« Pourquoi Nginx devant le backend ? »**
Servir les statiques efficacement, régler le routing SPA (`try_files`), et exposer un seul port : le navigateur ne voit qu'une origine, `/api` est proxifié en interne — ce qui simplifie aussi CORS en production.

**« Où est le fichier .env ? »**
Jamais commité (`.gitignore`) ; `.env.example` documente les variables. Le secret JWT est généré avec `crypto.randomBytes(32)`.

**« Pourquoi un dashboard hub unique, et comment marche la consultation manager ? »**
Trois pages (Dashboard, Tâches, Calendrier) affichaient l'espace de travail d'une même personne : on les a empilées en une seule — moins de navigation, et les composants extraits (TaskBoard, CalendarBoard, PostItWall) ont chacun un mode lecture seule activé par props. La consultation manager réutilise exactement le même composant Dashboard avec une prop `targetUser` : les données viennent alors d'un unique `GET /api/dashboard/:userId`, gardé côté serveur (manager du département de la cible ou admin, sinon 403), et **aucune route d'écriture "pour le compte de" n'existe** — la lecture seule n'est pas qu'un choix d'interface, c'est une absence d'API.

**« Qu'amélioreriez-vous en premier ? »**
① Tests automatisés (Jest/Supertest côté API) ; ② refresh tokens + cookie httpOnly ; ③ granularité de rôles sur les modules métier (écriture clients réservée à certains rôles, par exemple) ; ④ renommage manuel du dossier client si le client est renommé (actuellement désynchronisé volontairement).

---

## 9. CHIFFRES À RETENIR

- **10 routers** Express, **~28 endpoints**, montés sous `/api/*`
- **9 tables** SQLite, **9 migrations** idempotentes
- **6 pages** React (le Dashboard est le hub : post-its + kanban + calendrier), **2 contexts** (Auth, Toast), **3 composants** partagés à double mode interactif/lecture seule (PostItWall, TaskBoard, CalendarBoard)
- JWT : **24 h**, bcrypt cost **10**, rate-limit **100 req/15 min/IP**, upload max **50 MB**, todo max **280 caractères**
- 3 rôles : `employe` < `manager` (son département) < `admin` (tout)
- Comptes de démo (seed) : mot de passe commun `demo1234`, admin `admin@lexora.fr`
