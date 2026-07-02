/**
 * Equipe.jsx — Gestion interne de l'équipe
 *
 * Cette page regroupe trois sections liées à l'organisation interne :
 *  - Employés  : répertoire de l'équipe (admin)
 *  - Planning  : horaires et projets assignés
 *  - Automations : tâches automatisées (admin)
 *
 * Accès protégé par JWT (voir AuthContext). Le token est envoyé via
 * l'header Authorization: Bearer <token> sur les routes admin.
 */

import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import Tabs from '../components/Tabs.jsx';

// ── Helper : calcul de la durée entre deux horaires ───────
// Prend "09:00" et "17:30" → renvoie "8h30"
function calculerDuree(debut, fin) {
  if (!debut || !fin) return null;
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  const total = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h${m}` : `${h}h`;
}

// Formate une date "2025-06-15" en "dim. 15 juin"
const fmtDate = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

// ── Sous-composant : répertoire des employés ───────────────
function Employes() {
  const [employes, setEmployes] = useState([]);
  const [form, setForm]         = useState({ nom: '', prenom: '', poste: '', email: '', password: '' });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const toast = useToast();
  const { authHeaders } = useAuth();

  const adminHeaders = { 'Content-Type': 'application/json', ...authHeaders };

  const load = () =>
    fetch('/api/employes', { headers: authHeaders })
      .then(r => r.json())
      .then(data => { setEmployes(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger les employés', 'error'); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const ajouter = async e => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/employes', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        toast(err.error || 'Erreur lors de l\'ajout', 'error');
        setSaving(false);
        return;
      }
      setForm({ nom: '', prenom: '', poste: '', email: '', password: '' });
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
              <button className="danger" onClick={() => supprimer(e.id)}>Supprimer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sous-composant : planning des horaires ─────────────────
const FORM_PLANNING_VIDE = { employe: '', date: '', heure_debut: '', heure_fin: '', projet: '' };

function Planning() {
  const [entries, setEntries] = useState([]);
  const [form, setForm]       = useState(FORM_PLANNING_VIDE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const toast = useToast();

  const load = () =>
    fetch('/api/planning')
      .then(r => r.json())
      .then(data => { setEntries(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger le planning', 'error'); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm(FORM_PLANNING_VIDE);
      await load();
      toast('Entrée ajoutée au planning');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    try {
      await fetch(`/api/planning/${id}`, { method: 'DELETE' });
      setEntries(prev => prev.filter(e => e.id !== id));
      toast('Entrée supprimée');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  const filtered = entries.filter(e =>
    e.employe?.toLowerCase().includes(search.toLowerCase()) ||
    e.projet?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input name="employe"    placeholder="Employé *" value={form.employe}    onChange={handleChange} required />
        <input name="date"       type="date"              value={form.date}       onChange={handleChange} required />
        <input name="heure_debut" type="time"             value={form.heure_debut} onChange={handleChange} required />
        <input name="heure_fin"  type="time"              value={form.heure_fin}  onChange={handleChange} required />
        <input name="projet"     placeholder="Projet"    value={form.projet}     onChange={handleChange} />
        <button type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Ajouter'}
        </button>
      </form>

      <div className="page-toolbar">
        <input className="search-input" placeholder="Rechercher employé ou projet..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="record-count">{filtered.length} entrée{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Employé</th>
            <th>Date</th>
            <th>Début</th>
            <th>Fin</th>
            <th>Durée</th>
            <th>Projet</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr className="loading-row">
              <td colSpan="7"><span className="spinner dark" /> Chargement...</td>
            </tr>
          )}
          {!loading && filtered.map(e => (
            <tr key={e.id}>
              <td style={{ fontWeight: 500 }}>{e.employe}</td>
              <td style={{ color: '#555' }}>{fmtDate(e.date)}</td>
              <td>{e.heure_debut}</td>
              <td>{e.heure_fin}</td>
              <td>
                {calculerDuree(e.heure_debut, e.heure_fin) && (
                  <span className="badge badge-in-progress">{calculerDuree(e.heure_debut, e.heure_fin)}</span>
                )}
              </td>
              <td style={{ color: '#666' }}>{e.projet || <span style={{ color: '#ccc' }}>—</span>}</td>
              <td>
                <button className="danger" onClick={() => handleDelete(e.id)}>Supprimer</button>
              </td>
            </tr>
          ))}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan="7">
              <div className="empty-state">
                <div className="empty-state-icon">◫</div>
                <p>{search ? 'Aucun résultat' : 'Aucune entrée dans le planning'}</p>
              </div>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Sous-composant : automations ───────────────────────────
function Automations() {
  const [automations, setAutomations] = useState([]);
  const [form, setForm]               = useState({ nom: '', action: '' });
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const toast = useToast();
  const { authHeaders } = useAuth();

  const adminHeaders = { 'Content-Type': 'application/json', ...authHeaders };

  const load = () =>
    fetch('/api/automations', { headers: authHeaders })
      .then(r => r.json())
      .then(data => { setAutomations(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger les automations', 'error'); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const ajouter = async e => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/automations', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(form),
      });
      setForm({ nom: '', action: '' });
      await load();
      toast('Automation ajoutée');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async id => {
    try {
      await fetch(`/api/automations/${id}`, { method: 'DELETE', headers: adminHeaders });
      setAutomations(prev => prev.filter(a => a.id !== id));
      toast('Automation supprimée');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  return (
    <div>
      <form onSubmit={ajouter}>
        <input name="nom"    placeholder="Nom de l'automation *" value={form.nom}    onChange={handleChange} required />
        <input name="action" placeholder="Action déclenchée"     value={form.action} onChange={handleChange} style={{ minWidth: 240 }} />
        <button type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Ajouter'}
        </button>
      </form>

      {loading ? (
        <div className="client-list">
          {[1, 2].map(i => (
            <div key={i} className="client-item">
              <div className="client-info">
                <div className="skeleton" style={{ width: 160, height: 15 }} />
                <div className="skeleton" style={{ width: 220, height: 12, marginTop: 5 }} />
              </div>
            </div>
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div className="client-list">
          <div className="empty-state">
            <div className="empty-state-icon">⚙</div>
            <p>Aucune automation configurée</p>
          </div>
        </div>
      ) : (
        <div className="client-list">
          {automations.map(a => (
            <div key={a.id} className="client-item">
              <div className="client-info">
                <span className="client-name">{a.nom}</span>
                {a.action && <span className="client-email">⚡ {a.action}</span>}
              </div>
              <button className="danger" onClick={() => supprimer(a.id)}>Supprimer</button>
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
      <p className="page-subtitle">Gestion interne — employés, planning et automations</p>

      <Tabs tabs={['Employés', 'Planning', 'Automations']}>
        <Employes />
        <Planning />
        <Automations />
      </Tabs>
    </div>
  );
}
