import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../models/db.js';

const router = Router();

// POST /api/auth/login — Connexion par email + mot de passe (tous les employés)
// Retourne : { token, user: { id, email, nom, prenom, role } }
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  const employe = db.prepare('SELECT * FROM employes WHERE email = ?').get(email);
  if (!employe || !employe.password_hash) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  const valid = bcrypt.compareSync(password, employe.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  // NB : rôle et département servent uniquement à adapter l'interface ;
  // les autorisations sont revérifiées côté serveur à chaque requête
  // (middleware loadUser), un token périmé ne donne donc aucun droit.
  const payload = {
    id:             employe.id,
    email:          employe.email,
    role:           employe.role,
    nom:            employe.nom,
    prenom:         employe.prenom,
    poste:          employe.poste,
    departement_id: employe.departement_id,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: payload });
});

export default router;
