import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../models/db.js';
import { verifyJWT } from '../middleware/auth.js';

const router = express.Router();

const isAdmin = verifyJWT;

// GET — Tous les employés (Admin) — password_hash exclu de la réponse
router.get('/', isAdmin, (req, res) => {
  try {
    const employes = db.prepare(
      'SELECT id, nom, prenom, email, poste, departement, salaire, date_embauche, role, created_at FROM employes ORDER BY nom ASC'
    ).all();
    res.json(employes);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET — Un employé par ID (Admin)
router.get('/:id', isAdmin, (req, res) => {
  try {
    const employe = db.prepare(
      'SELECT id, nom, prenom, email, poste, departement, salaire, date_embauche, role, created_at FROM employes WHERE id = ?'
    ).get(req.params.id);
    if (!employe) return res.status(404).json({ error: 'Employé non trouvé' });
    res.json(employe);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un employé (Admin)
// Body: { nom, prenom, email, poste, departement, salaire, date_embauche, role, password }
router.post('/', isAdmin, (req, res) => {
  try {
    const { nom, prenom, email, poste, departement, salaire, date_embauche, role, password } = req.body;
    if (!nom)   return res.status(400).json({ error: 'nom requis' });
    if (!email) return res.status(400).json({ error: 'email requis' });
    if (!password) return res.status(400).json({ error: 'mot de passe requis' });

    const existing = db.prepare('SELECT id FROM employes WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email déjà utilisé' });

    const password_hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO employes (nom, prenom, email, poste, departement, salaire, date_embauche, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nom, prenom, email, poste ?? null, departement ?? null, salaire ?? null, date_embauche ?? null, role || 'employe', password_hash);

    const employe = db.prepare(
      'SELECT id, nom, prenom, email, poste, departement, salaire, date_embauche, role, created_at FROM employes WHERE id = ?'
    ).get(result.lastInsertRowid);
    res.status(201).json(employe);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// PUT — Modifier un employé (Admin)
router.put('/:id', isAdmin, (req, res) => {
  try {
    const { nom, prenom, email, poste, departement, salaire, date_embauche, role } = req.body;
    const employe = db.prepare('SELECT id FROM employes WHERE id = ?').get(req.params.id);
    if (!employe) return res.status(404).json({ error: 'Employé non trouvé' });
    db.prepare(`
      UPDATE employes SET nom = ?, prenom = ?, email = ?, poste = ?,
      departement = ?, salaire = ?, date_embauche = ?, role = ?
      WHERE id = ?
    `).run(nom, prenom, email, poste, departement, salaire, date_embauche, role, req.params.id);
    const updated = db.prepare(
      'SELECT id, nom, prenom, email, poste, departement, salaire, date_embauche, role, created_at FROM employes WHERE id = ?'
    ).get(req.params.id);
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
