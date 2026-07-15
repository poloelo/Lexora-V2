/**
 * seed.js — Données de démonstration
 *
 * Usage : npm run seed  (depuis lexora/backend)
 *
 * Peuple la base avec des départements, employés, tâches de département,
 * todos post-its et créneaux de planning cohérents entre eux (toutes les
 * références passent par les vraies clés étrangères).
 *
 * Idempotent : chaque entité est identifiée par sa clé naturelle
 * (nom de département, email d'employé...) et n'est insérée que si elle
 * n'existe pas déjà. Relancer le script ne duplique rien.
 *
 * Tous les comptes de démo utilisent le mot de passe : demo1234
 */

import bcrypt from 'bcryptjs';
import db from '../models/db.js';

const DEMO_PASSWORD = 'demo1234';
const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

// ── Départements ─────────────────────────────────────────────
const DEPARTEMENTS = ['Direction', 'Finance', 'Ressources Humaines', 'Technique', 'Commercial'];

const insertDep = db.prepare('INSERT OR IGNORE INTO departements (nom) VALUES (?)');
for (const nom of DEPARTEMENTS) insertDep.run(nom);

const depId = Object.fromEntries(
  db.prepare('SELECT id, nom FROM departements').all().map(d => [d.nom, d.id])
);

// ── Employés ─────────────────────────────────────────────────
// role : 'employe' | 'manager' | 'admin'
const EMPLOYES = [
  { nom: 'Lexora',  prenom: 'Admin',    email: 'admin@lexora.fr',     poste: 'Administrateur',       dep: 'Direction',            role: 'admin' },
  { nom: 'Dupont',  prenom: 'Marie',    email: 'm.dupont@lexora.fr',  poste: 'Directrice financière', dep: 'Finance',             role: 'manager' },
  { nom: 'Martin',  prenom: 'Sophie',   email: 's.martin@lexora.fr',  poste: 'Comptable',            dep: 'Finance',              role: 'employe' },
  { nom: 'Bernard', prenom: 'Julien',   email: 'j.bernard@lexora.fr', poste: 'Développeur',          dep: 'Technique',            role: 'employe' },
  { nom: 'Petit',   prenom: 'Antoine',  email: 'a.petit@lexora.fr',   poste: 'Lead technique',       dep: 'Technique',            role: 'manager' },
  { nom: 'Moreau',  prenom: 'Camille',  email: 'c.moreau@lexora.fr',  poste: 'Chargée RH',           dep: 'Ressources Humaines',  role: 'employe' },
  { nom: 'Roux',    prenom: 'Thomas',   email: 't.roux@lexora.fr',    poste: 'Commercial',           dep: 'Commercial',           role: 'employe' },
];

const findEmploye   = db.prepare('SELECT id FROM employes WHERE email = ?');
const insertEmploye = db.prepare(`
  INSERT INTO employes (nom, prenom, email, poste, departement_id, role, password_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const e of EMPLOYES) {
  if (!findEmploye.get(e.email)) {
    insertEmploye.run(e.nom, e.prenom, e.email, e.poste, depId[e.dep], e.role, hash);
  }
}

const empId = Object.fromEntries(
  db.prepare('SELECT id, email FROM employes').all().map(e => [e.email, e.id])
);

// ── Tâches de département ────────────────────────────────────
const TASKS = [
  { title: 'Générer le rapport Q3',           description: 'Consolidation des comptes du troisième trimestre.', dep: 'Finance',   by: 'm.dupont@lexora.fr', status: 'in_progress', priority: 'high',   due: '2026-07-31' },
  { title: 'Relancer les factures impayées',  description: 'Clients avec plus de 30 jours de retard.',          dep: 'Finance',   by: 'm.dupont@lexora.fr', status: 'todo',        priority: 'medium', due: '2026-07-20' },
  { title: 'Clôturer le budget prévisionnel', description: null,                                                dep: 'Finance',   by: 'm.dupont@lexora.fr', status: 'done',        priority: 'low',    due: '2026-06-30' },
  { title: 'Migrer le serveur de staging',    description: 'Passage sur la nouvelle infrastructure.',           dep: 'Technique', by: 'a.petit@lexora.fr',  status: 'in_progress', priority: 'high',   due: '2026-07-18' },
  { title: 'Corriger le bug d\'export PDF',   description: 'Les factures de plus de 2 pages sont tronquées.',   dep: 'Technique', by: 'a.petit@lexora.fr',  status: 'todo',        priority: 'medium', due: null },
  { title: 'Préparer les entretiens annuels', description: 'Planifier les créneaux de septembre.',              dep: 'Ressources Humaines', by: 'admin@lexora.fr', status: 'todo',  priority: 'medium', due: '2026-08-15' },
  { title: 'Mettre à jour le pipeline CRM',   description: null,                                                dep: 'Commercial', by: 'admin@lexora.fr',   status: 'todo',        priority: 'low',    due: null },
];

const findTask   = db.prepare('SELECT id FROM tasks WHERE title = ? AND department_id = ?');
const insertTask = db.prepare(`
  INSERT INTO tasks (title, description, department_id, created_by, status, priority, due_date)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const t of TASKS) {
  if (!findTask.get(t.title, depId[t.dep])) {
    insertTask.run(t.title, t.description, depId[t.dep], empId[t.by], t.status, t.priority, t.due);
  }
}

