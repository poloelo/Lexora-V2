# QA Report — Lexora MVP

**Date :** 2026-07-17 
**Testeur :** Keish (sam99-web)  
**Branche :** keish/docker-security  

---

## Environnement de test

- Docker Desktop v29.4.3
- Windows 11 / WSL2
- curl pour les tests API
- Vitest v4.1.9 + Testing Library (tests automatisés frontend)

---

## Résultats des tests

| # | Test | Méthode | Résultat attendu | Résultat obtenu | Statut |
|---|------|---------|-----------------|-----------------|--------|
| 1 | Health check | `GET /api/health` | `{"status":"ok"}` | `{"status":"ok","timestamp":"..."}` | PASS |
| 2 | Helmet headers | `curl -I /api/health` | Headers sécurité présents | CSP, X-Frame-Options, HSTS, nosniff... | PASS |
| 3 | Rate limiting | 101 requêtes en boucle | 429 à partir de la 101e | 200 x100 puis 429 | PASS |
| 4 | Frontend Nginx | `curl -I http://localhost:80` | 200 OK | 200 OK, nginx/1.31.1 | PASS |
| 5 | CORS strict | Origin: evil.com | 500 / bloqué | HTTP 500, origine rejetée | PASS |
| 6 | Route protégée sans token | `GET /api/employes` | 401 Token manquant | `{"error":"Token manquant"}` | PASS |
| 7 | Login mauvais identifiants | `POST /api/auth/login` | 401 Identifiants incorrects | `{"error":"Identifiants incorrects"}` | PASS |
| 8 | Login bloqué rate limit | `POST /api/auth/login` x101 | 429 après limite | `{"error":"Trop de requêtes..."}` | PASS |

---

## Tests automatisés frontend (Vitest)

Suite de tests unitaires sur les composants critiques d'authentification et de
routing, exécutée avec Vitest + React Testing Library. Contrairement aux tests
manuels ci-dessus (curl), ces tests sont reproductibles automatiquement à
chaque modification du code (régression continue).

**Commande :** `npm test` (dans `lexora/frontend`)
**Résultat :** 2 fichiers de test, 14/14 tests PASS, durée 4.20s

### Gardes de route — `App.test.jsx` (6 tests)

| # | Test | Composant | Résultat attendu | Statut |
|---|------|-----------|-------------------|--------|
| 1 | Redirection si non connecté | `PrivateRoute` | Redirige vers `/login` | PASS |
| 2 | Accès si connecté | `PrivateRoute` | Affiche le contenu protégé | PASS |
| 3 | Redirection si non connecté | `AdminRoute` | Redirige vers `/login` | PASS |
| 4 | Redirection si non-admin | `AdminRoute` | Redirige vers `/mon-espace` | PASS |
| 5 | Accès si admin | `AdminRoute` | Affiche le contenu admin | PASS |
| 6 | Robustesse `user` null | `AdminRoute` | Ne plante pas (optional chaining), redirige proprement | PASS |

### Formulaire de connexion — `Login.test.jsx` (8 tests)

| # | Test | Résultat attendu | Statut |
|---|------|-------------------|--------|
| 1 | Rendu du formulaire | Champs email + mot de passe + bouton présents | PASS |
| 2 | `handleChange` isolé par champ | Modifier l'email ne touche pas le mot de passe (spread) | PASS |
| 3 | Appel de `login()` au submit | Appelé avec les bonnes valeurs (email, password) | PASS |
| 4 | Redirection admin | Rôle `admin` → navigue vers `/equipe` | PASS |
| 5 | Redirection employé | Rôle `employe` → navigue vers `/mon-espace` | PASS |
| 6 | Affichage erreur | Échec de `login()` → message d'erreur affiché, pas de navigation | PASS |
| 7 | État de chargement | Bouton désactivé pendant l'appel, réactivé après (test du `finally`) | PASS |
| 8 | Réactivation après erreur | Bouton réactivé même en cas d'échec (`finally` s'exécute aussi en erreur) | PASS |

---

## Tests automatisés backend (Vitest + supertest)

Suite de tests d'intégration sur les routes `/api/employes`, exécutée avec
Vitest + supertest contre l'app Express réelle (sans démarrer de serveur).
Ces tests vérifient le contrôle d'accès par rôle, suite à la correction d'une
faille de sécurité : `isAdmin` était auparavant un simple alias vers
`verifyJWT` (vérifie un token valide, mais pas le rôle), ce qui permettait à
n'importe quel employé authentifié de lire, modifier ou supprimer des
employés — y compris de s'auto-promouvoir admin via `PUT /:id`.

**Correction :** ajout d'un middleware `requireAdmin` (vérifie
`req.admin.role === 'admin'`), utilisé à la place de `verifyJWT` dans
`routes/employes.js`.

**Commande :** `npm test` (dans `lexora/backend`)
**Résultat :** 1 fichier de test, 6/6 tests PASS, durée ~0.9s

### Protection par rôle — `tests/employes.test.js` (6 tests)

| # | Test | Méthode | Résultat attendu | Statut |
|---|------|---------|-------------------|--------|
| 1 | Requête sans token | `GET /api/employes` | 401 | PASS |
| 2 | Employé non-admin | `GET /api/employes` | 403 | PASS |
| 3 | Admin | `GET /api/employes` | 200, liste retournée | PASS |
| 4 | Auto-promotion bloquée | `PUT /api/employes/:id` (non-admin, `role: 'admin'`) | 403, rôle inchangé en base | PASS |
| 5 | Suppression bloquée | `DELETE /api/employes/:id` (non-admin) | 403, employé toujours présent | PASS |
| 6 | Suppression admin | `DELETE /api/employes/:id` (admin) | 200, employé supprimé | PASS |

---

## Verdict

**PASS — MVP fonctionnel, sécurité validée, authentification frontend et
contrôle d'accès backend testés automatiquement.**

### Points validés
- Docker : build multi-stage, volumes persistants, health check
- Helmet : 12 headers de sécurité actifs sur toutes les routes
- CORS strict : origines non autorisées bloquées (HTTP 500)
- Rate limiting : 100 req/15min, `429` retourné au-delà
- Auth JWT : routes admin protégées, erreurs propres
- Frontend : gardes de route (`PrivateRoute`, `AdminRoute`) et formulaire de
  connexion couverts par 14 tests automatisés, exécutables en continu
- Backend : contrôle d'accès par rôle sur `/api/employes` couvert par 6 tests
  automatisés (Vitest + supertest), suite à la correction d'une faille
  d'élévation de privilèges

---

## Tests de Paul Gioria (backend complet)

| Test | Statut |
|------|--------|
| Backend démarre, SQLite initialisé | PASS |
| Login JWT avec bons identifiants | PASS |
| Login JWT avec mauvais identifiants | PASS |
| Routes admin sans token → 401 | PASS |
| Routes admin avec token valide → 200 | PASS |
| Token forgé/expiré → 401 propre | PASS |
| Ancien header x-admin-key → 401 | PASS |
| Suppression récursive dossiers | PASS |
| Frontend build Vite (1423 modules) | PASS |
| Routes publiques sans token → 200 | PASS |
