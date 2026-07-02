/**
 * ToastContext.jsx — Système de notifications toast global
 *
 * Pourquoi un Context ?
 * Les toasts (notifications éphémères) peuvent être déclenchés depuis n'importe
 * quelle page ou composant. Plutôt que de passer une prop `showToast` à travers
 * toute l'arborescence (prop drilling), on expose une fonction via Context.
 *
 * Utilisation depuis n'importe quel composant :
 *   const toast = useToast();
 *   toast('Message de succès');           // type par défaut : 'success'
 *   toast('Quelque chose a planté', 'error');
 *   toast('Info utile', 'info');
 *
 * Les toasts se ferment automatiquement après 3 secondes.
 * L'utilisateur peut aussi les fermer en cliquant dessus.
 *
 * Cycle de vie d'un toast :
 *  0ms  : création → apparaît en bas à droite (animation slideInRight)
 *  2700ms : setExiting(true) → déclenche l'animation de sortie (slideOutRight)
 *  3000ms : suppression de l'état → disparaît complètement
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Contexte dont la valeur est la fonction addToast (pas un objet entier)
const ToastContext = createContext(null);

// ── Composant individuel ───────────────────────────────────────
// Chaque toast est rendu par ce sous-composant qui gère son propre cycle de vie.
function ToastItem({ toast, onRemove }) {
  // exiting = true → applique la classe CSS d'animation de sortie
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // À 2700ms : lance l'animation de sortie (300ms d'animation)
    const hide   = setTimeout(() => setExiting(true), 2700);
    // À 3000ms : retire le toast de l'état (après la fin de l'animation)
    const remove = setTimeout(onRemove, 3000);
    // Cleanup : annule les timers si le composant est démonté avant l'expiration
    return () => { clearTimeout(hide); clearTimeout(remove); };
  }, [onRemove]);

  // Icônes par type de notification
  const icons = { success: '✓', error: '✕', info: 'ℹ' };

  return (
    <div
      className={`toast ${toast.type}${exiting ? ' exiting' : ''}`}
      // Clic pour fermer immédiatement
      onClick={onRemove}
    >
      <span className="toast-icon">{icons[toast.type] ?? 'ℹ'}</span>
      <span>{toast.message}</span>
    </div>
  );
}

// ── Provider ───────────────────────────────────────────────────
// Enveloppe l'application dans App.jsx. Rend addToast disponible partout.
export function ToastProvider({ children }) {
  // Liste des toasts actifs : [{ id, message, type }]
  const [toasts, setToasts] = useState([]);

  // useCallback mémoïse la fonction pour éviter des re-renders inutiles
  // (les composants qui consomment useToast ne se re-renderont pas à chaque toast)
  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'success') => {
    // ID unique : timestamp + nombre aléatoire (pour éviter les collisions en cas
    // de plusieurs toasts créés dans la même milliseconde)
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {/* Conteneur des toasts — positionné en bas à droite via CSS */}
      <div className="toast-container">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Hook public : const toast = useToast(); → toast('message', 'success')
export const useToast = () => useContext(ToastContext);
