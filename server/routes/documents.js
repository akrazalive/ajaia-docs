import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireUser } from '../auth.js';
import { ROLES, can, loadDocumentForUser } from '../access.js';
import { MAX_CONTENT_BYTES, MAX_UPLOAD_BYTES, convertFile, sanitizeContent } from '../content.js';

const MAX_TITLE = 200;
const DEFAULT_TITLE = 'Untitled document';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

function normaliseTitle(title) {
  if (title === undefined) return undefined;
  if (typeof title !== 'string') throw new HttpError(400, 'Title must be text.');
  const trimmed = title.replace(/\s+/g, ' ').trim();
  if (trimmed.length > MAX_TITLE) throw new HttpError(400, `Title must be ${MAX_TITLE} characters or fewer.`);
  return trimmed || DEFAULT_TITLE;
}

function normaliseContent(content) {
  if (content === undefined) return undefined;
  if (typeof content !== 'string') throw new HttpError(400, 'Content must be an HTML string.');
  if (Buffer.byteLength(content) > MAX_CONTENT_BYTES) throw new HttpError(413, 'This document is too large to save (1 MB limit).');
  return sanitizeContent(content);
}

const excerpt = (html) => String(html).replace(/<\/(p|h\d|li)>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim().slice(0, 160);

function toDocument(row, role) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    version: Number(row.version),
    role,
    owner: { id: row.owner_id, name: row.owner_name, email: row.owner_email, color: row.owner_color },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name ?? null,
  };
}

function toSummary(row) {
  return {
    id: row.id,
    title: row.title,
    excerpt: excerpt(row.content),
    role: row.role,
    owner: { id: row.owner_id, name: row.owner_name, color: row.owner_color },
    shareCount: Number(row.share_count ?? 0),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name ?? null,
  };
}

