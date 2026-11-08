/**
 * setup.js — Environnement des tests
 *
 * Chaque lancement des tests utilise une base SQLite neuve, dans le dossier
 * temporaire du système : la vraie base lexora.db n'est jamais touchée.
 */

import os from 'os';
import path from 'path';

process.env.DB_PATH    = path.join(os.tmpdir(), `lexora-test-${process.pid}.db`);
process.env.JWT_SECRET = 'secret-de-test';
