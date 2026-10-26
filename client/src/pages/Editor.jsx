import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import TurndownService from 'turndown';
import {
  ArrowLeft, Check, CloudOff, Download, Eye, FileText, FileUp, LoaderCircle, Printer, Share2, TriangleAlert,
} from 'lucide-react';
import { SUPPORTED_UPLOADS, UPLOAD_HINT, api } from '../api.js';
import { useAuth } from '../App.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import { useToast } from '../components/Toasts.jsx';
import Toolbar from '../components/Toolbar.jsx';
import { Avatar, Menu, MenuItem, RoleBadge, timeAgo } from '../components/ui.jsx';
import UserMenu from '../components/UserMenu.jsx';

const AUTOSAVE_DELAY_MS = 800;
const POLL_INTERVAL_MS = 8000;

export default function EditorPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDoc(null);
    setError('');
    api.getDocument(id).then((r) => setDoc(r.document)).catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="page">
        <div className="empty empty-page">
          <TriangleAlert size={22} />
          <strong>We couldn’t open this document</strong>
          <span>{error}</span>
          <Link to="/" className="btn"><ArrowLeft size={14} /> Back to documents</Link>
        </div>
      </div>
    );
  }
  if (!doc) return <div className="boot"><LoaderCircle className="spin" size={20} /></div>;
  return <DocumentEditor key={doc.id} initial={doc} />;
}