export function documentsRouter({ db }) {
  const router = Router();
  router.use(requireUser);

  async function access(req, action) {
    const found = await loadDocumentForUser(db, req.params.id, req.user.id);
    if (!found) throw new HttpError(404, 'Document not found, or you do not have access to it.');
    if (!can(found.role, action)) {
      const msg = action === 'manage' ? 'Only the owner can do that.' : 'You have view-only access to this document.';
      throw new HttpError(403, msg);
    }
    return found;
  }

  async function createDocument(ownerId, title, content) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, ownerId, title, content, now, now, ownerId],
    );
    return (await loadDocumentForUser(db, id, ownerId)).doc;
  }

  // ---- Listing -----------------------------------------------------------
  router.get('/', async (req, res) => {
    const uid = req.user.id;
    const base = `SELECT d.id, d.title, d.content, d.updated_at, d.owner_id,
                         o.name AS owner_name, o.color AS owner_color, ub.name AS updated_by_name,
                         COALESCE(sc.share_count, 0) AS share_count`;
    const joins = `JOIN users o ON o.id = d.owner_id LEFT JOIN users ub ON ub.id = d.updated_by
         LEFT JOIN (SELECT document_id, COUNT(*) AS share_count FROM document_shares GROUP BY document_id) sc
           ON sc.document_id = d.id`;
    const owned = await db.all(
      `${base}, 'owner' AS role
         FROM documents d ${joins}
        WHERE d.owner_id = ? ORDER BY d.updated_at DESC`, [uid],
    );
    const shared = await db.all(
      `${base}, s.role AS role
         FROM document_shares s JOIN documents d ON d.id = s.document_id ${joins}
        WHERE s.user_id = ? ORDER BY d.updated_at DESC`, [uid],
    );
    res.json({ owned: owned.map(toSummary), shared: shared.map(toSummary) });
  });

  // ---- Create / import ---------------------------------------------------
  router.post('/', async (req, res) => {
    const title = normaliseTitle(req.body?.title) ?? DEFAULT_TITLE;
    const content = normaliseContent(req.body?.content) ?? '';
    const row = await createDocument(req.user.id, title, content);
    res.status(201).json({ document: toDocument(row, 'owner') });
  });

  router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
    const { title, html } = await convertFile(req.file);
    const row = await createDocument(req.user.id, title, html);
    res.status(201).json({ document: toDocument(row, 'owner') });
  });

  // ---- Single document ---------------------------------------------------
  router.get('/:id', async (req, res) => {
    const { doc, role } = await access(req, 'read');
    res.json({ document: toDocument(doc, role) });
  });

  // Title changes are always accepted. Content changes use optimistic concurrency:
  // the client sends the version it edited; a stale version gets 409 unless `force` is set.
  router.patch('/:id', async (req, res) => {
    const title = normaliseTitle(req.body?.title);
    const content = normaliseContent(req.body?.content);
    if (title === undefined && content === undefined) throw new HttpError(400, 'Nothing to update.');

    const { doc, role } = await access(req, 'edit');
    const now = new Date().toISOString();

    if (title !== undefined) {
      await db.run('UPDATE documents SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        [title, now, req.user.id, doc.id]);
    }

    if (content !== undefined) {
      const baseVersion = Number(req.body?.version);
      const force = req.body?.force === true;
      if (!force && !Number.isInteger(baseVersion)) throw new HttpError(400, 'A document version is required to save content.');

      const result = force
        ? await db.run('UPDATE documents SET content = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?',
          [content, now, req.user.id, doc.id])
        : await db.run('UPDATE documents SET content = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ? AND version = ?',
          [content, now, req.user.id, doc.id, baseVersion]);

      if (result.changes === 0) {
        const latest = (await loadDocumentForUser(db, doc.id, req.user.id)).doc;
        throw new HttpError(409, `${latest.updated_by_name ?? 'Someone'} saved a newer version of this document.`,
          { document: toDocument(latest, role) });
      }
    }

    const updated = (await loadDocumentForUser(db, doc.id, req.user.id)).doc;
    res.json({ document: toDocument(updated, role) });
  });

  router.delete('/:id', async (req, res) => {
    const { doc } = await access(req, 'manage');
    await db.run('DELETE FROM document_shares WHERE document_id = ?', [doc.id]);
    await db.run('DELETE FROM documents WHERE id = ?', [doc.id]);
    res.status(204).end();
  });

  // ---- Sharing -----------------------------------------------------------
  async function listShares(documentId) {
    return db.all(
      `SELECT u.id, u.name, u.email, u.color, s.role, s.created_at AS "sharedAt"
         FROM document_shares s JOIN users u ON u.id = s.user_id
        WHERE s.document_id = ? ORDER BY s.created_at`, [documentId],
    );
  }

  router.get('/:id/shares', async (req, res) => {
    const { doc } = await access(req, 'read');
    res.json({ shares: await listShares(doc.id) });
  });

  router.post('/:id/shares', async (req, res) => {
    const { doc } = await access(req, 'manage');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const role = req.body?.role ?? 'viewer';
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (!ROLES.includes(role)) throw new HttpError(400, 'Role must be "viewer" or "editor".');

    const target = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (!target) throw new HttpError(404, `No Ajaia Docs account found for ${email}.`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'The owner already has full access.');

    await db.run(
      `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
      [doc.id, target.id, role, new Date().toISOString()],
    );
    res.status(201).json({ shares: await listShares(doc.id) });
  });

  // Owners can revoke anyone; a collaborator can remove themselves ("leave").
  router.delete('/:id/shares/:userId', async (req, res) => {
    const isSelf = req.params.userId === req.user.id;
    const { doc } = await access(req, isSelf ? 'read' : 'manage');
    await db.run('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?', [doc.id, req.params.userId]);
    res.json({ shares: await listShares(doc.id) });
  });

  return router;
}

export function filesRouter() {
  const router = Router();
  router.use(requireUser);
  // Convert an uploaded file to editor HTML without creating a document
  // (used for "Import into this document").
  router.post('/convert', upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
    res.json(await convertFile(req.file));
  });
  return router;
}

export { HttpError };
