/**
 * Taches.jsx — Tâches de département (vue kanban)
 *
 * Trois colonnes (À faire / En cours / Terminé) alimentées par /api/tasks.
 * Le backend filtre déjà par département : un employé ne voit que les tâches
 * de son département, un admin voit tout (avec un sélecteur de département).
 *
 * Changement de statut : drag & drop natif HTML5 entre les colonnes, avec
 * un menu déroulant de secours sur chaque carte. Les deux sont optimistes :
 * l'interface bouge immédiatement, et revient en arrière si l'API échoue.
 *
 * Création/suppression : réservées aux rôles manager (son département) et
 * admin — le backend fait autorité, l'interface ne fait que cacher les boutons.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const COLONNES = [
  { status: 'todo',        label: 'À faire',  icon: '○' },
  { status: 'in_progress', label: 'En cours', icon: '◐' },
  { status: 'done',        label: 'Terminé',  icon: '●' },
];

const PRIORITES = {
  low:    { label: 'Basse',   cls: 'badge-prio-low' },
  medium: { label: 'Moyenne', cls: 'badge-prio-medium' },
  high:   { label: 'Haute',   cls: 'badge-prio-high' },
};

const FORM_VIDE = { title: '', description: '', department_id: '', priority: 'medium', due_date: '' };

const fmtDue = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;

// ── Carte de tâche (draggable) ─────────────────────────────
function TaskCard({ task, canManage, isAdminView, onStatusChange, onDelete }) {
  const prio = PRIORITES[task.priority] ?? PRIORITES.medium;
  const enRetard = task.due_date && task.status !== 'done' && task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/task-id', String(task.id));
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
      }}
      onDragEnd={e => e.currentTarget.classList.remove('dragging')}
    >
      <div className="kanban-card-top">
        <span className={`badge ${prio.cls}`}>{prio.label}</span>
        {canManage && (
          <button className="kanban-card-delete" title="Supprimer" onClick={() => onDelete(task)}>✕</button>
        )}
      </div>
      <div className="kanban-card-title">{task.title}</div>
      {task.description && <div className="kanban-card-desc">{task.description}</div>}
      <div className="kanban-card-meta">
        {isAdminView && <span className="kanban-card-dep">{task.department_nom}</span>}
        {task.due_date && (
          <span className={`kanban-card-due${enRetard ? ' late' : ''}`}>⏱ {fmtDue(task.due_date)}</span>
        )}
      </div>
      {/* Menu déroulant de secours pour le changement de statut (accessibilité,
          écrans tactiles) — même action que le drag & drop */}
      <select
        className={`statut-select statut-${task.status}`}
        value={task.status}
        onChange={e => onStatusChange(task, e.target.value)}
      >
        {COLONNES.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
      </select>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────
export default function Taches() {
  const { user, authHeaders, isAuthenticated } = useAuth();
  const toast = useToast();

  const [tasks, setTasks]               = useState([]);
  const [departements, setDepartements] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [prioFilter, setPrioFilter]     = useState('');       // '' = toutes
  const [depFilter, setDepFilter]       = useState('');       // admin uniquement, '' = tous
  const [modalOpen, setModalOpen]       = useState(false);
  const [form, setForm]                 = useState(FORM_VIDE);
  const [saving, setSaving]             = useState(false);

  const isAdmin   = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canCreate = isAdmin || isManager;

  const load = () => {
    const params = new URLSearchParams();
    if (isAdmin && depFilter) params.set('department_id', depFilter);
    fetch(`/api/tasks?${params}`, { headers: authHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => { setTasks(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setTasks([]); setLoading(false); });
  };

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    load();
    fetch('/api/departements', { headers: authHeaders })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setDepartements(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [isAuthenticated, depFilter]);

  // Changement de statut optimiste : on applique localement tout de suite,
  // et on restaure l'état précédent si le serveur refuse.
  const changeStatus = async (task, status) => {
    if (task.status === status) return;
    const previous = tasks;
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks(previous);
      toast('Impossible de changer le statut', 'error');
    }
  };

  const handleDelete = async task => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error();
      setTasks(prev => prev.filter(t => t.id !== task.id));
      toast('Tâche supprimée');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openModal = () => {
    // Un manager crée toujours dans son propre département
    setForm({ ...FORM_VIDE, department_id: isManager ? (user?.departement_id ?? '') : '' });
    setModalOpen(true);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          ...form,
          department_id: Number(form.department_id),
          description: form.description || null,
          due_date: form.due_date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTasks(prev => [data, ...prev]);
      setModalOpen(false);
      toast('Tâche créée');
    } catch (err) {
      toast(err.message || 'Erreur lors de la création', 'error');
    } finally {
      setSaving(false);
    }
  };

  const visible = tasks.filter(t => !prioFilter || t.priority === prioFilter);

  if (!isAuthenticated) {
    return (
      <div className="page-enter">
        <h1>Tâches</h1>
        <p className="page-subtitle">Tâches de département</p>
        <div className="empty-state">
          <div className="empty-state-icon">✓</div>
          <p>Connectez-vous pour voir les tâches de votre département</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <h1>Tâches</h1>
      <p className="page-subtitle">
        {isAdmin ? 'Toutes les tâches de département' : 'Les tâches de votre département'}
      </p>

      {/* Barre d'outils : filtres + création */}
      <div className="page-toolbar kanban-toolbar">
        <div className="kanban-filters">
          <button className={!prioFilter ? 'btn-filter active' : 'btn-filter'} onClick={() => setPrioFilter('')}>Toutes</button>
          {Object.entries(PRIORITES).map(([value, p]) => (
            <button
              key={value}
              className={prioFilter === value ? 'btn-filter active' : 'btn-filter'}
              onClick={() => setPrioFilter(value)}
            >{p.label}</button>
          ))}
          {isAdmin && (
            <select value={depFilter} onChange={e => setDepFilter(e.target.value)} className="kanban-dep-select">
              <option value="">Tous les départements</option>
              {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          )}
        </div>
        <span className="record-count">{visible.length} tâche{visible.length !== 1 ? 's' : ''}</span>
        {canCreate && <button onClick={openModal}>+ Nouvelle tâche</button>}
      </div>

      {/* Tableau kanban */}
      {loading ? (
        <div className="kanban-board">
          {COLONNES.map(c => (
            <div key={c.status} className="kanban-col">
              <div className="kanban-col-header">{c.icon} {c.label}</div>
              <div className="skeleton" style={{ height: 90, borderRadius: 10 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban-board">
          {COLONNES.map(col => {
            const items = visible.filter(t => t.status === col.status);
            return (
              <div
                key={col.status}
                className="kanban-col"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('drag-over');
                  const id = Number(e.dataTransfer.getData('text/task-id'));
                  const task = tasks.find(t => t.id === id);
                  if (task) changeStatus(task, col.status);
                }}
              >
                <div className="kanban-col-header">
                  {col.icon} {col.label}
                  <span className="kanban-col-count">{items.length}</span>
                </div>
                {items.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isAdminView={isAdmin && !depFilter}
                    canManage={isAdmin || (isManager && t.department_id === user?.departement_id)}
                    onStatusChange={changeStatus}
                    onDelete={handleDelete}
                  />
                ))}
                {items.length === 0 && <div className="kanban-empty">Déposez une tâche ici</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de création */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nouvelle tâche</span>
              <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Titre *</label>
                  <input name="title" value={form.title} onChange={handleChange} required autoFocus />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea name="description" rows="3" value={form.description} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Département *</label>
                  <select name="department_id" value={form.department_id} onChange={handleChange} required disabled={isManager}>
                    <option value="">— Choisir —</option>
                    {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priorité</label>
                  <select name="priority" value={form.priority} onChange={handleChange}>
                    {Object.entries(PRIORITES).map(([value, p]) => (
                      <option key={value} value={value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Échéance</label>
                  <input name="due_date" type="date" value={form.due_date} onChange={handleChange} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" disabled={saving}>
                  {saving ? <><span className="spinner" /> Création...</> : 'Créer la tâche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
