/**
 * db.js — Initialisation de la base de données SQLite
 *
 * On utilise better-sqlite3 (API synchrone) plutôt que sqlite3 (callbacks/promesses)
 * car la synchronicité simplifie les routes Express sans perte de performance
 * notable pour une application mono-process de cette taille.
 *
 * La base est créée (ou ouverte si elle existe déjà) au premier import de ce module.
 * Toutes les tables sont créées avec IF NOT EXISTS : l'application peut redémarrer
 * sans perdre les données existantes.
 *
 * Les migrations plus bas sont idempotentes : elles détectent l'état du schéma
 * (PRAGMA table_info / sqlite_master) et ne s'exécutent qu'une seule fois.
 * Un redémarrage sur une base déjà migrée est un no-op.
 *
 * Chemin du fichier SQLite : variable d'env DB_PATH (défaut : ./lexora.db)
 * En Docker : /app/data/lexora.db (monté dans le volume sqlite-data)
 */

import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

// Résolution du chemin absolu pour éviter les problèmes selon le répertoire courant
const dbPath = process.env.DB_PATH || './lexora.db';
const db = new Database(path.resolve(dbPath));

// Les clés étrangères ne sont PAS appliquées par défaut dans SQLite :
// ce pragma doit être activé à chaque connexion pour que les contraintes
// REFERENCES / ON DELETE soient réellement vérifiées.
db.pragma('foreign_keys = ON');

// Schéma de la nouvelle table todos (post-its personnels).
// Défini dans une constante car il sert à deux endroits :
//  1. la création initiale (base neuve)
//  2. la reconstruction lors de la migration de l'ancienne table todos
const TODOS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS todos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    content    TEXT NOT NULL,                      -- Texte court, style post-it
    color      TEXT DEFAULT '#fef3c7',             -- Couleur de rendu du post-it (hex CSS)
    created_by INTEGER REFERENCES employes(id) ON DELETE SET NULL,
    status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    done_at    TEXT,                               -- Renseigné quand status passe à 'done'
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`;

// Schéma de la table de jointure todo ↔ assignés, lui aussi réutilisé
// par la migration de l'ancienne table todos (voir plus bas).
const TODO_ASSIGNEES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS todo_assignees (
    todo_id     INTEGER NOT NULL REFERENCES todos(id)    ON DELETE CASCADE,
    assignee_id INTEGER NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, assignee_id)
  );
`;

