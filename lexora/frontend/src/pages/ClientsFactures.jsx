/**
 * ClientsFactures.jsx — Gestion commerciale (clients + factures)
 *
 * Ces deux entités sont regroupées ici car elles sont directement liées :
 * un client génère des factures. Avoir une vue unique simplifie le flux de travail.
 *
 * Onglet 1 — Clients : liste, ajout, suppression
 * Onglet 2 — Factures : liste avec statuts colorés, filtres, totaux
 */

import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';
import Tabs from '../components/Tabs.jsx';

// ── Helpers : formatage ────────────────────────────────────

// Intl.NumberFormat formate les montants selon la locale française (ex: 1 250,00 €)
const fmtMontant = m =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m ?? 0);

// Formate une date ISO en français lisible (ex: 15/06/2025)
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

// ── Badges de statut pour les factures ────────────────────
const STATUTS_FACTURE = {
  'en attente': { label: 'En attente', cls: 'badge-pending' },
  payee:        { label: 'Payée',      cls: 'badge-paid' },
  annulee:      { label: 'Annulée',    cls: 'badge-cancelled' },
};

function StatusBadge({ statut }) {
  const s = STATUTS_FACTURE[statut] ?? { label: statut, cls: 'badge-pending' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ── Sous-composant : liste des clients ─────────────────────
function Clients() {
  const [clients, setClients] = useState([]);
  const [form, setForm]       = useState({ nom: '', email: '', telephone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const toast = useToast();

  const load = () =>
    fetch('/api/clients')
      .then(r => r.json())
      .then(data => { setClients(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger les clients', 'error'); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const ajouter = async e => {
    e.preventDefault();
    if (!form.nom.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // On envoie aussi telephone si renseigné, le reste est optionnel
        body: JSON.stringify({ nom: form.nom, email: form.email, telephone: form.telephone }),
      });
      setForm({ nom: '', email: '', telephone: '' });
      await load();
      toast('Client ajouté');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async id => {
    try {
      await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      // On retire directement de l'état local, pas besoin de recharger depuis l'API
      setClients(prev => prev.filter(c => c.id !== id));
      toast('Client supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  const filtered = clients.filter(c =>
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <form onSubmit={ajouter}>
        <input name="nom"       placeholder="Nom *"        value={form.nom}       onChange={handleChange} required />
        <input name="email"     placeholder="Email *"      value={form.email}     onChange={handleChange} required type="email" />
        <input name="telephone" placeholder="Téléphone"    value={form.telephone} onChange={handleChange} />
        <button type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Ajouter'}
        </button>
      </form>

      <div className="page-toolbar">
        <input className="search-input" placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="record-count">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="client-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="client-item">
              <div className="client-info">
                <div className="skeleton" style={{ width: 140, height: 15 }} />
                <div className="skeleton" style={{ width: 180, height: 12, marginTop: 5 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="client-list">
          <div className="empty-state">
            <div className="empty-state-icon">◉</div>
            <p>{search ? 'Aucun client ne correspond à la recherche' : 'Aucun client enregistré'}</p>
          </div>
        </div>
      ) : (
        <div className="client-list">
          {filtered.map(c => (
            <div key={c.id} className="client-item">
              <div className="client-info">
                <span className="client-name">{c.nom}</span>
                <span className="client-email">
                  {c.email}
                  {c.telephone && ` · ${c.telephone}`}
                </span>
              </div>
              <button className="danger" onClick={() => supprimer(c.id)}>Supprimer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sous-composant : liste des factures ────────────────────
const FORM_FACTURE_VIDE = {
  client: '', montant: '', statut: 'en attente', date_emission: '', date_echeance: '',
};

function Factures() {
  const [factures, setFactures] = useState([]);
  const [form, setForm]         = useState(FORM_FACTURE_VIDE);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const toast = useToast();

  const load = () =>
    fetch('/api/factures')
      .then(r => r.json())
      .then(data => { setFactures(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { toast('Impossible de charger les factures', 'error'); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/api/factures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // parseFloat convertit la chaîne "150.50" en nombre 150.5 pour le backend
        body: JSON.stringify({ ...form, montant: parseFloat(form.montant) }),
      });
      setForm(FORM_FACTURE_VIDE);
      await load();
      toast('Facture ajoutée');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    try {
      await fetch(`/api/factures/${id}`, { method: 'DELETE' });
      setFactures(prev => prev.filter(f => f.id !== id));
      toast('Facture supprimée');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  const handleStatutChange = async (facture, newStatut) => {
    try {
      const res = await fetch(`/api/factures/${facture.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...facture, statut: newStatut }),
      });
      if (!res.ok) throw new Error();
      setFactures(prev => prev.map(f => f.id === facture.id ? { ...f, statut: newStatut } : f));
      toast('Statut mis à jour');
    } catch {
      toast('Erreur lors de la mise à jour', 'error');
    }
  };

  const filtered = factures.filter(f =>
    f.client?.toLowerCase().includes(search.toLowerCase())
  );

  // reduce() parcourt le tableau et accumule une valeur (ici la somme des montants)
  const totalFiltered = filtered.reduce((sum, f) => sum + (f.montant ?? 0), 0);

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input name="client"       placeholder="Client *"      value={form.client}       onChange={handleChange} required />
        <input name="montant"      type="number" placeholder="Montant (€) *" value={form.montant} onChange={handleChange} required min="0" step="0.01" />
        <select name="statut" value={form.statut} onChange={handleChange}>
          <option value="en attente">En attente</option>
          <option value="payee">Payée</option>
          <option value="annulee">Annulée</option>
        </select>
        <input name="date_emission"  type="date" value={form.date_emission}  onChange={handleChange} />
        <input name="date_echeance"  type="date" value={form.date_echeance}  onChange={handleChange} />
        <button type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Ajout...</> : '+ Ajouter'}
        </button>
      </form>

      <div className="page-toolbar">
        <input className="search-input" placeholder="Rechercher par client..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="record-count">
          {filtered.length} facture{filtered.length !== 1 ? 's' : ''} · Total : {fmtMontant(totalFiltered)}
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Montant</th>
            <th>Statut</th>
            <th>Émission</th>
            <th>Échéance</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr className="loading-row">
              <td colSpan="6"><span className="spinner dark" /> Chargement...</td>
            </tr>
          )}
          {!loading && filtered.map(f => (
            <tr key={f.id}>
              <td style={{ fontWeight: 500 }}>{f.client}</td>
              <td style={{ fontWeight: 600, color: '#1a1d2e' }}>{fmtMontant(f.montant)}</td>
              <td>
                <select
                  value={f.statut}
                  onChange={e => handleStatutChange(f, e.target.value)}
                  className={`statut-select statut-facture-${f.statut?.replace(' ', '-')}`}
                >
                  <option value="en attente">En attente</option>
                  <option value="payee">Payée</option>
                  <option value="annulee">Annulée</option>
                </select>
              </td>
              <td style={{ color: '#999', fontSize: '0.84rem' }}>{fmtDate(f.date_emission)}</td>
              <td style={{ color: '#999', fontSize: '0.84rem' }}>{fmtDate(f.date_echeance)}</td>
              <td>
                <button className="danger" onClick={() => handleDelete(f.id)}>Supprimer</button>
              </td>
            </tr>
          ))}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan="6">
              <div className="empty-state">
                <div className="empty-state-icon">€</div>
                <p>{search ? 'Aucune facture ne correspond à la recherche' : 'Aucune facture pour le moment'}</p>
              </div>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Page principale exportée ───────────────────────────────
export default function ClientsFactures() {
  return (
    <div className="page-enter">
      <h1>Clients & Factures</h1>
      <p className="page-subtitle">Gestion commerciale — clients et facturation</p>

      <Tabs tabs={['Clients', 'Factures']}>
        <Clients />
        <Factures />
      </Tabs>
    </div>
  );
}
