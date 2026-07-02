/**
 * assistant.js — Route pour l'assistant IA (proxy vers Ollama)
 *
 * Ce module fait simplement le lien entre le frontend et le service Ollama.
 * Le frontend envoie un prompt → ce handler appelle ollamaService.chat()
 * → retourne la réponse textuelle du LLM.
 *
 * En cas d'indisponibilité d'Ollama (non installé, service arrêté, mauvais port),
 * l'erreur est capturée et retournée avec un 500 pour que le frontend puisse
 * afficher un message d'erreur explicite à l'utilisateur.
 */

import { Router } from 'express';
import { chat } from '../services/ollamaService.js';

const router = Router();

// POST /api/assistant — Envoie un prompt au LLM et retourne la réponse
// Corps attendu : { prompt: string }
router.post('/', async (req, res) => {
  const { prompt } = req.body;

  // Validation : un prompt vide n'a pas de sens
  if (!prompt) return res.status(400).json({ error: 'prompt requis' });

  try {
    const response = await chat(prompt);
    res.json({ response });
  } catch (err) {
    // L'erreur la plus fréquente est "Ollama non disponible"
    res.status(500).json({ error: 'Erreur Ollama', details: err.message });
  }
});

export default router;
