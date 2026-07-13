/**
 * PostItWall.jsx — Mur de post-its (todos personnels)
 *
 * Affiche les todos de l'utilisateur (créés par lui + assignés à lui) sous
 * forme de post-its colorés. Chaque post-it a :
 *  - une checkbox pour marquer fait / à faire (optimiste : l'interface bascule
 *    immédiatement et revient en arrière si l'API échoue) — le post-it fait
 *    se barre et s'estompe ;
 *  - un bouton de suppression, visible uniquement pour le créateur.
 *
 * Création : tout le monde peut coller un post-it et l'assigner à un ou
 * plusieurs collègues via le multi-sélecteur (l'annuaire chargé est minimal :
 * id + nom uniquement — minimisation des données).
 *
 * Deux modes :
 *  - interactif (défaut) : charge les todos de l'utilisateur connecté,
 *    création / toggle / suppression actifs
 *  - lecture seule (readOnly + todos et perspectiveId fournis) : mur d'un
 *    employé consulté par son manager — affichage pur, aucune action ;
 *    perspectiveId sert à orienter les libellés "de X" / "pour Y" du point
 *    de vue de l'employé consulté, pas du manager qui regarde
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

// Palette pastel des post-its (validée côté backend : hex #rrggbb)
const COULEURS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#ede9fe', '#ffedd5'];

const CONTENT_MAX = 280;

export default function PostItWall({ readOnly = false, todos: externalTodos = null, perspectiveId = null }) {
  const { user, authHeaders } = useAuth();
  const toast = useToast();

  // Point de vue pour les libellés : l'employé consulté en lecture seule,
  // sinon l'utilisateur connecté
  const perspective = perspectiveId ?? user?.id;

  const [todos, setTodos]         = useState(externalTodos ?? []);
  const [employes, setEmployes]   = useState([]);   // Annuaire minimal (id + nom)
  const [loading, setLoading]     = useState(!readOnly);
  const [content, setContent]     = useState('');
  const [color, setColor]         = useState(COULEURS[0]);
  const [assignees, setAssignees] = useState([]);   // ids sélectionnés
  const [saving, setSaving]       = useState(false);

  // En lecture seule, les données viennent des props (dashboard consulté)
  useEffect(() => {
    if (readOnly) setTodos(Array.isArray(externalTodos) ? externalTodos : []);
  }, [readOnly, externalTodos]);

  useEffect(() => {
    if (readOnly) return;    // Pas de fetch : les données sont passées en props
    fetch('/api/todos', { headers: authHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => { setTodos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setLoading(false); toast('Impossible de charger les post-its', 'error'); });

    fetch('/api/employes/selector', { headers: authHeaders })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setEmployes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [readOnly]);

  const toggleAssignee = id =>
    setAssignees(prev => (prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]));

  const creer = async e => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      const body = { content: content.trim(), color };
      if (assignees.length > 0) body.assignee_ids = assignees;
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTodos(prev => [data, ...prev]);
      setContent('');
      setAssignees([]);
      toast('Post-it créé');
    } catch (err) {
      toast(err.message || 'Erreur lors de la création', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle optimiste : le post-it se barre tout de suite, rollback si échec
  const toggle = async todo => {
    const previous = todos;
    setTodos(prev => prev.map(t =>
      t.id === todo.id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t
    ));
    try {
      const res = await fetch(`/api/todos/${todo.id}/toggle`, {
        method: 'PATCH',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTodos(prev => prev.map(t => (t.id === todo.id ? data : t)));
    } catch {
      setTodos(previous);
      toast('Impossible de changer le statut', 'error');
    }
  };

  const supprimer = async todo => {
    try {
      const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error();
      setTodos(prev => prev.filter(t => t.id !== todo.id));
      toast('Post-it supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  return (
    <div className="postit-section">
      {/* Formulaire de création — masqué en consultation */}
      {!readOnly && (
      <form className="postit-form" onSubmit={creer}>
        <input
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Nouveau post-it..."
          maxLength={CONTENT_MAX}
          style={{ flex: 1, minWidth: 220 }}
        />
        <div className="postit-colors">
          {COULEURS.map(c => (
            <button
              key={c}
              type="button"
              className={`postit-color-swatch${color === c ? ' selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title="Couleur du post-it"
            />
          ))}
        </div>
        {employes.length > 0 && (
          <div className="postit-assignees">
            <span className="postit-assignees-label">Assigner à :</span>
            {employes.map(e => (
              <button
                key={e.id}
                type="button"
                className={`postit-assignee-chip${assignees.includes(e.id) ? ' selected' : ''}`}
                onClick={() => toggleAssignee(e.id)}
              >{e.nom}</button>
            ))}
          </div>
        )}
        <button type="submit" disabled={saving || !content.trim()}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Coller'}
        </button>
      </form>
      )}

      {/* Le mur */}
      {loading ? (
        <div className="postit-wall">
          {[1, 2, 3].map(i => <div key={i} className="skeleton postit-skeleton" />)}
        </div>
      ) : todos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📌</div>
          <p>Aucun post-it — le mur est vide</p>
        </div>
      ) : (
        <div className="postit-wall">
          {todos.map(t => {
            const done      = t.status === 'done';
            // Libellés calculés du point de vue de la perspective (l'employé
            // consulté en lecture seule, soi-même sinon)
            const isCreator = t.created_by === perspective;
            const others    = (t.assignees || []).filter(a => a.id !== perspective);
            return (
              <div key={t.id} className={`postit${done ? ' done' : ''}`} style={{ background: t.color }}>
                <div className="postit-top">
                  <label className="postit-check" title={readOnly ? undefined : (done ? 'Marquer à faire' : 'Marquer fait')}>
                    <input type="checkbox" checked={done} disabled={readOnly} onChange={readOnly ? undefined : () => toggle(t)} />
                    <span className="postit-checkmark">{done ? '✔' : ''}</span>
                  </label>
                  {!readOnly && isCreator && (
                    <button className="postit-delete" title="Supprimer" onClick={() => supprimer(t)}>🗑</button>
                  )}
                </div>
                <div className="postit-content">{t.content}</div>
                <div className="postit-footer">
                  {!isCreator && t.created_by_nom && <span>de {t.created_by_nom}</span>}
                  {isCreator && others.length > 0 && (
                    <span>pour {others.map(a => a.nom).join(', ')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
