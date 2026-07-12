import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../models/db.js';
import { verifyJWT, loadUser, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyJWT, loadUser);

// L'ancien alias isAdmin ne vérifiait que le JWT, pas le rôle : on applique
// désormais un vrai contrôle de rôle (le token seul ne suffit plus).
const isAdmin = requireRole('admin');

const ROLES = ['employe', 'manager', 'admin'];

// SELECT commun : l'employé + nom de son département (jamais le password_hash)
const EMPLOYE_SELECT = `
  SELECT e.id, e.nom, e.prenom, e.email, e.poste, e.departement_id, d.nom AS departement_nom,
         e.salaire, e.date_embauche, e.role, e.created_at
  FROM employes e
  LEFT JOIN departements d ON d.id = e.departement_id
`;

// Valide le departement_id s'il est fourni ; renvoie un message ou null
function checkDepartement(departement_id) {
  if (departement_id == null) return null;
  const dep = db.prepare('SELECT id FROM departements WHERE id = ?').get(departement_id);
  return dep ? null : 'departement_id inconnu';
}

// GET /selector — Annuaire minimal pour les sélecteurs d'assignation
// (manager/admin uniquement ; seulement id + nom : minimisation des données)
router.get('/selector', requireRole('manager', 'admin'), (req, res) => {
  try {
    const employes = db.prepare(`
      SELECT id, TRIM(COALESCE(prenom, '') || ' ' || COALESCE(nom, '')) AS nom
      FROM employes ORDER BY nom ASC
    `).all();
    res.json(employes);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET — Tous les employés (Admin) — password_hash exclu de la réponse
router.get('/', isAdmin, (req, res) => {
  try {
    const employes = db.prepare(`${EMPLOYE_SELECT} ORDER BY e.nom ASC`).all();
    res.json(employes);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET — Un employé par ID (Admin)
router.get('/:id', isAdmin, (req, res) => {
  try {
    const employe = db.prepare(`${EMPLOYE_SELECT} WHERE e.id = ?`).get(req.params.id);
    if (!employe) return res.status(404).json({ error: 'Employé non trouvé' });
    res.json(employe);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un employé (Admin)
// Body: { nom, prenom, email, poste, departement_id, salaire, date_embauche, role, password }
router.post('/', isAdmin, (req, res) => {
  try {
    const { nom, prenom, email, poste, departement_id, salaire, date_embauche, role, password } = req.body;
    if (!nom)   return res.status(400).json({ error: 'nom requis' });
    if (!email) return res.status(400).json({ error: 'email requis' });
    if (!password) return res.status(400).json({ error: 'mot de passe requis' });
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: `role invalide (attendu : ${ROLES.join(' | ')})` });
    }
    const depError = checkDepartement(departement_id);
    if (depError) return res.status(400).json({ error: depError });

    const existing = db.prepare('SELECT id FROM employes WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email déjà utilisé' });

    const password_hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO employes (nom, prenom, email, poste, departement_id, salaire, date_embauche, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nom, prenom, email, poste ?? null, departement_id ?? null, salaire ?? null, date_embauche ?? null, role || 'employe', password_hash);

    const employe = db.prepare(`${EMPLOYE_SELECT} WHERE e.id = ?`).get(result.lastInsertRowid);
    res.status(201).json(employe);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// PUT — Modifier un employé (Admin)
router.put('/:id', isAdmin, (req, res) => {
  try {
    const { nom, prenom, email, poste, departement_id, salaire, date_embauche, role } = req.body;
    const employe = db.prepare('SELECT id FROM employes WHERE id = ?').get(req.params.id);
    if (!employe) return res.status(404).json({ error: 'Employé non trouvé' });
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: `role invalide (attendu : ${ROLES.join(' | ')})` });
    }
    const depError = checkDepartement(departement_id);
    if (depError) return res.status(400).json({ error: depError });

    db.prepare(`
      UPDATE employes SET nom = ?, prenom = ?, email = ?, poste = ?,
      departement_id = ?, salaire = ?, date_embauche = ?, role = ?
      WHERE id = ?
    `).run(nom, prenom, email, poste, departement_id ?? null, salaire, date_embauche, role, req.params.id);
    const updated = db.prepare(`${EMPLOYE_SELECT} WHERE e.id = ?`).get(req.params.id);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /employes/:id/password — Réinitialiser le mot de passe (Admin)
router.put('/:id/password', isAdmin, (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Nouveau mot de passe requis' });
    const employe = db.prepare('SELECT id FROM employes WHERE id = ?').get(req.params.id);
    if (!employe) return res.status(404).json({ error: 'Employé non trouvé' });
    const password_hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE employes SET password_hash = ? WHERE id = ?').run(password_hash, req.params.id);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer un employé (Admin)
// RGPD : la suppression purge en cascade ses créneaux de planning et ses
// assignations de todos ; ses tâches/todos créés perdent la référence
// nominative (created_by → NULL). Voir les ON DELETE dans db.js.
router.delete('/:id', isAdmin, (req, res) => {
  try {
    const employe = db.prepare('SELECT id FROM employes WHERE id = ?').get(req.params.id);
    if (!employe) return res.status(404).json({ error: 'Employé non trouvé' });
    db.prepare('DELETE FROM employes WHERE id = ?').run(req.params.id);
    res.json({ message: 'Employé supprimé' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
