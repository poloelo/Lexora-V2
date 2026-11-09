/**
 * routes/activity.js — Consultation du journal d'activité (admin uniquement)
 *
 * GET /api/activity?limit=50&action=client
 *   → { enabled: true|false, entries: [...] }
 * Les entrées viennent de Redis (voir services/activity.js).
 */

import { Router } from 'express';
import { verifyJWT, loadUser, requireRole } from '../middleware/auth.js';
import { getActivity, activityEnabled } from '../services/activity.js';

const router = Router();
router.use(verifyJWT, loadUser, requireRole('admin'));

const ACTIONS = ['auth', 'client', 'employe', 'document', 'task'];

router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const action = ACTIONS.includes(req.query.action) ? req.query.action : undefined;
  try {
    res.json({ enabled: activityEnabled(), entries: await getActivity({ limit, action }) });
  } catch {
    res.status(500).json({ error: 'Erreur de lecture du journal' });
  }
});

export default router;