// ── Todos post-its ───────────────────────────────────────────
// Couleurs de la palette post-it du frontend
const TODOS = [
  { content: 'Envoyer le récap de réunion à l\'équipe',      color: '#fef3c7', by: 'm.dupont@lexora.fr', to: ['s.martin@lexora.fr'],                        status: 'pending' },
  { content: 'Vérifier les accès du nouveau stagiaire',      color: '#dbeafe', by: 'a.petit@lexora.fr',  to: ['j.bernard@lexora.fr'],                       status: 'pending' },
  { content: 'Réserver la salle pour le point mensuel',      color: '#dcfce7', by: 'admin@lexora.fr',    to: ['c.moreau@lexora.fr', 't.roux@lexora.fr'],    status: 'pending' },
  { content: 'Relire la note de frais de juin',              color: '#fce7f3', by: 'm.dupont@lexora.fr', to: ['m.dupont@lexora.fr'],                        status: 'done' },
  { content: 'Mettre à jour la doc d\'onboarding',           color: '#ede9fe', by: 'a.petit@lexora.fr',  to: ['j.bernard@lexora.fr', 'a.petit@lexora.fr'],  status: 'pending' },
];

const findTodo       = db.prepare('SELECT id FROM todos WHERE content = ? AND created_by = ?');
const insertTodo     = db.prepare(`
  INSERT INTO todos (content, color, created_by, status, done_at)
  VALUES (?, ?, ?, ?, CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END)
`);
const insertAssignee = db.prepare('INSERT OR IGNORE INTO todo_assignees (todo_id, assignee_id) VALUES (?, ?)');
for (const t of TODOS) {
  if (!findTodo.get(t.content, empId[t.by])) {
    const { lastInsertRowid } = insertTodo.run(t.content, t.color, empId[t.by], t.status, t.status);
    for (const email of t.to) insertAssignee.run(lastInsertRowid, empId[email]);
  }
}

// ── Événements (calendrier unifié) ───────────────────────────
// Trois natures illustrées : planning posé par le manager du département
// (vert, cible un employé), réunion générale (visible par tous, pas de
// cible) et événement personnel (créé pour soi, visible par son manager).
const EVENEMENTS = [
  // Planning (type 'planning', couleur verte imposée, créé par le manager)
  { titre: 'Clôture Q3',        debut: '2026-07-13T09:00:00', fin: '2026-07-13T17:00:00', type: 'planning', couleur: '#10b981', pour: 's.martin@lexora.fr',  par: 'm.dupont@lexora.fr' },
  { titre: 'Migration staging', debut: '2026-07-13T10:00:00', fin: '2026-07-15T18:00:00', type: 'planning', couleur: '#10b981', pour: 'j.bernard@lexora.fr', par: 'a.petit@lexora.fr'  },
  { titre: 'Salon PME',         debut: '2026-07-15T09:00:00', fin: '2026-07-16T17:00:00', type: 'planning', couleur: '#10b981', pour: 't.roux@lexora.fr',    par: 'admin@lexora.fr'    },
  // Réunion générale — employe_id NULL, visible par tout le monde
  { titre: 'Réunion mensuelle toute l\'équipe', debut: '2026-07-17T14:00:00', fin: '2026-07-17T15:30:00', type: 'rdv', couleur: '#7c6af7', pour: null, par: 'admin@lexora.fr' },
  // Événement personnel — créé pour soi, visible par soi + son manager
  { titre: 'Relancer la mutuelle', debut: '2026-07-16T11:00:00', fin: '2026-07-16T11:30:00', type: 'rappel', couleur: '#f59e0b', pour: 's.martin@lexora.fr', par: 's.martin@lexora.fr' },
];

