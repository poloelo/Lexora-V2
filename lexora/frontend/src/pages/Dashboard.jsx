import { useEffect, useState, useRef } from 'react';

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const frame = now => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(frame);
      else prev.current = target;
    };
    requestAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

const CARD_COLORS = [
  '#7c6af7',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#10b981',
];

function StatCard({ icon, value, label, color, suffix = '' }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <div className="stat-card" style={{ '--accent': color }}>
      <span className="stat-icon">{icon}</span>
      <div className="number">{animated}{suffix}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function RecentItem({ name, badge, badgeClass }) {
  return (
    <div className="recent-item">
      <span className="recent-item-name">{name}</span>
      {badge && <span className={`badge ${badgeClass}`}>{badge}</span>}
    </div>
  );
}

const STATUT_TACHE = {
  todo:        { label: 'À faire',  cls: 'badge-todo' },
  in_progress: { label: 'En cours', cls: 'badge-in-progress' },
  done:        { label: 'Terminé',  cls: 'badge-done' },
};

const STATUT_FACTURE = {
  'en attente': { label: 'En attente', cls: 'badge-pending' },
  payee:        { label: 'Payée',      cls: 'badge-paid' },
  annulee:      { label: 'Annulée',    cls: 'badge-cancelled' },
};

export default function Dashboard() {
  const [taches, setTaches] = useState([]);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/taches').then(r => r.json()).catch(() => []),
      fetch('/api/factures').then(r => r.json()).catch(() => []),
    ]).then(([t, f]) => {
      setTaches(Array.isArray(t) ? t : []);
      setFactures(Array.isArray(f) ? f : []);
      setLoading(false);
    });
  }, []);

  const tachesEnCours    = taches.filter(t => t.statut === 'in_progress').length;
  const facturesImpayees = factures.filter(f => f.statut === 'en attente').length;
  const totalFactures    = factures.reduce((s, f) => s + (f.montant || 0), 0);

  // L'API retourne déjà les éléments triés du plus récent au plus ancien
  // (ORDER BY created_at DESC / ORDER BY id DESC).
  // On prend simplement les 5 premiers — pas besoin de reverse().
  const recentTaches   = taches.slice(0, 5);
  const recentFactures = factures.slice(0, 5);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="page-enter">
      <h1>Dashboard</h1>
      <p className="page-subtitle">{today}</p>

      {loading ? (
        <div className="stats-grid">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8, margin: '0 auto 10px' }} />
              <div className="skeleton" style={{ width: 70, height: 32, margin: '0 auto 8px' }} />
              <div className="skeleton" style={{ width: 90, height: 14, margin: '0 auto' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="stats-grid">
          <StatCard icon="✓" value={taches.length}    label="Tâches totales"    color={CARD_COLORS[0]} />
          <StatCard icon="◷" value={tachesEnCours}    label="En cours"          color={CARD_COLORS[1]} />
          <StatCard icon="€" value={factures.length}  label="Factures"          color={CARD_COLORS[2]} />
          <StatCard icon="⏳" value={facturesImpayees} label="En attente"        color={CARD_COLORS[3]} />
          <StatCard icon="∑" value={Math.round(totalFactures)} label="Volume total (€)" color={CARD_COLORS[4]} />
        </div>
      )}

      <div className="dashboard-grid">
        <div className="recent-section">
          <div className="recent-header">✓ Tâches récentes</div>
          {recentTaches.length === 0 ? (
            <div className="empty-state"><p>Aucune tâche</p></div>
          ) : recentTaches.map(t => {
            const s = STATUT_TACHE[t.statut] || { label: t.statut, cls: 'badge-todo' };
            return <RecentItem key={t.id} name={t.titre} badge={s.label} badgeClass={s.cls} />;
          })}
        </div>

        <div className="recent-section">
          <div className="recent-header">€ Factures récentes</div>
          {recentFactures.length === 0 ? (
            <div className="empty-state"><p>Aucune facture</p></div>
          ) : recentFactures.map(f => {
            const s = STATUT_FACTURE[f.statut] || { label: f.statut, cls: 'badge-pending' };
            return <RecentItem key={f.id} name={`${f.client} — ${f.montant} €`} badge={s.label} badgeClass={s.cls} />;
          })}
        </div>
      </div>
    </div>
  );
}
