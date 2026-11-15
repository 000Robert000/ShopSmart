import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Only same-site paths are accepted as a return address after sign-in.
function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/account';
}

export default function LoginPage() {
  const { customer, login, register } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(searchParams.get('next'));
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (customer) return <Navigate to={next} replace />;

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password });
      else await register(form);
      navigate(next, { replace: true });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  const creating = mode === 'register';
  return (
    <section className="checkout-layout">
      <form onSubmit={submit}>
        <p className="eyebrow">{creating ? 'NEW CUSTOMER' : 'WELCOME BACK'}</p>
        <h1>{creating ? 'Create an account' : 'Sign in'}</h1>
        <StatusMessage type="error">{error}</StatusMessage>
        {creating && <label>Full name<input name="name" value={form.name} onChange={updateField} minLength="2" maxLength="80" autoComplete="name" required /></label>}
        <label>Email address<input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" value={form.password} onChange={updateField} minLength={creating ? 8 : 1} maxLength="128" autoComplete={creating ? 'new-password' : 'current-password'} required /></label>
        <button disabled={submitting}>{submitting ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="button secondary" onClick={() => { setMode(creating ? 'login' : 'register'); setError(''); }}>
          {creating ? 'I already have an account' : 'Create a new account'}
        </button>
      </form>
      <aside className="summary">
        <h2>Classroom demo</h2>
        <p>Use a fictional name and an example.com email. Do not reuse a real password.</p>
        <small>Your order history is private: only you can see your orders.</small>
      </aside>
    </section>
  );
}
