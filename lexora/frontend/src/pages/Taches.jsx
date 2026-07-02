/**
 * Taches.jsx — Gestion des tâches (projets + rapides)
 *
 * Cette page regroupe deux concepts proches :
 *  - Les "Tâches projet" : tâches avec assignee, statut, description → /api/taches
 *  - Les "Rapides" (anciens Todos) : notes courtes, priorité → /api/todos
 *
 * On utilise le composant <Tabs> pour basculer entre les deux vues
 * sans changer de page, ce qui simplifie la navigation.
 */

import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';
import Tabs from '../components/Tabs.jsx';

// ── Valeurs par défaut du formulaire de tâche ──────────────
const FORM_VIDE = { titre: '', description: '', statut: 'todo', assignee: '' };

// Mapping statut → affichage badge (label + classe CSS)
const STATUTS_TACHE = {
  todo:        { label: 'À faire',  cls: 'badge-todo' },
  in_progress: { label: 'En cours', cls: 'badge-in-progress' },
  done:        { label: 'Terminé',  cls: 'badge-done' },
};

function StatusBadge({ statut }) {
  const s = STATUTS_TACHE[statut] ?? { label: statut, cls: 'badge-todo' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ── Sous-composant : liste des tâches projet ───────────────
function TachesProjet() {
  const [taches, setTaches]   = useState([]);
  const [form, setForm]       = useState(FORM_VIDE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const toast = useToast();

  // Charge toutes les tâches depuis le backend
  // useEffect avec [] = s'exécute une seule fois au montage du composant
  const load = () =>
    fetch('/api/taches')
      .then(r => r.json())
      .then(data => { setTaches(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger les tâches', 'error'); setLoading(false); });

  useEffect(() => { load(); }, []);

  // Met à jour seulement le champ modifié dans le formulaire
  // [e.target.name] est une "computed property key" : le nom de la propriété est dynamique
  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault(); // Empêche le rechargement de la page (comportement par défaut du form)
    setSaving(true);
    try {
      await fetch('/api/taches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm(FORM_VIDE);
      await load();
      toast('Tâche ajoutée');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      // finally s'exécute toujours, succès ou erreur
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    try {
      await fetch(`/api/taches/${id}`, { method: 'DELETE' });
      setTaches(prev => prev.filter(t => t.id !== id));
      toast('Tâche supprimée');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  const handleStatutChange = async (tache, newStatut) => {
    try {
      const res = await fetch(`/api/taches/${tache.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tache, statut: newStatut }),
      });
      if (!res.ok) throw new Error();
      setTaches(prev => prev.map(t => t.id === tache.id ? { ...t, statut: newStatut } : t));
      toast('Statut mis à jour');
    } catch {
      toast('Erreur lors de la mise à jour', 'error');
    }
  };

  // filter() crée un nouveau tableau avec seulement les éléments qui passent le test
  const filtered = taches.filter(t =>
    t.titre?.toLowerCase().includes(search.toLowerCase()) ||
    t.assignee?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Formulaire d'ajout */}
      <form onSubmit={handleSubmit}>
        <input name="titre"       placeholder="Titre *"       value={form.titre}       onChange={handleChange} required />
        <input name="description" placeholder="Description"   value={form.description} onChange={handleChange} style={{ minWidth: 180 }} />
        <select name="statut" value={form.statut} onChange={handleChange}>
          <option value="todo">À faire</option>
          <option value="in_progress">En cours</option>
          <option value="done">Terminé</option>
        </select>
        <input name="assignee" placeholder="Assigné à" value={form.assignee} onChange={handleChange} />
        <button type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Ajouter'}
        </button>
      </form>

      {/* Barre de recherche + compteur */}
      <div className="page-toolbar">
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="record-count">{filtered.length} tâche{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Titre</th>
            <th>Description</th>
            <th>Statut</th>
            <th>Assigné à</th>
            <th>Créé le</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr className="loading-row">
              <td colSpan="6"><span className="spinner dark" /> Chargement...</td>
            </tr>
          )}
          {!loading && filtered.map(t => (
            <tr key={t.id}>
              <td style={{ fontWeight: 500 }}>{t.titre}</td>
              <td style={{ color: '#666' }}>{t.description || <span style={{ color: '#ccc' }}>—</span>}</td>
              <td>
                <select
                  value={t.statut}
                  onChange={e => handleStatutChange(t, e.target.value)}
                  className={`statut-select statut-${t.statut}`}
                >
                  <option value="todo">À faire</option>
                  <option value="in_progress">En cours</option>
                  <option value="done">Terminé</option>
                </select>
              </td>
              <td>{t.assignee || <span style={{ color: '#ccc' }}>—</span>}</td>
              <td style={{ color: '#999', fontSize: '0.84rem' }}>
                {t.created_at ? new Date(t.created_at).toLocaleDateString('fr-FR') : '—'}
              </td>
              <td>
                <button className="danger" onClick={() => handleDelete(t.id)}>Supprimer</button>
              </td>
            </tr>
          ))}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan="6">
              <div className="empty-state">
                <div className="empty-state-icon">✓</div>
                <p>{search ? 'Aucun résultat pour cette recherche' : 'Aucune tâche pour le moment'}</p>
              </div>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Sous-composant : todos rapides ─────────────────────────
function TodosRapides() {
  const [todos, setTodos]     = useState([]);
  const [titre, setTitre]     = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const toast = useToast();

  const load = () =>
    fetch('/api/todos')
      .then(r => r.json())
      .then(data => { setTodos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger les todos', 'error'); setLoading(false); });

  useEffect(() => { load(); }, []);

  const ajouter = async e => {
    e.preventDefault();
    if (!titre.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre }),
      });
      setTitre('');
      await load();
      toast('Todo ajouté');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async id => {
    try {
      await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      setTodos(prev => prev.filter(t => t.id !== id));
      toast('Todo supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  return (
    <div>
      {/* Formulaire simplifié : juste un titre */}
      <form onSubmit={ajouter}>
        <input
          value={titre}
          onChange={e => setTitre(e.target.value)}
          placeholder="Nouvelle note rapide..."
          style={{ flex: 1, minWidth: 260 }}
        />
        <button type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Ajouter'}
        </button>
      </form>

      {loading ? (
        <div className="client-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="client-item">
              <div className="skeleton" style={{ width: '55%', height: 15 }} />
            </div>
          ))}
        </div>
      ) : todos.length === 0 ? (
        <div className="client-list">
          <div className="empty-state">
            <div className="empty-state-icon">☑</div>
            <p>Aucune note rapide</p>
          </div>
        </div>
      ) : (
        <div className="client-list">
          {todos.map(t => (
            <div key={t.id} className="client-item">
              <span style={{ fontWeight: 500 }}>{t.titre}</span>
              <button className="danger" onClick={() => supprimer(t.id)}>Supprimer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page principale exportée ───────────────────────────────
export default function Taches() {
  return (
    <div className="page-enter">
      <h1>Tâches</h1>
      <p className="page-subtitle">Gestion des tâches projet et notes rapides</p>

      {/*
        Le composant Tabs reçoit :
        - tabs : les labels des onglets
        - children : les composants à afficher pour chaque onglet (dans le même ordre)
      */}
      <Tabs tabs={['Tâches projet', 'Notes rapides']}>
        <TachesProjet />
        <TodosRapides />
      </Tabs>
    </div>
  );
}
