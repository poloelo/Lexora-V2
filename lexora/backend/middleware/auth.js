import jwt from 'jsonwebtoken';
import db from '../models/db.js';

export function verifyJWT(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = header.slice(7);
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

/**
 * loadUser — recharge l'employé courant depuis la base après verifyJWT.
 *
 * Le token vit 24h : rôle et département peuvent avoir changé entre-temps
 * (promotion, changement d'équipe, départ). On ne fait donc pas confiance
 * au payload du JWT pour les autorisations : on relit la ligne employes
 * à chaque requête et on l'expose dans req.user.
 */
export function loadUser(req, res, next) {
  const user = db.prepare(
    'SELECT id, nom, prenom, email, role, departement_id FROM employes WHERE id = ?'
  ).get(req.admin?.id);
  if (!user) return res.status(401).json({ error: 'Compte introuvable' });
  req.user = user;
  next();
}

/**
 * requireRole — restreint une route aux rôles listés.
 * Usage : router.post('/', requireRole('manager', 'admin'), handler)
 * À monter après verifyJWT + loadUser.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Accès refusé : rôle insuffisant' });
    }
    next();
  };
}
