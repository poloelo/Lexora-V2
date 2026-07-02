/**
 * documents.js — Routes pour le coffre-fort documentaire
 *
 * Deux entités gérées ici :
 *  - Dossiers : arborescence de répertoires (parent_id pour l'imbrication)
 *  - Documents : fichiers uploadés, stockés physiquement dans /backend/uploads/
 *
 * Upload : Multer stocke le fichier sur disque et on enregistre les métadonnées
 * en SQLite. On ne stocke pas les fichiers en base (mauvaise pratique, trop lourd).
 *
 * Téléchargement : GET /api/documents/:id/download → res.download() envoie le fichier.
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import db from '../models/db.js';

const router = Router();

// __dirname n'existe pas en ES modules, on le recrée manuellement
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Dossier physique où les fichiers uploadés sont stockés
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Crée le dossier uploads s'il n'existe pas (au démarrage du serveur)
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Configuration de Multer ────────────────────────────────
// diskStorage : stocke les fichiers sur disque (vs memoryStorage qui les garde en RAM)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  // On préfixe le nom avec un timestamp pour éviter les conflits de noms
  filename: (req, file, cb) => {
    // Encode le nom original pour éviter les problèmes avec les caractères spéciaux
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

// ════════════════════════════════════════════════════════════
//  DOSSIERS
// ════════════════════════════════════════════════════════════

// GET /api/documents/dossiers — Tous les dossiers
router.get('/dossiers', (req, res) => {
  try {
    const dossiers = db.prepare('SELECT * FROM dossiers ORDER BY nom ASC').all();
    res.json(dossiers);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/documents/dossiers — Créer un dossier
router.post('/dossiers', (req, res) => {
  try {
    const { nom, description, parent_id } = req.body;
    if (!nom) return res.status(400).json({ error: 'nom requis' });

    const result = db.prepare(
      'INSERT INTO dossiers (nom, description, parent_id) VALUES (?, ?, ?)'
    ).run(nom, description ?? null, parent_id ?? null);

    const created = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprime récursivement un dossier et tous ses sous-dossiers/fichiers
function supprimerDossierRecursif(dossierId) {
  // Supprimer les fichiers physiques et enregistrements du dossier courant
  const docs = db.prepare('SELECT * FROM documents WHERE dossier_id = ?').all(dossierId);
  for (const doc of docs) {
    const filePath = path.join(UPLOADS_DIR, doc.nom_fichier);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM documents WHERE dossier_id = ?').run(dossierId);

  // Récursion sur les sous-dossiers
  const sousDossiers = db.prepare('SELECT id FROM dossiers WHERE parent_id = ?').all(dossierId);
  for (const sd of sousDossiers) {
    supprimerDossierRecursif(sd.id);
  }

  db.prepare('DELETE FROM dossiers WHERE id = ?').run(dossierId);
}

// DELETE /api/documents/dossiers/:id — Supprimer un dossier (et tout son contenu, récursivement)
router.delete('/dossiers/:id', (req, res) => {
  try {
    const dossier = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(req.params.id);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    supprimerDossierRecursif(req.params.id);
    res.json({ message: 'Dossier supprimé' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
//  DOCUMENTS
// ════════════════════════════════════════════════════════════

// GET /api/documents — Tous les documents (filtrables par dossier_id)
// Exemple : GET /api/documents?dossier_id=3 → docs du dossier 3
//           GET /api/documents?dossier_id=null → docs à la racine
router.get('/', (req, res) => {
  try {
    const { dossier_id } = req.query;
    const docs = dossier_id === undefined
      ? db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all()
      : dossier_id === 'null'
        ? db.prepare('SELECT * FROM documents WHERE dossier_id IS NULL ORDER BY created_at DESC').all()
        : db.prepare('SELECT * FROM documents WHERE dossier_id = ? ORDER BY created_at DESC').all(dossier_id);
    res.json(docs);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/documents/upload — Uploader un fichier
// Multer gère la lecture du fichier ; on enregistre ensuite les métadonnées.
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    const { dossier_id, description } = req.body;

    // Calcul de la taille affichable
    const bytes = req.file.size;
    const taille = bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

    // Détection simple du type à partir de l'extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    const typeMap = {
      '.pdf': 'PDF', '.doc': 'Word', '.docx': 'Word',
      '.xls': 'Excel', '.xlsx': 'Excel',
      '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image',
      '.zip': 'Archive', '.txt': 'Texte',
    };
    const type = typeMap[ext] ?? 'Document';

    const result = db.prepare(`
      INSERT INTO documents (nom, nom_fichier, type, taille, statut, description, dossier_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.file.originalname,
      req.file.filename,
      type,
      taille,
      'Traité',
      description ?? null,
      dossier_id ? parseInt(dossier_id) : null
    );

    const created = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de l\'upload', detail: err.message });
  }
});

// DELETE /api/documents/:id — Supprimer un document
router.delete('/:id', (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    // Supprimer le fichier physique du disque
    const filePath = path.join(UPLOADS_DIR, doc.nom_fichier);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.json({ message: 'Document supprimé' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/documents/:id/download — Télécharger un document
router.get('/:id/download', (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const filePath = path.join(UPLOADS_DIR, doc.nom_fichier);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur disque' });

    // res.download() envoie le fichier avec le nom d'origine, pas le nom stocké sur disque
    res.download(filePath, doc.nom);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
