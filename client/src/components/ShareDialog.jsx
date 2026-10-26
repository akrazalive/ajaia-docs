import { useEffect, useState } from 'react';
import { Check, Copy, LoaderCircle, UserMinus, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useToast } from './Toasts.jsx';
import { Avatar, Modal, RoleBadge } from './ui.jsx';

export default function ShareDialog({ doc, onClose, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = doc.role === 'owner';

  const [shares, setShares] = useState(null);
  const [people, setPeople] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.listShares(doc.id).then((r) => setShares(r.shares)).catch((e) => setError(e.message));
    if (isOwner) api.users().then((r) => setPeople(r.users)).catch(() => {});
  }, [doc.id, isOwner]);

  const apply = (r) => { setShares(r.shares); onChange?.(r.shares); };

  async function invite(e) {
    e.preventDefault();
    if (!email.trim()) return setError('Enter the email of the person to share with.');
    setBusy(true);
    setError('');
    try {
      apply(await api.share(doc.id, email.trim(), role));
      toast(`Shared with ${email.trim()}`);
      setEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(person, newRole) {
    try { apply(await api.share(doc.id, person.email, newRole)); } catch (err) { toast(err.message, 'error'); }
  }

  async function revoke(person) {
    try {
      apply(await api.unshare(doc.id, person.id));
      toast(`Removed ${person.name}`);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const sharedIds = new Set(shares?.map((s) => s.id));
  const suggestions = people.filter((p) => !sharedIds.has(p.id));

  return (
    <Modal title={`Share “${doc.title}”`} subtitle={isOwner ? 'Invite teammates by email. Editors can change content; viewers can only read.' : 'Only the owner can change who has access.'} onClose={onClose} width={500}>
      <div className="modal-body">
        {isOwner && (
          <form className="share-form" onSubmit={invite}>
            <input
              type="email" list="share-people" placeholder="name@ajaia.dev" value={email} autoFocus
              onChange={(e) => { setEmail(e.target.value); setError(''); }} aria-label="Email address"
            />
            <datalist id="share-people">
              {suggestions.map((p) => <option key={p.id} value={p.email}>{p.name}</option>)}
            </datalist>
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
              <option value="editor">Can edit</option>
              <option value="viewer">View only</option>
            </select>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <LoaderCircle size={14} className="spin" /> : <UserPlus size={14} />} Invite
            </button>
          </form>
        )}
        {error && <div className="form-error">{error}</div>}

        {isOwner && suggestions.length > 0 && (
          <div className="suggestions">
            <span className="muted">Suggested:</span>
            {suggestions.map((p) => (
              <button key={p.id} className="chip" onClick={() => setEmail(p.email)}>
                <Avatar user={p} size={16} />{p.name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        <h3 className="section-label">People with access</h3>
        <ul className="people">
          <li>
            <Avatar user={doc.owner} size={30} />
            <span className="person"><strong>{doc.owner.name}{doc.owner.id === user.id && ' (you)'}</strong><small>{doc.owner.email}</small></span>
            <RoleBadge role="owner" />
          </li>
          {shares === null && <li className="muted"><LoaderCircle size={14} className="spin" /> Loading…</li>}
          {shares?.map((p) => (
            <li key={p.id}>
              <Avatar user={p} size={30} />
              <span className="person"><strong>{p.name}{p.id === user.id && ' (you)'}</strong><small>{p.email}</small></span>
              {isOwner ? (
                <span className="person-actions">
                  <select className="select-sm" value={p.role} onChange={(e) => changeRole(p, e.target.value)} aria-label={`Access for ${p.name}`}>
                    <option value="editor">Can edit</option>
                    <option value="viewer">View only</option>
                  </select>
                  <button className="icon-btn" onClick={() => revoke(p)} title="Remove access" aria-label={`Remove ${p.name}`}><UserMinus size={15} /></button>
                </span>
              ) : <RoleBadge role={p.role} />}
            </li>
          ))}
        </ul>

        <div className="modal-actions spread">
          <button className="btn btn-ghost" onClick={copyLink}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
