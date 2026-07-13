/**
 * Equipe.jsx — Gestion interne de l'équipe
 *
 * Répertoire des employés (admin uniquement). Le planning se gère
 * directement dans le Calendrier (événements de type "planning" posés
 * par les managers) ; les automations ont été retirées du périmètre.
 *
 * Accès protégé par JWT (voir AuthContext). Le token est envoyé via
 * l'header Authorization: Bearer <token> sur les routes admin.
 */

import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

// ── Sous-composant : répertoire des employés ───────────────
const FORM_EMPLOYE_VIDE = { nom: '', prenom: '', poste: '', email: '', password: '', departement_id: '', role: 'employe' };

function Employes() {
  const [employes, setEmployes]         = useState([]);
  const [departements, setDepartements] = useState([]);
  const [form, setForm]                 = useState(FORM_EMPLOYE_VIDE);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [search, setSearch]             = useState('');
  const toast = useToast();
  const { authHeaders } = useAuth();

  const adminHeaders = { 'Content-Type': 'application/json', ...authHeaders };

  const load = () =>
    fetch('/api/employes', { headers: authHeaders })
      .then(r => r.json())
      .then(data => { setEmployes(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger les employés', 'error'); setLoading(false); });

  useEffect(() => {
    load();
    fetch('/api/departements', { headers: authHeaders })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setDepartements(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const ajouter = async e => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/employes', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          ...form,
          departement_id: form.departement_id ? Number(form.departement_id) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast(err.error || 'Erreur lors de l\'ajout', 'error');
        setSaving(false);
        return;
      }
      setForm(FORM_EMPLOYE_VIDE);
      await load();
      toast('Employé ajouté');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async id => {
    try {
      await fetch(`/api/employes/${id}`, { method: 'DELETE', headers: adminHeaders });
      setEmployes(prev => prev.filter(e => e.id !== id));
      toast('Employé supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  const filtered = employes.filter(e =>
    e.nom?.toLowerCase().includes(search.toLowerCase()) ||
    e.poste?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <form onSubmit={ajouter}>
        <input name="nom"      placeholder="Nom *"           value={form.nom}      onChange={handleChange} required />
        <input name="prenom"   placeholder="Prénom"          value={form.prenom}   onChange={handleChange} />
        <input name="poste"    placeholder="Poste"           value={form.poste}    onChange={handleChange} />
        <input name="email"    placeholder="Email *"         value={form.email}    onChange={handleChange} type="email" required />
        <input name="password" placeholder="Mot de passe *"  value={form.password} onChange={handleChange} type="password" required />
        <select name="departement_id" value={form.departement_id} onChange={handleChange}>
          <option value="">Sans département</option>
          {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
        <select name="role" value={form.role} onChange={handleChange}>
          <option value="employe">Employé</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Ajouter'}
        </button>
      </form>

      <div className="page-toolbar">
        <input className="search-input" placeholder="Rechercher un employé..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="record-count">{filtered.length} employé{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="client-list">
          {[1, 2].map(i => (
            <div key={i} className="client-item">
              <div className="client-info">
                <div className="skeleton" style={{ width: 150, height: 15 }} />
                <div className="skeleton" style={{ width: 100, height: 12, marginTop: 5 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="client-list">
          <div className="empty-state">
            <div className="empty-state-icon">◎</div>
            <p>{search ? 'Aucun résultat' : 'Aucun employé enregistré'}</p>
          </div>
        </div>
      ) : (
        <div className="client-list">
          {filtered.map(e => (
            <div key={e.id} className="client-item">
              <div className="client-info">
                {/* On affiche prénom + nom si les deux existent, sinon juste nom */}
                <span className="client-name">
                  {[e.prenom, e.nom].filter(Boolean).join(' ')}
                </span>
                <span className="client-email">
                  {e.poste || '—'}
                  {e.email && ` · ${e.email}`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {e.departement_nom && <span className="badge badge-in-progress">{e.departement_nom}</span>}
                {e.role === 'admin'   && <span className="badge badge-cancelled">Admin</span>}
                {e.role === 'manager' && <span className="badge badge-paid">Manager</span>}
                <button className="danger" onClick={() => supprimer(e.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page principale exportée ───────────────────────────────
export default function Equipe() {
  return (
    <div className="page-enter">
      <h1>
        Équipe{' '}
        <span className="badge badge-cancelled" style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}>
          Admin
        </span>
      </h1>
      <p className="page-subtitle">Gestion interne — répertoire des employés</p>

      <Employes />
    </div>
  );
}
