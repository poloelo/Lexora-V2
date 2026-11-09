/**
 * activity.test.js — Tests du journal d'activité (Redis)
 *
 * Ces tests ont besoin d'un serveur Redis. Lancer par exemple :
 *   docker run -d -p 6379:6379 redis:7-alpine
 *   REDIS_URL=redis://localhost:6379 npm test
 * Sans REDIS_URL, seuls les tests « sans Redis » s'exécutent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import db from '../models/db.js';
import { connectActivity, disconnectActivity, clearActivity, logActivity, activityEnabled } from '../services/activity.js';

const PASSWORD = 'motdepasse123';
const REDIS_URL = process.env.REDIS_URL;

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.token;
}

function creerEmploye(email, role) {
  const existing = db.prepare('SELECT id FROM employes WHERE email = ?').get(email);
  if (existing) return;
  db.prepare('INSERT INTO employes (nom, prenom, email, role, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run('Journal', role, email, role, bcrypt.hashSync(PASSWORD, 10));
}

describe('Journal d\'activité — sans Redis', () => {
  it('ne bloque jamais une action métier si Redis est absent', async () => {
    expect(activityEnabled()).toBe(false);
    await expect(logActivity(null, 'test', 'ne fait rien')).resolves.toBeUndefined();
  });
});

describe.skipIf(!REDIS_URL)('Journal d\'activité — avec Redis', () => {
  let adminToken, employeToken;

  beforeAll(async () => {
    await connectActivity(REDIS_URL);
    await clearActivity();
    creerEmploye('admin.journal@test.fr', 'admin');
    creerEmploye('employe.journal@test.fr', 'employe');
    adminToken = await login('admin.journal@test.fr');
    employeToken = await login('employe.journal@test.fr');
  });

  afterAll(async () => {
    await clearActivity();
    await disconnectActivity();
  });

  const auth = t => ({ Authorization: `Bearer ${t}` });

  it('enregistre les connexions réussies et les échecs', async () => {
    await request(app).post('/api/auth/login').send({ email: 'admin.journal@test.fr', password: 'faux' });

    const res = await request(app).get('/api/activity?action=auth').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    const actions = res.body.entries.map(e => e.action);
    expect(actions).toContain('auth.login');
    expect(actions).toContain('auth.failed');
  });

  it('enregistre la création d\'un client, la plus récente en premier', async () => {
    await request(app).post('/api/clients').set(auth(employeToken))
      .send({ type_client: 'particulier', nom: 'Journal', prenom: 'Test', email: 'journal@exemple.fr' });

    const res = await request(app).get('/api/activity?limit=1').set(auth(adminToken));
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('client.create');
    expect(res.body.entries[0].label).toContain('Test Journal');
    expect(res.body.entries[0].role).toBe('employe');
  });

  it('réserve la lecture du journal aux administrateurs (403)', async () => {
    const res = await request(app).get('/api/activity').set(auth(employeToken));
    expect(res.status).toBe(403);
  });
});
