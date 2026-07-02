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
 * Chemin du fichier SQLite : variable d'env DB_PATH (défaut : ./lexora.db)
 * En Docker : /app/data/lexora.db (monté dans le volume sqlite-data)
 */

import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

// Résolution du chemin absolu pour éviter les problèmes selon le répertoire courant
const dbPath = process.env.DB_PATH || './lexora.db';
const db = new Database(path.resolve(dbPath));

// Création du schéma complet en une seule transaction
// (db.exec exécute un bloc SQL multi-instructions)
db.exec(`
  -- ── Tâches projet ─────────────────────────────────────────
  -- Statuts valides : 'todo' | 'in_progress' | 'done'
  CREATE TABLE IF NOT EXISTS taches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titre       TEXT NOT NULL,
    description TEXT,
    statut      TEXT DEFAULT 'todo',
    assignee    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ── Factures ───────────────────────────────────────────────
  -- Statuts valides : 'en attente' | 'payee' | 'annulee'
  -- montant stocké en REAL (virgule flottante) — suffisant pour des montants en €
  CREATE TABLE IF NOT EXISTS factures (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    client         TEXT NOT NULL,
    montant        REAL NOT NULL,
    statut         TEXT DEFAULT 'en attente',
    date_emission  TEXT,            -- Format : "YYYY-MM-DD"
    date_echeance  TEXT             -- Format : "YYYY-MM-DD"
  );

  -- ── Planning des employés ──────────────────────────────────
  -- Représente un créneau de travail : qui, quand, de quelle heure à quelle heure.
  -- Ces entrées apparaissent aussi dans le calendrier (vue verte "Planning").
  CREATE TABLE IF NOT EXISTS planning (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employe     TEXT NOT NULL,
    date        TEXT NOT NULL,       -- Format : "YYYY-MM-DD"
    heure_debut TEXT NOT NULL,       -- Format : "HH:mm"
    heure_fin   TEXT NOT NULL,       -- Format : "HH:mm"
    projet      TEXT                 -- Optionnel : nom du projet associé
  );

  -- ── Notes rapides (Todos) ──────────────────────────────────
  -- Notes légères avec priorité.
  -- Statuts valides : 'à faire' | 'en cours' | 'terminé'
  -- Priorités valides : 'basse' | 'normale' | 'haute'
  CREATE TABLE IF NOT EXISTS todos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titre       TEXT NOT NULL,
    description TEXT,
    date        TEXT,                -- Date cible optionnelle (Format : "YYYY-MM-DD")
    priorite    TEXT DEFAULT 'normale',
    statut      TEXT DEFAULT 'à faire',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ── Clients ────────────────────────────────────────────────
  -- Gère deux types : 'particulier' (nom + prénom) et 'entreprise' (raison sociale + SIRET).
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
    created_at     TEXT DEFAULT (datetime('now'))
  );

  -- ── Employés ───────────────────────────────────────────────
  -- Répertoire interne de l'équipe. Accès restreint (admin uniquement).
  -- Rôles valides : 'employe' | 'admin' (non utilisé pour l'auth ici)
  CREATE TABLE IF NOT EXISTS employes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT NOT NULL,
    prenom        TEXT,
    email         TEXT NOT NULL,
    poste         TEXT,
    departement   TEXT,
    salaire       REAL,
    date_embauche TEXT,             -- Format : "YYYY-MM-DD"
    role          TEXT DEFAULT 'employe',
    password_hash TEXT,                -- NULL = compte sans mot de passe (legacy)
    created_at    TEXT DEFAULT (datetime('now'))
  );

  -- ── Automatisations ────────────────────────────────────────
  -- Règles d'automatisation configurables (actuellement descriptives,
  -- non exécutées automatiquement — à implémenter selon les besoins).
  -- actif stocké en INTEGER : 1 = actif, 0 = inactif (booléen SQLite)
  CREATE TABLE IF NOT EXISTS automations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom         TEXT NOT NULL,
    description TEXT,
    type        TEXT,
    frequence   TEXT,
    action      TEXT NOT NULL,
    actif       INTEGER DEFAULT 1,  -- 1 = actif, 0 = inactif
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ── Événements du calendrier ───────────────────────────────
  -- Types valides : 'rdv' | 'tache' | 'rappel' | 'evenement' | 'planning'
  -- couleur : code hexadécimal CSS (ex : '#7c6af7')
  -- Les dates sont stockées en ISO 8601 : "2026-05-20T09:00:00"
  CREATE TABLE IF NOT EXISTS evenements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titre       TEXT NOT NULL,
    description TEXT,
    date_debut  TEXT NOT NULL,       -- ISO 8601 : "YYYY-MM-DDTHH:mm:ss"
    date_fin    TEXT,                -- Si null en DB, le backend défaut à date_debut
    type        TEXT DEFAULT 'evenement',
    couleur     TEXT DEFAULT '#7c6af7',
    created_by  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
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

// Migration : ajouter password_hash si la colonne n'existe pas encore (base existante)
const cols = db.prepare("PRAGMA table_info(employes)").all().map(c => c.name);
if (!cols.includes('password_hash')) {
  db.exec("ALTER TABLE employes ADD COLUMN password_hash TEXT");
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