const findEvenement   = db.prepare('SELECT id FROM evenements WHERE titre = ? AND date_debut = ?');
const insertEvenement = db.prepare(`
  INSERT INTO evenements (titre, date_debut, date_fin, type, couleur, employe_id, created_by_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const e of EVENEMENTS) {
  if (!findEvenement.get(e.titre, e.debut)) {
    insertEvenement.run(e.titre, e.debut, e.fin, e.type, e.couleur, e.pour ? empId[e.pour] : null, empId[e.par]);
  }
}

// ── Clients ────────────────────────────────────────────────
// Le dossier racine "Clients" est créé par la migration 9 de db.js (elle
// s'exécute à l'import ci-dessus, avant ce script) : il existe donc déjà.
// Chaque client de démo reçoit son sous-dossier automatique, comme le fait
// POST /api/clients en conditions réelles.
const CLIENTS = [
  { nom: 'Société Lumina',    email: 'contact@lumina.fr',    telephone: '01 23 45 67 89' },
  { nom: 'Jean Berthier',     email: 'j.berthier@mail.fr',   telephone: '06 12 34 56 78' },
  { nom: 'Atelier Verrier',   email: 'contact@atelier-v.fr', telephone: '01 98 76 54 32' },
];

const clientsRootId = db.prepare(
  "SELECT id FROM dossiers WHERE nom = 'Clients' AND parent_id IS NULL"
).get().id;

const findClient   = db.prepare('SELECT id FROM clients WHERE email = ?');
const insertClient = db.prepare(`
  INSERT INTO clients (nom, email, telephone) VALUES (?, ?, ?)
`);
const insertDossier = db.prepare(
  'INSERT INTO dossiers (nom, description, parent_id) VALUES (?, ?, ?)'
);
const linkDossier = db.prepare('UPDATE clients SET dossier_id = ? WHERE id = ?');

for (const c of CLIENTS) {
  if (!findClient.get(c.email)) {
    const { lastInsertRowid: clientId } = insertClient.run(c.nom, c.email, c.telephone);
    const { lastInsertRowid: dossierId } = insertDossier.run(c.nom, null, clientsRootId);
    linkDossier.run(dossierId, clientId);
  }
}

// ── Contrôle d'intégrité : événements généraux "hérités" ─────
// Sur une base ayant traversé les migrations, les événements créés avant
// le calendrier unifié (employe_id ET created_by_id NULL) sont devenus
// généraux : visibles par toute l'entreprise. On les signale pour que
// l'utilisateur puisse trier — impossible de deviner leur cible d'origine.
const heritages = db.prepare(`
  SELECT COUNT(*) AS n FROM evenements
  WHERE employe_id IS NULL AND created_by_id IS NULL
`).get().n;
if (heritages > 0) {
  console.warn(`⚠️  ${heritages} événement(s) hérité(s) d'une ancienne base (sans cible ni créateur) : ils sont`);
  console.warn('   visibles par tout le monde. Supprimez-les depuis le calendrier s\'ils sont indésirables.');
}

console.log('✅ Seed terminé');
console.log(`   Départements : ${db.prepare('SELECT COUNT(*) AS n FROM departements').get().n}`);
console.log(`   Employés     : ${db.prepare('SELECT COUNT(*) AS n FROM employes').get().n} (mot de passe démo : ${DEMO_PASSWORD})`);
console.log(`   Tasks        : ${db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n}`);
console.log(`   Todos        : ${db.prepare('SELECT COUNT(*) AS n FROM todos').get().n}`);
console.log(`   Événements   : ${db.prepare('SELECT COUNT(*) AS n FROM evenements').get().n}`);
console.log(`   Clients      : ${db.prepare('SELECT COUNT(*) AS n FROM clients').get().n} (chacun avec son dossier dans Clients/)`);
