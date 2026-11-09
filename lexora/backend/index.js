/**
 * index.js — Point d'entrée du serveur Lexora
 *
 * Importe l'application construite dans app.js et la démarre.
 * Séparer les deux permet de tester l'API sans ouvrir de port réseau.
 */

import app from './app.js';
import { connectActivity } from './services/activity.js';

const PORT = process.env.PORT || 3000;

// Le journal d'activité (Redis) est optionnel : sans lui, l'API démarre quand même
await connectActivity();

app.listen(PORT, () => {
  console.log(` Lexora backend running on port ${PORT}`);
});
