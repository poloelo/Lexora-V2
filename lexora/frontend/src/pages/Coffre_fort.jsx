/**
 * Coffre_fort.jsx — Gestionnaire de documents (coffre-fort)
 *
 * Fonctionnalités :
 *  - Arborescence dossiers/fichiers avec navigation par fil d'Ariane
 *  - Création de dossiers (POST /api/documents/dossiers)
 *  - Upload de fichiers par glisser-déposer ou sélection (POST /api/documents/upload)
 *  - Téléchargement des fichiers (GET /api/documents/:id/download)
 *  - Suppression dossiers et documents
 *  - Les fichiers sont stockés physiquement sur le serveur (/backend/uploads/)
 *    et leurs métadonnées en base SQLite
 */

import { useState, useEffect, useRef } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';

// Icônes texte par type de fichier (pas de dépendance externe)
const FILE_ICONS = {
  PDF:     '📄', Word: '📝', Excel: '📊',
  Image:   '🖼', Archive: '🗜', Texte: '📃',
  Document:'📄',
};

// Couleur du badge de statut
const STATUT_STYLE = {
  'Traité':  { bg: '#d1e7dd', color: '#0f5132' },
  'Vérifié': { bg: '#cff4fc', color: '#055160' },
  'En cours':{ bg: '#fff3cd', color: '#856404' },
};

