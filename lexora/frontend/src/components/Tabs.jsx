/**
 * Tabs.jsx — Composant d'onglets réutilisable
 *
 * Pourquoi ce composant ?
 * Plutôt que de réécrire la logique "onglet actif" dans chaque page,
 * on l'isole ici. Toutes les pages qui ont des sous-sections l'utilisent.
 *
 * Utilisation :
 *   <Tabs tabs={['Clients', 'Factures']}>
 *     <div>Contenu de l'onglet Clients</div>
 *     <div>Contenu de l'onglet Factures</div>
 *   </Tabs>
 *
 * Important : l'ordre des éléments children doit correspondre
 * à l'ordre des labels dans le tableau `tabs`.
 */

import { useState } from 'react';

/**
 * @param {string[]} tabs   - Labels des onglets (ex: ['Clients', 'Factures'])
 * @param {ReactNode} children - Contenu de chaque onglet (même nombre que tabs)
 */
export default function Tabs({ tabs, children }) {
  // activeTab : index de l'onglet affiché, commence à 0 (premier onglet)
  const [activeTab, setActiveTab] = useState(0);

  // React.Children.toArray garantit qu'on a toujours un vrai tableau,
  // même si on ne passe qu'un seul enfant.
  const panels = Array.isArray(children) ? children : [children];

  return (
    <div>
      {/* Barre de navigation des onglets */}
      <div className="tabs-bar">
        {tabs.map((label, index) => (
          <button
            key={label}
            // On applique la classe "tab-active" uniquement sur l'onglet sélectionné
            className={`tab-btn${index === activeTab ? ' tab-active' : ''}`}
            onClick={() => setActiveTab(index)}
            // type="button" évite de déclencher un submit si le Tabs est dans un form
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/* On affiche uniquement le panneau correspondant à l'onglet actif */}
      <div className="tab-panel">
        {panels[activeTab]}
      </div>
    </div>
  );
}