function DocumentEditor({ initial }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [meta, setMeta] = useState(initial); // everything except live content
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState('saved'); // saved | pending | saving | error | conflict
  const [conflict, setConflict] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [importing, setImporting] = useState(false);

  const canEdit = meta.role !== 'viewer';
  const versionRef = useRef(initial.version);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef(null);
  const conflictRef = useRef(false);
  const titleFocused = useRef(false);
  const fileInput = useRef(null);
  const titleInput = useRef(null);
  const editorRef = useRef(null);

  // ---- Saving ------------------------------------------------------------
  const save = useCallback(async ({ force = false } = {}) => {
    const editor = editorRef.current;
    if (!editor || savingRef.current || (!dirtyRef.current && !force) || (conflictRef.current && !force)) return;
    clearTimeout(timerRef.current);
    savingRef.current = true;
    dirtyRef.current = false;
    setStatus('saving');
    try {
      const body = force ? { content: editor.getHTML(), force: true } : { content: editor.getHTML(), version: versionRef.current };
      const { document } = await api.updateDocument(meta.id, body);
      versionRef.current = document.version;
      conflictRef.current = false;
      setConflict(null);
      setMeta((m) => ({ ...m, updatedAt: document.updatedAt, updatedBy: document.updatedBy }));
      setStatus(dirtyRef.current ? 'pending' : 'saved');
    } catch (err) {
      dirtyRef.current = true;
      if (err.status === 409) {
        conflictRef.current = true;
        setConflict({ message: err.message, document: err.body.document });
        setStatus('conflict');
      } else {
        setStatus('error');
        toast(err.message, 'error');
      }
    } finally {
      savingRef.current = false;
    }
    // Typing continued while the request was in flight.
    if (dirtyRef.current && !conflictRef.current) timerRef.current = setTimeout(() => save(), AUTOSAVE_DELAY_MS);
  }, [meta.id, toast]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initial.content,
    editable: initial.role !== 'viewer',
    immediatelyRender: true,
    onUpdate: () => {
      dirtyRef.current = true;
      if (conflictRef.current) return;
      setStatus('pending');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => save(), AUTOSAVE_DELAY_MS);
    },
  });
  editorRef.current = editor;

  // Second arg: don't emit an `update` event (which would mark the doc dirty).
  useEffect(() => { editor?.setEditable(canEdit, false); }, [editor, canEdit]);

  // Warn before leaving with unsaved changes; best-effort save on unmount.
  useEffect(() => {
    const onBeforeUnload = (e) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimeout(timerRef.current);
      if (dirtyRef.current && !conflictRef.current) save();
    };
  }, [save]);

  // ---- Picking up collaborators' changes (lightweight polling) -------------
  const refreshCollaborators = useCallback(() => {
    api.listShares(meta.id).then((r) => setCollaborators(r.shares)).catch(() => {});
  }, [meta.id]);
  useEffect(refreshCollaborators, [refreshCollaborators]);

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const { document: latest } = await api.getDocument(meta.id);
        setMeta((m) => ({ ...m, role: latest.role, updatedAt: latest.updatedAt, updatedBy: latest.updatedBy }));
        if (!titleFocused.current) setTitle(latest.title);
        const idle = !dirtyRef.current && !savingRef.current && !conflictRef.current;
        if (latest.version > versionRef.current && idle) {
          editorRef.current?.commands.setContent(latest.content, { emitUpdate: false });
          versionRef.current = latest.version;
          toast(`Updated with ${latest.updatedBy ?? 'a collaborator'}’s latest changes`);
        }
      } catch (err) {
        if (err.status === 404) {
          toast('Your access to this document was removed.', 'error');
          navigate('/');
        }
      }
    };
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [meta.id, navigate, toast]);

  // ---- Conflict resolution --------------------------------------------------
  function loadTheirs() {
    const theirs = conflict.document;
    editor.commands.setContent(theirs.content, { emitUpdate: false });
    versionRef.current = theirs.version;
    dirtyRef.current = false;
    conflictRef.current = false;
    setConflict(null);
    setStatus('saved');
    setMeta((m) => ({ ...m, updatedAt: theirs.updatedAt, updatedBy: theirs.updatedBy }));
  }

  // ---- Title ---------------------------------------------------------------
  useEffect(() => {
    if (location.state?.focusTitle && canEdit) titleInput.current?.select();
  }, [location.state, canEdit]);

  async function commitTitle() {
    titleFocused.current = false;
    const next = title.replace(/\s+/g, ' ').trim() || 'Untitled document';
    if (next === meta.title) return setTitle(next);
    try {
      const { document } = await api.updateDocument(meta.id, { title: next });
      setMeta((m) => ({ ...m, title: document.title }));
      setTitle(document.title);
    } catch (err) {
      toast(err.message, 'error');
      setTitle(meta.title);
    }
  }

  useEffect(() => { document.title = `${title || 'Untitled document'} · Ajaia Docs`; }, [title]);

  // ---- Import / export -----------------------------------------------------
  async function importIntoDocument(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const { html } = await api.convertFile(file);
      editor.chain().focus().insertContent(html).run();
      toast(`Inserted content from ${file.name}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setImporting(false);
    }
  }

  function exportMarkdown() {
    const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    const markdown = `# ${title}\n\n${turndown.turndown(editor.getHTML())}\n`;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${title.replace(/[\\/:*?"<>|]+/g, '-')}.md` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function goBack() {
    await save();
    navigate('/');
  }

  const people = [meta.owner, ...collaborators].filter((p) => p.id !== user.id);

  return (
    <div className="page editor-page">
      <header className="topbar editor-topbar">
        <button className="icon-btn" onClick={goBack} aria-label="Back to documents" title="Back to documents"><ArrowLeft size={17} /></button>
        <span className="doc-icon"><FileText size={15} /></span>
        <div className="title-block">
          <input
            ref={titleInput} className="title-input" value={title} maxLength={200} readOnly={!canEdit}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => { titleFocused.current = true; }}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.commands.focus('start'); } }}
            aria-label="Document title"
          />
          <div className="title-meta">
            <SaveStatus status={status} meta={meta} onRetry={() => save()} />
            {meta.role !== 'owner' && <span className="dot-sep">·</span>}
            {meta.role !== 'owner' && <span>Owned by {meta.owner.name}</span>}
          </div>
        </div>

        <div className="topbar-actions">
          {people.length > 0 && (
            <button className="avatar-stack" onClick={() => setShareOpen(true)} title="People with access">
              {people.slice(0, 4).map((p) => <Avatar key={p.id} user={p} size={24} />)}
            </button>
          )}
          {meta.role !== 'owner' && <RoleBadge role={meta.role} />}
          {canEdit && (
            <>
              <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={importIntoDocument} />
              <button className="btn btn-ghost" onClick={() => fileInput.current.click()} disabled={importing} title={`Insert a file at the cursor (${UPLOAD_HINT})`}>
                {importing ? <LoaderCircle size={14} className="spin" /> : <FileUp size={14} />} Import
              </button>
            </>
          )}
          <Menu trigger={({ toggle }) => (
            <button className="btn btn-ghost" onClick={toggle}><Download size={14} /> Export</button>
          )}>
            <MenuItem icon={Download} onClick={exportMarkdown}>Markdown (.md)</MenuItem>
            <MenuItem icon={Printer} onClick={() => window.print()}>Print / Save as PDF</MenuItem>
          </Menu>
          <button className="btn btn-primary" onClick={() => setShareOpen(true)}><Share2 size={14} /> Share</button>
          <UserMenu />
        </div>
      </header>

      {canEdit ? <div className="toolbar-wrap">{editor && <Toolbar editor={editor} />}</div> : (
        <div className="notice notice-info">
          <Eye size={15} />
          <span>You have view-only access. Ask {meta.owner.name} for edit access to make changes.</span>
        </div>
      )}

      {conflict && (
        <div className="notice notice-warn" role="alert">
          <TriangleAlert size={15} />
          <span><strong>{conflict.message}</strong> Your latest edits haven’t been saved.</span>
          <div className="notice-actions">
            <button className="btn btn-sm" onClick={loadTheirs}>Load their version</button>
            <button className="btn btn-sm btn-warn" onClick={() => save({ force: true })}>Keep mine</button>
          </div>
        </div>
      )}

      <main className="canvas" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus('end')}>
        <article className="paper">
          <EditorContent editor={editor} className="prose" />
        </article>
      </main>

      {shareOpen && (
        <ShareDialog doc={{ ...meta, title }} onClose={() => setShareOpen(false)} onChange={setCollaborators} />
      )}
    </div>
  );
}

function SaveStatus({ status, meta, onRetry }) {
  if (status === 'saving') return <span className="save-status"><LoaderCircle size={12} className="spin" /> Saving…</span>;
  if (status === 'pending') return <span className="save-status">Unsaved changes</span>;
  if (status === 'conflict') return <span className="save-status warn"><TriangleAlert size={12} /> Not saved — conflict</span>;
  if (status === 'error') {
    return <span className="save-status error"><CloudOff size={12} /> Couldn’t save · <button className="link-btn" onClick={onRetry}>Retry</button></span>;
  }
  return (
    <span className="save-status" title={new Date(meta.updatedAt).toLocaleString()}>
      <Check size={12} /> Saved · edited {timeAgo(meta.updatedAt)}{meta.updatedBy ? ` by ${meta.updatedBy.split(' ')[0]}` : ''}
    </span>
  );
}