export default function CoffreFort() {
  // ── État de la navigation ──────────────────────────────
  // currentFolderId = null → on est à la racine
  const [currentFolderId, setCurrentFolderId] = useState(null);

  // ── Données chargées depuis l'API ──────────────────────
  const [dossiers,  setDossiers]  = useState([]);  // Tous les dossiers
  const [documents, setDocuments] = useState([]);  // Tous les documents

  // ── UI states ─────────────────────────────────────────
  const [loading,        setLoading]        = useState(true);
  const [dragActive,     setDragActive]     = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderNom,      setFolderNom]      = useState('');
  const [folderDesc,     setFolderDesc]     = useState('');
  const [uploading,      setUploading]      = useState(false);
  const [savingFolder,   setSavingFolder]   = useState(false);

  const fileInputRef = useRef(null);
  const toast = useToast();

  // ── Chargement initial ────────────────────────────────
  // On charge dossiers ET documents en parallèle (Promise.all = plus rapide)
  const load = async () => {
    try {
      const [dos, docs] = await Promise.all([
        fetch('/api/documents/dossiers').then(r => r.json()).catch(() => []),
        fetch('/api/documents').then(r => r.json()).catch(() => []),
      ]);
      setDossiers(Array.isArray(dos) ? dos : []);
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch {
      toast('Impossible de charger les documents', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Éléments du dossier actuel ───────────────────────
  // On filtre dossiers et documents selon le dossier ouvert.
  // null == racine → on affiche les éléments sans parent.
  const dossiersIci = dossiers.filter(d =>
    currentFolderId === null ? d.parent_id === null : d.parent_id === currentFolderId
  );
  const documentsIci = documents.filter(d =>
    currentFolderId === null ? d.dossier_id === null : d.dossier_id === currentFolderId
  );

  // ── Fil d'Ariane ─────────────────────────────────────
  // Remonte l'arborescence depuis currentFolderId jusqu'à la racine
  const getBreadcrumbs = () => {
    const crumbs = [];
    let id = currentFolderId;
    while (id !== null) {
      const d = dossiers.find(d => d.id === id);
      if (!d) break;
      crumbs.unshift(d);   // unshift = insérer au début du tableau
      id = d.parent_id;
    }
    return crumbs;
  };

  // ── Créer un dossier ──────────────────────────────────
  const handleCreateFolder = async e => {
    e.preventDefault();
    if (!folderNom.trim()) return;
    setSavingFolder(true);
    try {
      await fetch('/api/documents/dossiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom:       folderNom,
          description: folderDesc || null,
          parent_id: currentFolderId,
        }),
      });
      setFolderNom('');
      setFolderDesc('');
      setShowFolderForm(false);
      await load();
      toast('Dossier créé');
    } catch {
      toast('Erreur lors de la création', 'error');
    } finally {
      setSavingFolder(false);
    }
  };

  // ── Uploader un fichier ───────────────────────────────
  // FormData envoie le fichier en multipart/form-data (requis pour les uploads)
  const uploadFile = async file => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // dossier_id = 'null' si on est à la racine
      if (currentFolderId !== null) formData.append('dossier_id', currentFolderId);

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        // ⚠️ Ne PAS mettre Content-Type manuellement ici :
        // le navigateur doit le définir lui-même pour inclure le "boundary" multipart
        body: formData,
      });
      if (!res.ok) throw new Error();
      await load();
      toast(`"${file.name}" uploadé avec succès`);
    } catch {
      toast('Erreur lors de l\'upload', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Drag & Drop ───────────────────────────────────────
  const handleDrop = async e => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  };

  // ── Supprimer un dossier ──────────────────────────────
  const supprimerDossier = async id => {
    if (!confirm('Supprimer ce dossier et tous ses fichiers ?')) return;
    try {
      await fetch(`/api/documents/dossiers/${id}`, { method: 'DELETE' });
      await load();
      toast('Dossier supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  // ── Supprimer un document ─────────────────────────────
  const supprimerDocument = async id => {
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      setDocuments(prev => prev.filter(d => d.id !== id));
      toast('Document supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="page-enter">

      {/* En-tête */}
      <h1>Coffre-fort documentaire</h1>
      <p className="page-subtitle">
        Organisez et stockez vos fichiers en toute sécurité — {documents.length} document{documents.length !== 1 ? 's' : ''} au total
      </p>

      {/* ── Barre d'outils + Fil d'Ariane ── */}
      <div className="vault-toolbar">
        {/* Fil d'Ariane : Racine / Dossier A / Dossier B */}
        <div className="vault-breadcrumbs">
          <span
            className={`vault-crumb${currentFolderId === null ? ' vault-crumb-active' : ''}`}
            onClick={() => setCurrentFolderId(null)}
          >
            🏠 Racine
          </span>
          {breadcrumbs.map(crumb => (
            <span key={crumb.id} className="vault-crumb-group">
              <span className="vault-crumb-sep">/</span>
              <span
                className={`vault-crumb${currentFolderId === crumb.id ? ' vault-crumb-active' : ''}`}
                onClick={() => setCurrentFolderId(crumb.id)}
              >
                {crumb.nom}
              </span>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Bouton upload rapide */}
          <button
            className="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <><span className="spinner dark" /> Upload...</> : '↑ Importer'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={e => e.target.files[0] && uploadFile(e.target.files[0])}
          />

          <button
            className="secondary"
            onClick={() => setShowFolderForm(v => !v)}
          >
            📁 {showFolderForm ? 'Annuler' : 'Nouveau dossier'}
          </button>
        </div>
      </div>

      {/* ── Formulaire de création de dossier ── */}
      {showFolderForm && (
        <form className="vault-folder-form" onSubmit={handleCreateFolder}>
          <input
            placeholder="Nom du dossier *"
            value={folderNom}
            onChange={e => setFolderNom(e.target.value)}
            required
            style={{ flex: 1, minWidth: 200 }}
          />
          <input
            placeholder="Description (optionnel)"
            value={folderDesc}
            onChange={e => setFolderDesc(e.target.value)}
            style={{ flex: 2, minWidth: 200 }}
          />
          <button type="submit" disabled={savingFolder}>
            {savingFolder ? <><span className="spinner" /> Création...</> : 'Créer'}
          </button>
        </form>
      )}

      {/* ── Zone Drag & Drop ── */}
      <div
        className={`vault-dropzone${dragActive ? ' vault-dropzone-active' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <span style={{ fontSize: '1.8rem' }}>📤</span>
        <p>Glissez un fichier ici pour l'ajouter au dossier actuel</p>
        <span style={{ color: '#aaa', fontSize: '0.82rem' }}>
          ou utilisez le bouton "Importer" — 50 MB max
        </span>
      </div>

      {/* ── Contenu du dossier ── */}
      {loading ? (
        <div className="client-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="client-item">
              <div className="skeleton" style={{ width: '40%', height: 16 }} />
              <div className="skeleton" style={{ width: 80, height: 14 }} />
            </div>
          ))}
        </div>
      ) : dossiersIci.length === 0 && documentsIci.length === 0 ? (
        <div className="client-list">
          <div className="empty-state">
            <div className="empty-state-icon">📂</div>
            <p>Ce dossier est vide — glissez des fichiers ou créez un sous-dossier</p>
          </div>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Description</th>
              <th>Détails</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Dossiers en premier */}
            {dossiersIci.map(d => (
              <tr key={`d-${d.id}`} className="vault-row-folder" onClick={() => setCurrentFolderId(d.id)}>
                <td style={{ fontWeight: 600, cursor: 'pointer' }}>
                  <span style={{ marginRight: 8 }}>📁</span>{d.nom}
                </td>
                <td style={{ color: '#888', fontSize: '0.85rem' }}>
                  {d.description || <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td style={{ color: '#aaa', fontSize: '0.82rem' }}>Dossier</td>
                <td>
                  <span className="badge badge-in-progress">Dossier</span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="danger" onClick={() => supprimerDossier(d.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}

            {/* Documents ensuite */}
            {documentsIci.map(doc => {
              const statutStyle = STATUT_STYLE[doc.statut] ?? STATUT_STYLE['En cours'];
              return (
                <tr key={`doc-${doc.id}`}>
                  <td style={{ fontWeight: 500 }}>
                    <span style={{ marginRight: 8 }}>
                      {FILE_ICONS[doc.type] ?? '📄'}
                    </span>
                    {doc.nom}
                  </td>
                  <td style={{ color: '#888', fontSize: '0.85rem' }}>
                    {doc.description || <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={{ color: '#aaa', fontSize: '0.82rem' }}>
                    {doc.taille}
                    {doc.created_at && (
                      <span style={{ display: 'block' }}>
                        {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: statutStyle.bg, color: statutStyle.color }}
                    >
                      {doc.statut}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* Lien de téléchargement direct — pas besoin de JS */}
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        download={doc.nom}
                        className="btn-download"
                      >
                        ↓
                      </a>
                      <button className="danger" onClick={() => supprimerDocument(doc.id)}>
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

    </div>
  );
}
