/**
 * main.jsx — Point d'entrée React (rendu DOM)
 *
 * Ce fichier est le seul à appeler ReactDOM.createRoot().
 * Il est référencé dans index.html via <script type="module" src="/src/main.jsx">.
 *
 * BrowserRouter : active la navigation côté client avec l'API History.
 * React.StrictMode : en développement, détecte les effets de bord potentiels
 *   en exécutant certains hooks deux fois (ne s'applique qu'en dev, pas en prod).
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';  // Import global du CSS (une seule feuille de style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* BrowserRouter fournit le contexte de routing à tous les composants enfants */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
