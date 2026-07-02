import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Login() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const [form, setForm]     = useState({ email: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      // Redirection selon le rôle
      navigate(user.role === 'admin' ? '/equipe' : '/mon-espace', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="sidebar-logo" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
          <span className="sidebar-logo-icon">L</span>
          Lexora
        </div>
        <h2 style={{ marginBottom: '0.25rem' }}>Connexion</h2>
        <p className="page-subtitle" style={{ marginBottom: '1.5rem' }}>
          Entrez vos identifiants pour accéder à votre espace
        </p>

        <form onSubmit={handleSubmit}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
            autoFocus
          />
          <input
            name="password"
            type="password"
            placeholder="Mot de passe"
            value={form.password}
            onChange={handleChange}
            required
            style={{ marginTop: '0.75rem' }}
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading} style={{ marginTop: '1rem', width: '100%' }}>
            {loading ? <><span className="spinner" /> Connexion...</> : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
