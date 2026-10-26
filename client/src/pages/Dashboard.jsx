import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Ellipsis, FileText, FileUp, Inbox, LoaderCircle, LogOut, PencilLine, Plus, Search, Trash2, Users,
} from 'lucide-react';
import { SUPPORTED_UPLOADS, UPLOAD_HINT, api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useToast } from '../components/Toasts.jsx';
import { Avatar, Menu, MenuItem, Modal, RoleBadge, timeAgo } from '../components/ui.jsx';
import UserMenu from '../components/UserMenu.jsx';

const TABS = [
  { id: 'all', label: 'All documents' },
  { id: 'owned', label: 'Owned by me' },
  { id: 'shared', label: 'Shared with me' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null); // 'create' | 'import' | null
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = () => api.listDocuments().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const docs = useMemo(() => {
    if (!data) return [];
    const list = tab === 'owned' ? data.owned : tab === 'shared' ? data.shared
      : [...data.owned, ...data.shared].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const q = query.trim().toLowerCase();
    return q ? list.filter((d) => d.title.toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q)) : list;
  }, [data, tab, query]);

  async function createDoc() {
    setBusy('create');
    try {
      const { document } = await api.createDocument();
      navigate(`/d/${document.id}`, { state: { focusTitle: true } });
    } catch (e) {
      toast(e.message, 'error');
      setBusy(null);
    }
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('import');
    try {
      const { document } = await api.importDocument(file);
      toast(`Imported “${document.title}”`);
      navigate(`/d/${document.id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(null);
    }
  }

  async function leave(doc) {
    try {
      await api.unshare(doc.id, user.id);
      toast(`Removed “${doc.title}” from your documents`);
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  const counts = data ? { all: data.owned.length + data.shared.length, owned: data.owned.length, shared: data.shared.length } : {};

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand-mark"><FileText size={16} /> Ajaia Docs</Link>
        <div className="search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents" aria-label="Search documents" />
        </div>
        <UserMenu />
      </header>

      <main className="dashboard">
        <section className="dash-head">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Good to see you, {user.name.split(' ')[0]}.</h1>
          </div>
          <div className="dash-actions">
            <div className="upload-hint">{UPLOAD_HINT}</div>
            <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={importFile} />
            <button className="btn" onClick={() => fileInput.current.click()} disabled={!!busy}>
              {busy === 'import' ? <LoaderCircle size={14} className="spin" /> : <FileUp size={14} />} Import file
            </button>
            <button className="btn btn-primary" onClick={createDoc} disabled={!!busy}>
              {busy === 'create' ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} New document
            </button>
          </div>
        </section>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}{data && <span className="tab-count">{counts[t.id]}</span>}
            </button>
          ))}
        </nav>

        {error && <div className="form-error">{error}</div>}
        {!data && !error && <div className="empty"><LoaderCircle className="spin" size={18} /></div>}

        {data && docs.length === 0 && (
          <div className="empty">
            <Inbox size={22} />
            <strong>{query ? 'No matching documents' : tab === 'shared' ? 'Nothing shared with you yet' : 'No documents yet'}</strong>
            <span>{query ? 'Try a different search.' : tab === 'shared' ? 'Documents teammates share with you will appear here.' : 'Create a document or import a file to get started.'}</span>
          </div>
        )}

        {docs.length > 0 && (
          <div className="doc-list">
            <div className="doc-row doc-row-head">
              <span>Name</span><span>Owner</span><span>Access</span><span>Last edited</span><span />
            </div>
            {docs.map((d) => (
              <div className="doc-row" key={d.id}>
                <Link to={`/d/${d.id}`} className="doc-name">
                  <span className={`doc-icon${d.role === 'owner' ? '' : ' shared'}`}><FileText size={15} /></span>
                  <span className="doc-text">
                    <strong>{d.title}</strong>
                    <small>{d.excerpt || 'Empty document'}</small>
                  </span>
                </Link>
                <span className="doc-owner">
                  <Avatar user={d.owner} size={20} />
                  {d.role === 'owner' ? 'You' : d.owner.name}
                </span>
                <span className="doc-access">
                  <RoleBadge role={d.role} />
                  {d.role === 'owner' && d.shareCount > 0 && (
                    <span className="share-count" title={`Shared with ${d.shareCount}`}><Users size={12} />{d.shareCount}</span>
                  )}
                </span>
                <span className="doc-updated" title={new Date(d.updatedAt).toLocaleString()}>
                  {timeAgo(d.updatedAt)}{d.updatedBy && <small>by {d.updatedBy === user.name ? 'you' : d.updatedBy.split(' ')[0]}</small>}
                </span>
                <Menu trigger={({ toggle }) => (
                  <button className="icon-btn" onClick={toggle} aria-label={`Actions for ${d.title}`}><Ellipsis size={16} /></button>
                )}>
                  {d.role !== 'viewer' && <MenuItem icon={PencilLine} onClick={() => setRenaming(d)}>Rename</MenuItem>}
                  {d.role === 'owner'
                    ? <MenuItem icon={Trash2} danger onClick={() => setDeleting(d)}>Delete</MenuItem>
                    : <MenuItem icon={LogOut} onClick={() => leave(d)}>Remove from my list</MenuItem>}
                </Menu>
              </div>
            ))}
          </div>
        )}
      </main>

      {renaming && <RenameDialog doc={renaming} onClose={() => setRenaming(null)} onDone={() => { setRenaming(null); load(); }} />}
      {deleting && <DeleteDialog doc={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); load(); }} />}
    </div>
  );
}

function RenameDialog({ doc, onClose, onDone }) {
  const toast = useToast();
  const [title, setTitle] = useState(doc.title);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateDocument(doc.id, { title });
      toast('Document renamed');
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  }

  return (
    <Modal title="Rename document" onClose={onClose} width={400}>
      <form onSubmit={submit} className="modal-body">
        <label className="field">
          <span>Title</span>
          <input autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ doc, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api.deleteDocument(doc.id);
      toast(`Deleted “${doc.title}”`);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title="Delete document?" subtitle={`“${doc.title}” will be permanently deleted${doc.shareCount ? ` and removed for ${doc.shareCount} collaborator${doc.shareCount > 1 ? 's' : ''}` : ''}.`} onClose={onClose} width={400}>
      <div className="modal-body">
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={confirm} disabled={busy}><Trash2 size={14} /> Delete</button>
        </div>
      </div>
    </Modal>
  );
}
