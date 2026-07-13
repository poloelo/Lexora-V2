/**
 * Clients.jsx — Répertoire des clients (CRM)
 *
 * Chaque client possède un sous-dossier dédié dans le Coffre-fort, créé
 * automatiquement à sa création (voir routes/clients.js) : "Voir le dossier"
 * y redirige directement pour y ranger contrats, factures PDF, pièces
 * d'identité...
 *
 * Suppression : le backend ne supprime jamais le dossier associé sans
 * confirmation explicite. Un premier DELETE renvoie 409 si un dossier est
 * lié ; on affiche alors une modale à deux choix ("client seul" ou "client
 * + dossier") avant de rappeler l'API avec le paramètre `deleteDossier`.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [form, setForm]       = useState({ nom: '', email: '', telephone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  // Modale de confirmation de suppression : null = fermée, sinon
  // { client, dossier_id, dossier_nom } — infos renvoyées par le 409 du backend
  const [confirmDelete, setConfirmDelete] = useState(null);

  const toast = useToast();
  const navigate = useNavigate();
  const { authHeaders } = useAuth();

  const load = () =>
    fetch('/api/clients', { headers: authHeaders })
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
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        // On envoie aussi telephone si renseigné, le reste est optionnel
        body: JSON.stringify({ nom: form.nom, email: form.email, telephone: form.telephone }),
      });
      if (!res.ok) throw new Error();
      setForm({ nom: '', email: '', telephone: '' });
      await load();
      toast('Client ajouté (dossier créé dans le Coffre-fort)');
    } catch {
      toast('Erreur lors de l\'ajout', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Premier clic sur "Supprimer" : tente une suppression sans paramètre.
  // Si le backend répond 409 (dossier lié), on ouvre la modale de choix
  // plutôt que de supprimer quoi que ce soit.
  const demanderSuppression = async client => {
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE', headers: authHeaders });
      if (res.status === 409) {
        const data = await res.json();
        setConfirmDelete({ client, dossier_id: data.dossier_id, dossier_nom: data.dossier_nom });
        return;
      }
      if (!res.ok) throw new Error();
      setClients(prev => prev.filter(c => c.id !== client.id));
      toast('Client supprimé');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  };

  // Choix confirmé dans la modale : deleteDossier=true (tout supprimer) ou
  // deleteDossier=false (client seul, dossier conservé et détaché).
  const confirmerSuppression = async supprimerAussiLeDossier => {
    const { client } = confirmDelete;
    try {
      const res = await fetch(`/api/clients/${client.id}?deleteDossier=${supprimerAussiLeDossier}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      setClients(prev => prev.filter(c => c.id !== client.id));
      toast(supprimerAussiLeDossier ? 'Client et dossier supprimés' : 'Client supprimé (dossier conservé)');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  // NB : la page Coffre-fort vit sur la route /documents (voir App.jsx) ;
  // le paramètre ?dossier= lui indique le dossier à ouvrir directement.
  const voirLeDossier = client => navigate(`/documents?dossier=${client.dossier_id}`);

  const filtered = clients.filter(c =>
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-enter">
      <h1>Clients</h1>
      <p className="page-subtitle">Répertoire des clients — chacun a son dossier dédié dans le Coffre-fort</p>

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {c.dossier_id != null && (
                  <button className="secondary" onClick={() => voirLeDossier(c)}>📁 Voir le dossier</button>
                )}
                <button className="danger" onClick={() => demanderSuppression(c)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modale de confirmation : dossier associé ── */}
      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Supprimer {confirmDelete.client.nom} ?</span>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>
                Ce client a un dossier associé dans le Coffre-fort
                {confirmDelete.dossier_nom && <> (« {confirmDelete.dossier_nom} »)</>},
                qui peut contenir des documents. Que souhaitez-vous en faire ?
              </p>
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="secondary" onClick={() => setConfirmDelete(null)}>
                Annuler
              </button>
              <button type="button" onClick={() => confirmerSuppression(false)}>
                Supprimer le client uniquement
              </button>
              <button type="button" className="danger" onClick={() => confirmerSuppression(true)}>
                Supprimer le client et son dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
