import { useState } from 'react';
import { ArrowRight, FileText, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { Avatar } from '../components/ui.jsx';

const DEMO_ACCOUNTS = [
  { name: 'Alice Moreno', email: 'alice@ajaia.dev', color: '#3E6B5A' },
  { name: 'Bob Okafor', email: 'bob@ajaia.dev', color: '#8A5A44' },
  { name: 'Carol Chen', email: 'carol@ajaia.dev', color: '#5B5F8F' },
];
const DEMO_PASSWORD = 'ajaia-demo';

export default function Login() {
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(e, account) {
    e?.preventDefault();
    const creds = account ? { email: account.email, password: DEMO_PASSWORD } : { email, password };
    if (!creds.email || !creds.password) return setError('Enter your email and password.');
    setBusy(true);
    setError('');
    try {
      const { user } = await api.login(creds.email, creds.password);
      setUser(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-brand">
        <div className="brand-mark"><FileText size={16} /> Ajaia Docs</div>
        <div>
          <h1>Write it down.<br /><em>Together.</em></h1>
          <p>A focused space for drafting, formatting and sharing the documents your team runs on.</p>
        </div>
        <ul className="login-points">
          <li>Rich-text editing with autosave</li>
          <li>Import .txt, .md and .docx files</li>
          <li>Share as viewer or editor</li>
        </ul>
      </aside>

      <main className="login-main">
        <form className="login-card" onSubmit={signIn} noValidate>
          <h2>Sign in</h2>
          <p className="muted">Use a demo account below, or enter credentials.</p>

          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ajaia.dev" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />} Continue
          </button>

          <div className="divider"><span>Demo accounts · password <code>{DEMO_PASSWORD}</code></span></div>

          <div className="demo-accounts">
            {DEMO_ACCOUNTS.map((a) => (
              <button type="button" key={a.email} className="demo-account" disabled={busy} onClick={(e) => signIn(e, a)}>
                <Avatar user={a} size={28} />
                <span><strong>{a.name}</strong><small>{a.email}</small></span>
                <ArrowRight size={14} className="demo-arrow" />
              </button>
            ))}
          </div>
        </form>
      </main>
    </div>
  );
}
