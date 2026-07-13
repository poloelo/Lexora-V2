/**
 * clients.js — Routes CRUD pour le CRM clients
 *
 * Chaque client a un sous-dossier dédié dans le coffre-fort documentaire,
 * créé automatiquement à sa création et rangé sous le dossier racine fixe
 * "Clients" (créé une seule fois par la migration 9 de db.js, pour ne pas
 * polluer la racine de l'arborescence). Ce sous-dossier accueille librement
 * les pièces du client : factures PDF, contrats, pièces d'identité...
 *
 * Suppression : le dossier associé n'est jamais supprimé silencieusement.
 * Un premier DELETE sans paramètre est refusé (409) si un dossier existe,
 * pour que le frontend affiche une modale de confirmation ; l'appel suivant
 * précise explicitement le sort du dossier via ?deleteDossier=true|false.
 */

import express from 'express';
import db from '../models/db.js';
import { verifyJWT, loadUser } from '../middleware/auth.js';
import { supprimerDossierRecursif } from './documents.js';

const router = express.Router();

// Toutes les routes clients exigent un utilisateur authentifié
router.use(verifyJWT, loadUser);

// Nom affichable utilisé pour le sous-dossier : raison sociale pour une
// entreprise, "Prénom Nom" pour un particulier — l'email sert de dernier
// recours pour ne jamais créer de dossier sans nom.
function nomAffichable({ type_client, nom, prenom, raison_sociale, email }) {
  if (type_client === 'entreprise' && raison_sociale?.trim()) return raison_sociale.trim();
  const complet = [prenom, nom].filter(Boolean).join(' ').trim();
  return complet || email;
}

// Le dossier racine "Clients" est créé une seule fois au démarrage
// (migration 9, db.js) : il existe donc toujours à ce stade.
const getClientsRootId = () =>
  db.prepare("SELECT id FROM dossiers WHERE nom = 'Clients' AND parent_id IS NULL").get().id;

// GET — Tous les clients
router.get('/', (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
    res.json(clients);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET — Un client par ID
router.get('/:id', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(client);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — Créer un client + son sous-dossier automatique dans Clients/
router.post('/', (req, res) => {
  try {
    const { type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom } = req.body;

    if (!email) return res.status(400).json({ error: 'email requis' });
    if (type_client === 'entreprise' && !raison_sociale) {
      return res.status(400).json({ error: 'raison_sociale requis pour une entreprise' });
    }
    if (type_client !== 'entreprise' && !nom) {
      return res.status(400).json({ error: 'nom requis pour un particulier' });
    }

    // Transaction : le client et son dossier sont créés ensemble, ou pas du
    // tout (on ne veut pas d'un client sans dossier lié en cas d'échec au
    // milieu de l'opération).
    const creerClientEtDossier = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO clients (type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        type_client || 'particulier', email, telephone, adresse,
        nom, prenom, raison_sociale, siret, tva, contact_nom
      );
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);

      // Sous-dossier nommé d'après le client, rangé sous "Clients" : pas
      // besoin de préfixer par "Client -", le dossier parent donne déjà le
      // contexte.
      const dossier = db.prepare(
        'INSERT INTO dossiers (nom, description, parent_id) VALUES (?, ?, ?)'
      ).run(nomAffichable(client), null, getClientsRootId());
      db.prepare('UPDATE clients SET dossier_id = ? WHERE id = ?').run(dossier.lastInsertRowid, client.id);

      return db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id);
    });

    res.status(201).json(creerClientEtDossier());
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT — Modifier un client
// NB : le dossier associé n'est jamais renommé automatiquement (un
// renommage manuel reste possible directement depuis le Coffre-fort).
router.put('/:id', (req, res) => {
  try {
    const { type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom } = req.body;
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });

    db.prepare(`
      UPDATE clients SET type_client = ?, email = ?, telephone = ?, adresse = ?,
      nom = ?, prenom = ?, raison_sociale = ?, siret = ?, tva = ?, contact_nom = ?
      WHERE id = ?
    `).run(type_client, email, telephone, adresse, nom, prenom, raison_sociale, siret, tva, contact_nom, req.params.id);

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — Supprimer un client
//
//  - Sans paramètre : si un dossier est lié, ne supprime RIEN et renvoie
//    409 + { requiresConfirmation: true, dossier_id, dossier_nom } pour que
//    le frontend affiche sa modale de choix.
//  - ?deleteDossier=true  : supprime le client ET le dossier (+ tout son
//    contenu, récursivement — voir supprimerDossierRecursif).
//  - ?deleteDossier=false : supprime le client seul ; le dossier est
//    conservé, simplement détaché (plus aucun client ne le référence).
router.delete('/:id', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });

    const { deleteDossier } = req.query;
    if (client.dossier_id != null && deleteDossier === undefined) {
      const dossier = db.prepare('SELECT id, nom FROM dossiers WHERE id = ?').get(client.dossier_id);
      return res.status(409).json({
        error: 'Confirmation requise : un dossier est associé à ce client',
        requiresConfirmation: true,
        dossier_id: dossier?.id ?? client.dossier_id,
        dossier_nom: dossier?.nom ?? null,
      });
    }

    if (deleteDossier === 'true' && client.dossier_id != null) {
      supprimerDossierRecursif(client.dossier_id);
    }

    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ message: 'Client supprimé' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
