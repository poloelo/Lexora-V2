/**
 * ollamaService.js — Client HTTP pour le LLM local Ollama
 *
 * Ollama est un serveur local qui expose des modèles LLM via une API REST.
 * Ce service envoie un prompt au modèle configuré et retourne la réponse textuelle.
 *
 * Variables d'environnement utilisées :
 *  - OLLAMA_URL   : URL du serveur Ollama (défaut : http://localhost:11434)
 *  - OLLAMA_MODEL : Modèle à utiliser     (défaut : llama3.2)
 *
 * Pour installer le modèle : ollama pull llama3.2
 * Pour lancer Ollama       : ollama serve
 */

// Lecture des variables d'environnement avec valeurs par défaut
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

/**
 * Envoie un prompt au LLM et retourne la réponse texte.
 *
 * @param {string} prompt - Le message envoyé au modèle
 * @returns {Promise<string>} - La réponse générée par le modèle
 * @throws {Error} - Si Ollama est inaccessible ou retourne une erreur HTTP
 */
export async function chat(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    // stream: false → Ollama retourne la réponse complète en une seule fois
    // (vs stream: true qui enverrait des chunks progressifs via Server-Sent Events)
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.response;
}