// Création du schéma complet en une seule transaction
// (db.exec exécute un bloc SQL multi-instructions)
//
// Choix des ON DELETE (justification) :
//  - tasks.department_id  → CASCADE  : une tâche de département n'a pas de sens
//    sans son département ; supprimer le département purge ses tâches.
//  - tasks.created_by / todos.created_by → SET NULL : le travail survit au départ
//    de son créateur, mais la référence nominative disparaît (RGPD).
//  - todo_assignees.*     → CASCADE  : table de jointure pure, les lignes suivent
//    la vie du todo et de l'employé (RGPD : supprimer un employé purge ses assignations).
//  - employes.departement_id → SET NULL : supprimer un département ne doit pas
//    supprimer les employés, ils deviennent simplement "sans département".
//  - evenements.employe_id → CASCADE : le planning et les événements personnels
//    d'un employé parti sont purgés (RGPD) ; created_by_id → SET NULL :
//    l'événement général survit à son créateur, anonymisé.
db.exec(`
  -- ── Départements ───────────────────────────────────────────
  -- Référentiel des départements de l'entreprise. Les employés et les
  -- tâches y font référence par clé étrangère (plus de nom en texte brut).
  CREATE TABLE IF NOT EXISTS departements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nom        TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ── Employés ───────────────────────────────────────────────
  -- Répertoire interne de l'équipe. Accès restreint (admin uniquement).
  -- Rôles valides : 'employe' | 'manager' | 'admin'
  CREATE TABLE IF NOT EXISTS employes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nom            TEXT NOT NULL,
    prenom         TEXT,
    email          TEXT NOT NULL,
    poste          TEXT,
    departement_id INTEGER REFERENCES departements(id) ON DELETE SET NULL,
    salaire        REAL,
    date_embauche  TEXT,             -- Format : "YYYY-MM-DD"
    role           TEXT DEFAULT 'employe',
    password_hash  TEXT,             -- NULL = compte sans mot de passe (legacy)
    created_at     TEXT DEFAULT (datetime('now'))
  );

  -- ── Tâches de département (Tasks) ──────────────────────────
  -- Tâches créées au niveau d'un département, visibles par tous ses membres.
  -- Statuts valides   : 'todo' | 'in_progress' | 'done'
  -- Priorités valides : 'low' | 'medium' | 'high'
  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    description   TEXT,
    department_id INTEGER NOT NULL REFERENCES departements(id) ON DELETE CASCADE,
    created_by    INTEGER REFERENCES employes(id) ON DELETE SET NULL,
    status        TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    priority      TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    due_date      TEXT,              -- Format : "YYYY-MM-DD"
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  -- ── Todos (post-its personnels) ────────────────────────────
  ${TODOS_SCHEMA}

  -- ── Assignations de todos ──────────────────────────────────
  -- Un todo peut viser plusieurs employés (table de jointure N-N).
  ${TODO_ASSIGNEES_SCHEMA}

  -- ── Clients ────────────────────────────────────────────────
  -- Gère deux types : 'particulier' (nom + prénom) et 'entreprise' (raison sociale + SIRET).
  -- dossier_id : chaque client a un sous-dossier dédié dans le coffre-fort
  -- (créé automatiquement à la création du client, voir routes/clients.js),
  -- rangé sous le dossier racine "Clients". SET NULL si le dossier est
  -- supprimé indépendamment : le client survit, simplement sans dossier lié.
  CREATE TABLE IF NOT EXISTS clients (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type_client    TEXT DEFAULT 'particulier',  -- 'particulier' | 'entreprise'
    email          TEXT NOT NULL,
    telephone      TEXT,
    adresse        TEXT,
    -- Champs particulier
    nom            TEXT,
    prenom         TEXT,
    -- Champs entreprise
    raison_sociale TEXT,
    siret          TEXT,
    tva            TEXT,
    contact_nom    TEXT,             -- Nom du contact chez l'entreprise
    dossier_id     INTEGER REFERENCES dossiers(id) ON DELETE SET NULL,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  -- ── Événements du calendrier (calendrier unifié) ───────────
  -- Depuis la fusion planning/événements, cette table porte trois usages :
  --  1. Événement général  (employe_id NULL)           : visible par tous
  --  2. Planning           (type 'planning' + employe_id) : posé par le manager
  --     du département de l'employé ciblé, affiché uniquement sur le
  --     calendrier de cet employé, toujours vert (#10b981)
  --  3. Événement personnel (employe_id = soi-même)    : visible par son
  --     créateur ; manager et admin y accèdent uniquement via la
  --     consultation du dashboard (GET /api/dashboard/:userId)
  -- Types valides : 'rdv' | 'tache' | 'rappel' | 'evenement' | 'planning'
  -- couleur : code hexadécimal CSS (ex : '#7c6af7'), choisie par l'utilisateur
  -- Les dates sont stockées en ISO 8601 : "2026-05-20T09:00:00"
  -- ON DELETE : employe_id CASCADE (RGPD : le planning d'un employé parti est
  -- purgé) ; created_by_id SET NULL (l'événement survit, anonymisé).
  CREATE TABLE IF NOT EXISTS evenements (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    titre         TEXT NOT NULL,
    description   TEXT,
    date_debut    TEXT NOT NULL,     -- ISO 8601 : "YYYY-MM-DDTHH:mm:ss"
    date_fin      TEXT,              -- Si null en DB, le backend défaut à date_debut
    type          TEXT DEFAULT 'evenement',
    couleur       TEXT DEFAULT '#7c6af7',
    employe_id    INTEGER REFERENCES employes(id) ON DELETE CASCADE,
    created_by_id INTEGER REFERENCES employes(id) ON DELETE SET NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  -- ── Coffre-fort : dossiers ─────────────────────────────────
  -- Arborescence de répertoires via parent_id (self-referencing).
  -- parent_id = NULL → dossier racine
  CREATE TABLE IF NOT EXISTS dossiers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom         TEXT NOT NULL,
    description TEXT,
    parent_id   INTEGER,            -- Référence vers dossiers.id (NULL = racine)
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ── Coffre-fort : documents ────────────────────────────────
  -- Métadonnées des fichiers uploadés. Le fichier physique est dans /uploads/.
  -- nom_fichier : nom sur disque (préfixé par timestamp pour éviter les conflits)
  -- nom         : nom original du fichier (affiché à l'utilisateur)
  -- taille      : chaîne affichable (ex : "250 KB", "1.2 MB")
  -- Statuts valides : 'Traité' | 'Vérifié' | 'En cours'
  CREATE TABLE IF NOT EXISTS documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom         TEXT NOT NULL,       -- Nom original affiché
    nom_fichier TEXT NOT NULL,       -- Nom réel sur disque (timestamp-nom.ext)
    type        TEXT,                -- 'PDF' | 'Word' | 'Excel' | 'Image' | 'Archive' | 'Texte' | 'Document'
    taille      TEXT,                -- Ex : "245 KB" ou "1.2 MB"
    statut      TEXT DEFAULT 'En cours',
    description TEXT,
    dossier_id  INTEGER,             -- Référence vers dossiers.id (NULL = racine)
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ═══════════════════════════════════════════════════════════════
// Migrations idempotentes (bases existantes uniquement)
// Chaque migration détecte l'état du schéma avant d'agir : sur une
// base neuve ou déjà migrée, tout ce bloc est un no-op.
// ═══════════════════════════════════════════════════════════════

const tableColumns = table =>
  db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

const tableExists = table =>
  !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);

// ── Migration 1 : employes.password_hash (bases très anciennes) ──
if (!tableColumns('employes').includes('password_hash')) {
  db.exec('ALTER TABLE employes ADD COLUMN password_hash TEXT');
}

// ── Migration 2 : employes.departement (TEXT) → departement_id (FK) ──
// Les départements sont créés depuis les valeurs texte distinctes existantes,
// puis chaque employé est rattaché par id : aucune donnée n'est perdue.
{
  const cols = tableColumns('employes');
  if (cols.includes('departement')) {
    db.transaction(() => {
      if (!cols.includes('departement_id')) {
        db.exec('ALTER TABLE employes ADD COLUMN departement_id INTEGER REFERENCES departements(id) ON DELETE SET NULL');
      }
      const noms = db.prepare(
        "SELECT DISTINCT TRIM(departement) AS nom FROM employes WHERE departement IS NOT NULL AND TRIM(departement) != ''"
      ).all();
      const insertDep = db.prepare('INSERT OR IGNORE INTO departements (nom) VALUES (?)');
      const linkDep   = db.prepare(`
        UPDATE employes SET departement_id = (SELECT id FROM departements WHERE nom = ?)
        WHERE TRIM(departement) = ? AND departement_id IS NULL
      `);
      for (const { nom } of noms) {
        insertDep.run(nom);
        linkDep.run(nom, nom);
      }
      db.exec('ALTER TABLE employes DROP COLUMN departement');
    })();
    console.log('✅ Migration : employes.departement → departement_id (FK)');
  }
}

// ── Migration 3 : ancienne table todos (notes rapides) → post-its ──
// L'ancien schéma (titre/description/priorite) est reconstruit vers le
// nouveau (content/color/created_by/status). Le contenu est préservé ;
// les todos legacy sont rattachés au premier admin (sinon ils ne seraient
// visibles par personne, la lecture étant filtrée par créateur/assigné).
if (tableColumns('todos').includes('titre')) {
  db.transaction(() => {
    // RENAME TO réécrit les clauses REFERENCES des autres tables : on
    // supprime la table de jointure (forcément vide à ce stade, elle vient
    // d'être créée) avant le rename, et on la recrée après, pour qu'elle
    // pointe bien vers la nouvelle table todos.
    db.exec('DROP TABLE IF EXISTS todo_assignees');
    db.exec('ALTER TABLE todos RENAME TO todos_legacy_migration');
    db.exec(TODOS_SCHEMA);
    db.exec(TODO_ASSIGNEES_SCHEMA);
    const admin = db.prepare("SELECT id FROM employes WHERE role = 'admin' ORDER BY id LIMIT 1").get();
    db.prepare(`
      INSERT INTO todos (content, created_by, status, created_at)
      SELECT
        titre || CASE WHEN description IS NOT NULL AND description != '' THEN ' — ' || description ELSE '' END,
        ?,
        CASE WHEN statut = 'terminé' THEN 'done' ELSE 'pending' END,
        created_at
      FROM todos_legacy_migration
    `).run(admin?.id ?? null);
    db.exec('DROP TABLE todos_legacy_migration');
  })();
  console.log('✅ Migration : todos (notes rapides) → todos (post-its)');
}

// ── Migration 4 : taches (legacy) → tasks (tâches de département) ──
// Les anciennes tâches n'avaient pas de département : elles sont rattachées
// à un département "Général" créé au besoin. L'ancien champ assignee (texte
// libre) est préservé en annotation dans la description.
if (tableExists('taches')) {
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO departements (nom) VALUES (?)').run('Général');
    const depId = db.prepare('SELECT id FROM departements WHERE nom = ?').get('Général').id;
    db.prepare(`
      INSERT INTO tasks (title, description, department_id, status, created_at)
      SELECT
        titre,
        CASE
          WHEN assignee IS NOT NULL AND assignee != ''
            THEN COALESCE(description || char(10), '') || '(Assigné legacy : ' || assignee || ')'
          ELSE description
        END,
        ?,
        CASE WHEN statut IN ('todo', 'in_progress', 'done') THEN statut ELSE 'todo' END,
        created_at
      FROM taches
    `).run(depId);
    db.exec('DROP TABLE taches');
  })();
  console.log('✅ Migration : taches → tasks (département "Général")');
}

// ── Migration 5 : planning.employe (TEXT) → employe_id (FK) ──
// Backfill par correspondance de nom insensible à la casse ("Prénom Nom",
// "Nom Prénom" ou "Nom" seul). Par prudence, la colonne texte n'est
// supprimée que si TOUTES les lignes ont pu être appariées : sinon elle est
// conservée et la migration se retentera au prochain démarrage (idempotent).
// NB : conservée bien que la table planning soit fusionnée dans evenements
// (migration 7) — sur une très vieille base, elle s'exécute AVANT la fusion
// pour que les créneaux soient migrés avec leur clé étrangère.
if (tableColumns('planning').includes('employe')) {
  const dropped = db.transaction(() => {
    if (!tableColumns('planning').includes('employe_id')) {
      db.exec('ALTER TABLE planning ADD COLUMN employe_id INTEGER REFERENCES employes(id) ON DELETE CASCADE');
    }
    db.exec(`
      UPDATE planning SET employe_id = (
        SELECT e.id FROM employes e
        WHERE LOWER(TRIM(COALESCE(e.prenom, '') || ' ' || e.nom)) = LOWER(TRIM(planning.employe))
           OR LOWER(TRIM(e.nom || ' ' || COALESCE(e.prenom, ''))) = LOWER(TRIM(planning.employe))
           OR LOWER(TRIM(e.nom)) = LOWER(TRIM(planning.employe))
        LIMIT 1
      )
      WHERE employe_id IS NULL
    `);
    const orphans = db.prepare(
      "SELECT COUNT(*) AS n FROM planning WHERE employe_id IS NULL AND employe IS NOT NULL AND TRIM(employe) != ''"
    ).get().n;
    if (orphans === 0) {
      db.exec('ALTER TABLE planning DROP COLUMN employe');
      return true;
    }
    console.warn(`⚠️  Migration planning : ${orphans} créneau(x) sans employé correspondant — colonne texte conservée`);
    return false;
  })();
  if (dropped) console.log('✅ Migration : planning.employe → employe_id (FK)');
}

// ── Migration 6 : evenements — colonnes employe_id / created_by_id ──
// Prépare le calendrier unifié : l'événement peut cibler un employé
// (planning, événement personnel) et connaît son créateur par FK.
// L'ancienne colonne created_by (texte libre, purement informative) est
// supprimée : la correspondance par nom serait trop peu fiable pour être
// migrée sans risque, et le champ n'était exploité nulle part.
{
  const cols = tableColumns('evenements');
  if (!cols.includes('employe_id')) {
    db.exec('ALTER TABLE evenements ADD COLUMN employe_id INTEGER REFERENCES employes(id) ON DELETE CASCADE');
    db.exec('ALTER TABLE evenements ADD COLUMN created_by_id INTEGER REFERENCES employes(id) ON DELETE SET NULL');
    console.log('✅ Migration : evenements.employe_id / created_by_id (FK)');
  }
  if (cols.includes('created_by')) {
    db.exec('ALTER TABLE evenements DROP COLUMN created_by');
    console.log('✅ Migration : evenements.created_by (texte) supprimé');
  }
}

// ── Migration 7 : fusion planning → evenements ──
// Chaque créneau devient un événement de type 'planning' (vert) ciblant
// l'employé : date + heures séparées sont concaténées en ISO 8601.
// Les éventuels créneaux sans employé (vieilles bases partiellement
// appariées) sont conservés en événements généraux plutôt que perdus.
if (tableExists('planning')) {
  db.transaction(() => {
    db.prepare(`
      INSERT INTO evenements (titre, date_debut, date_fin, type, couleur, employe_id)
      SELECT
        COALESCE(NULLIF(TRIM(projet), ''), 'Créneau de travail'),
        date || 'T' || heure_debut,
        date || 'T' || heure_fin,
        'planning',
        '#10b981',
        employe_id
      FROM planning
    `).run();
    db.exec('DROP TABLE planning');
  })();
  console.log('✅ Migration : planning → evenements (calendrier unifié)');
}

// ── Migration 8 : anciennes tables factures / automations (retirées) ──
// Ces deux fonctionnalités ont été retirées du périmètre de l'application ;
// on nettoie leurs tables si elles existent encore sur une base ancienne.
for (const table of ['factures', 'automations']) {
  if (tableExists(table)) {
    db.exec(`DROP TABLE ${table}`);
    console.log(`✅ Migration : table ${table} supprimée (fonctionnalité retirée)`);
  }
}

// ── Migration 9 : clients.dossier_id + dossier racine "Clients" ──
// Chaque client a désormais un sous-dossier dédié dans le coffre-fort,
// rangé sous un dossier racine fixe nommé "Clients" (pour ne pas polluer
// la racine de l'arborescence). Ce dossier racine est créé une seule fois,
// au démarrage, avant que routes/clients.js n'en ait besoin pour y créer
// les sous-dossiers de chaque client.
if (!tableColumns('clients').includes('dossier_id')) {
  db.exec('ALTER TABLE clients ADD COLUMN dossier_id INTEGER REFERENCES dossiers(id) ON DELETE SET NULL');
  console.log('✅ Migration : clients.dossier_id (FK)');
}
const clientsRootFolder = db.prepare(
  "SELECT id FROM dossiers WHERE nom = 'Clients' AND parent_id IS NULL"
).get();
if (!clientsRootFolder) {
  db.prepare("INSERT INTO dossiers (nom, description, parent_id) VALUES ('Clients', ?, NULL)")
    .run('Dossier racine automatique : contient un sous-dossier par client.');
  console.log('✅ Dossier racine "Clients" créé');
}

// Seed : créer un compte admin depuis les variables d'env s'il n'en existe aucun
const adminExists = db.prepare("SELECT id FROM employes WHERE role = 'admin' LIMIT 1").get();
if (!adminExists && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  db.prepare(`
    INSERT INTO employes (nom, prenom, email, poste, role, password_hash)
    VALUES (?, ?, ?, ?, 'admin', ?)
  `).run('Admin', 'Lexora', process.env.ADMIN_EMAIL, 'Administrateur', hash);
  console.log(`✅ Compte admin créé : ${process.env.ADMIN_EMAIL}`);
}

export default db;
