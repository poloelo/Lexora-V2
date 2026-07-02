/**
 * Assistant.jsx — Interface de chat avec l'assistant IA (Ollama)
 *
 * Fonctionnement :
 *  1. L'utilisateur saisit un message et appuie sur Entrée ou "Envoyer"
 *  2. Le message est envoyé à POST /api/assistant { prompt }
 *  3. Le backend interroge Ollama (LLM local) et retourne la réponse
 *  4. La réponse s'affiche à gauche, les messages utilisateur à droite
 *
 * États gérés :
 *  - messages : tableau de { role, text, time }
 *  - input    : texte en cours de saisie
 *  - loading  : true pendant qu'on attend la réponse d'Ollama
 *
 * Note : si Ollama n'est pas lancé sur le host, une erreur s'affiche
 * directement dans le chat au lieu de faire planter l'interface.
 */

import { useState, useRef, useEffect } from 'react';

// ── Helper : formate une Date en "HH:mm" en français ─────────
function fmtTime(date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function Assistant() {
  // Historique des messages (user + assistant)
  const [messages, setMessages] = useState([]);
  // Texte en cours de saisie dans le champ input
  const [input, setInput]       = useState('');
  // true pendant qu'on attend la réponse du LLM
  const [loading, setLoading]   = useState(false);

  // Référence pour le scroll automatique en bas de la conversation
  const bottomRef = useRef(null);
  // Référence pour refocaliser l'input après chaque réponse
  const inputRef  = useRef(null);

  // Scroll automatique à chaque nouveau message ou état loading
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Envoi d'un message ─────────────────────────────────────
  const sendMessage = async e => {
    e.preventDefault();
    // Évite les envois vides ou multiples pendant le chargement
    if (!input.trim() || loading) return;

    // Ajout immédiat du message utilisateur dans l'historique
    const userMsg = { role: 'user', text: input.trim(), time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt: userMsg.text }),
      });
      const data = await res.json();

      // data.response = réponse normale, data.error = message d'erreur Ollama
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: data.response || data.error || 'Pas de réponse', time: new Date() },
      ]);
    } catch {
      // Erreur réseau (backend inaccessible)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: 'Erreur de connexion à Ollama.', time: new Date() },
      ]);
    } finally {
      setLoading(false);
      // On remet le focus sur l'input pour que l'utilisateur puisse
      // enchaîner les messages sans cliquer
      inputRef.current?.focus();
    }
  };

  return (
    <div className="page-enter">
      <h1>Assistant IA</h1>
      <p className="page-subtitle">Posez vos questions à votre assistant Lexora</p>

      <div className="chat-box">
        <div className="chat-messages">
          {/* Message d'accueil si aucun message n'a encore été envoyé */}
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', margin: 'auto', color: '#aaa' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>◈</div>
              <p style={{ fontSize: '0.95rem' }}>Bonjour ! Comment puis-je vous aider ?</p>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>
                Posez une question sur vos tâches, factures ou votre activité.
              </p>
            </div>
          )}

          {/* Historique des messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              {/* Bulle de message — classe CSS 'user' ou 'assistant' */}
              <div className={`message ${msg.role}`}>{msg.text}</div>
              {/* Horodatage sous la bulle */}
              <span className="message-meta" style={{ textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                {msg.role === 'user' ? 'Vous' : 'Lexora IA'} · {fmtTime(msg.time)}
              </span>
            </div>
          ))}

          {/* Indicateur de chargement "..." pendant qu'Ollama réfléchit */}
          {loading && (
            <div>
              <div className="message assistant typing-dots">
                <span /><span /><span />
              </div>
              <span className="message-meta">Lexora IA répond...</span>
            </div>
          )}

          {/* Ancre invisible pour le scroll automatique */}
          <div ref={bottomRef} />
        </div>

        {/* Formulaire de saisie du message */}
        <form className="chat-input" onSubmit={sendMessage}>
          <input
            ref={inputRef}
            type="text"
            placeholder={loading ? 'En attente de la réponse...' : 'Votre message...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? <span className="spinner" /> : 'Envoyer'}
          </button>
        </form>
      </div>
    </div>
  );
}
