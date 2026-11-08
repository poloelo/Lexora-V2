/**
 * api.test.js — Tests d'intégration de l'API Lexora
 *
 * supertest envoie de vraies requêtes HTTP à l'application Express
 * (sans ouvrir de port) ; la base est une base SQLite de test vide
 * (voir tests/setup.js), remplie ici avec un jeu de données minimal.
 *
 * Lancer : npm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import db from '../models/db.js';

const PASSWORD = 'motdepasse123';
let finance, technique;           // ids des deux départements de test
const tokens = {};                // jeton JWT par rôle

// Crée un employé en base avec un mot de passe haché
function creerEmploye(email, role, departementId) {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  db.prepare(`
    INSERT INTO employes (nom, prenom, email, role, departement_id, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('Test', role, email, role, departementId, hash);
}

// Se connecte via l'API et renvoie le jeton
async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.token;
}

beforeAll(async () => {
  finance   = db.prepare("INSERT INTO departements (nom) VALUES ('Finance test')").run().lastInsertRowid;
  technique = db.prepare("INSERT INTO departements (nom) VALUES ('Technique test')").run().lastInsertRowid;

  creerEmploye('admin@test.fr',   'admin',   null);
  creerEmploye('manager@test.fr', 'manager', finance);
  creerEmploye('employe@test.fr', 'employe', finance);

  tokens.admin   = await login('admin@test.fr');
  tokens.manager = await login('manager@test.fr');
  tokens.employe = await login('employe@test.fr');
});

const auth = role => ({ Authorization: `Bearer ${tokens[role]}` });

// ── Authentification ─────────────────────────────────────────
describe('Authentification', () => {
  it('connecte un employé avec les bons identifiants et renvoie un JWT', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'employe@test.fr', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.role).toBe('employe');
    expect(res.body.user.password_hash).toBeUndefined(); // le hash ne sort jamais
  });

  it('refuse un mauvais mot de passe avec le même message qu\'un email inconnu', async () => {
    const mauvaisMdp = await request(app)
      .post('/api/auth/login')
      .send({ email: 'employe@test.fr', password: 'faux' });
    const emailInconnu = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@test.fr', password: 'faux' });

    expect(mauvaisMdp.status).toBe(401);
    expect(emailInconnu.status).toBe(401);
    expect(mauvaisMdp.body.error).toBe(emailInconnu.body.error);
  });

  it('refuse l\'accès à une route protégée sans jeton (401)', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('refuse un jeton falsifié (401)', async () => {
    const res = await request(app).get('/api/tasks').set({ Authorization: 'Bearer faux.jeton.jwt' });
    expect(res.status).toBe(401);
  });
});

// ── Tâches de département : règles métier par rôle ───────────
describe('Tâches de département', () => {
  it('interdit à un employé de créer une tâche (403)', async () => {
    const res = await request(app)
      .post('/api/tasks').set(auth('employe'))
      .send({ title: 'Tâche interdite', department_id: finance });
    expect(res.status).toBe(403);
  });

  it('permet à un manager de créer une tâche dans son département (201)', async () => {
    const res = await request(app)
      .post('/api/tasks').set(auth('manager'))
      .send({ title: 'Clôture mensuelle', department_id: finance, priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Clôture mensuelle');
    expect(res.body.status).toBe('todo'); // valeur par défaut
  });

  it('interdit à un manager de créer une tâche dans un autre département (403)', async () => {
    const res = await request(app)
      .post('/api/tasks').set(auth('manager'))
      .send({ title: 'Hors périmètre', department_id: technique });
    expect(res.status).toBe(403);
  });

  it('rejette un statut hors liste blanche (400)', async () => {
    const res = await request(app)
      .post('/api/tasks').set(auth('admin'))
      .send({ title: 'Statut invalide', department_id: finance, status: 'termine' });
    expect(res.status).toBe(400);
  });

  it('ne montre à un employé que les tâches de son département', async () => {
    await request(app)
      .post('/api/tasks').set(auth('admin'))
      .send({ title: 'Tâche technique', department_id: technique });

    const res = await request(app).get('/api/tasks').set(auth('employe'));

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(t => t.department_id === finance)).toBe(true);
  });

  it('retire les droits dès que le rôle change en base, même avec un jeton encore valide', async () => {
    db.prepare("UPDATE employes SET role = 'employe' WHERE email = 'manager@test.fr'").run();

    const res = await request(app)
      .post('/api/tasks').set(auth('manager')) // ancien jeton "manager"
      .send({ title: 'Après rétrogradation', department_id: finance });
    expect(res.status).toBe(403);

    db.prepare("UPDATE employes SET role = 'manager' WHERE email = 'manager@test.fr'").run();
  });
});

// ── Clients et coffre-fort ───────────────────────────────────
describe('Clients', () => {
  let clientId;

  it('crée le client et son dossier dans le coffre-fort en une seule transaction', async () => {
    const res = await request(app)
      .post('/api/clients').set(auth('employe'))
      .send({ type_client: 'particulier', nom: 'Durand', prenom: 'Léa', email: 'lea@exemple.fr' });

    expect(res.status).toBe(201);
    expect(res.body.dossier_id).not.toBeNull();

    const dossier = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(res.body.dossier_id);
    expect(dossier).toBeDefined();
    clientId = res.body.id;
  });

  it('rejette un client sans email (400)', async () => {
    const res = await request(app)
      .post('/api/clients').set(auth('employe'))
      .send({ nom: 'Sans email' });
    expect(res.status).toBe(400);
  });

  it('demande une confirmation avant de supprimer un client qui a un dossier (409)', async () => {
    const res = await request(app).delete(`/api/clients/${clientId}`).set(auth('employe'));

    expect(res.status).toBe(409);
    expect(res.body.requiresConfirmation).toBe(true);
    // rien n'a été supprimé
    expect(db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)).toBeDefined();
  });

  it('supprime le client et son dossier quand on le confirme', async () => {
    const { dossier_id } = db.prepare('SELECT dossier_id FROM clients WHERE id = ?').get(clientId);
    const res = await request(app)
      .delete(`/api/clients/${clientId}?deleteDossier=true`).set(auth('employe'));

    expect(res.status).toBe(200);
    expect(db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM dossiers WHERE id = ?').get(dossier_id)).toBeUndefined();
  });
});
