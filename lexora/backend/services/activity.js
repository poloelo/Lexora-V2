/**
 * services/activity.js — Journal d'activité stocké dans Redis (NoSQL)
 *
 * Pourquoi Redis plutôt qu'une table SQLite ?
 *  - Un journal est une suite d'événements qu'on ajoute en continu et qu'on
 *    lit « les plus récents d'abord » : c'est exactement une liste Redis
 *    (LPUSH pour ajouter en tête, LRANGE pour lire, LTRIM pour plafonner).
 *  - Chaque entrée est un petit document JSON libre : pas de schéma figé,
 *    on peut ajouter un champ sans migration.
 *  - Ces écritures très fréquentes ne chargent pas la base relationnelle,
 *    qui reste dédiée aux données métier.
 *
 * Le journal est OPTIONNEL : sans REDIS_URL, ou si Redis est injoignable,
 * l'application fonctionne normalement et logActivity() ne fait rien.
 * Le journal ne doit jamais faire échouer une action métier.
 */

import { createClient } from 'redis';

const KEY = 'lexora:activity';   // une seule liste pour tout le journal
const MAX_ENTRIES = 1000;        // au-delà, les plus anciennes sont supprimées (RGPD : durée limitée)

let client = null;

/** Ouvre la connexion Redis si REDIS_URL est défini. Appelé au démarrage. */
export async function connectActivity(url = process.env.REDIS_URL) {
  if (!url) {
    console.log('ℹ️  REDIS_URL absent : journal d\'activité désactivé');
    return false;
  }
  client = createClient({
    url,
    // On réessaie quelques fois puis on abandonne, sans jamais bloquer l'API
    socket: { reconnectStrategy: retries => (retries > 5 ? false : Math.min(retries * 200, 2000)) },
  });
  client.on('error', () => {}); // les erreurs réseau sont gérées par isReady
  try {
    await client.connect();
    console.log('✅ Journal d\'activité connecté à Redis');
    return true;
  } catch {
    console.warn('⚠️  Redis injoignable : journal d\'activité désactivé');
    client = null;
    return false;
  }
}

export function activityEnabled() {
  return Boolean(client?.isReady);
}

/**
 * Ajoute une entrée en tête du journal.
 * @param {object} user   l'utilisateur à l'origine de l'action (req.user) ou null
 * @param {string} action identifiant court, ex. 'client.create'
 * @param {string} label  phrase lisible, ex. 'a créé le client Durand'
 */
export async function logActivity(user, action, label) {
  if (!activityEnabled()) return;
  const entry = {
    at: new Date().toISOString(),
    action,
    label,
    user_id: user?.id ?? null,
    user: user ? [user.prenom, user.nom].filter(Boolean).join(' ') : null,
    role: user?.role ?? null,
  };
  try {
    // MULTI = les deux commandes s'exécutent ensemble (ajout + plafonnement)
    await client.multi()
      .lPush(KEY, JSON.stringify(entry))
      .lTrim(KEY, 0, MAX_ENTRIES - 1)
      .exec();
  } catch {
    // Le journal est secondaire : une panne Redis ne doit pas casser l'action métier
  }
}

/** Lit les entrées les plus récentes, avec un filtre optionnel sur le type d'action. */
export async function getActivity({ limit = 50, action } = {}) {
  if (!activityEnabled()) return [];
  const raw = await client.lRange(KEY, 0, MAX_ENTRIES - 1);
  const entries = raw.map(s => JSON.parse(s));
  const filtered = action ? entries.filter(e => e.action.startsWith(action)) : entries;
  return filtered.slice(0, limit);
}

/** Vide le journal (utilisé par les tests). */
export async function clearActivity() {
  if (activityEnabled()) await client.del(KEY);
}

export async function disconnectActivity() {
  if (client?.isOpen) await client.quit();
  client = null;
}
