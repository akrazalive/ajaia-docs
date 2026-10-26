// Access model: a document has exactly one owner; the owner may grant other users
// a `viewer` or `editor` role. Everything permission-related goes through here.

export const ROLES = ['viewer', 'editor'];

const RANK = { viewer: 1, editor: 2, owner: 3 };

export function can(role, action) {
  const needed = { read: 'viewer', edit: 'editor', manage: 'owner' }[action];
  return Boolean(role) && RANK[role] >= RANK[needed];
}

/**
 * Load a document together with the caller's role on it.
 * Returns null when the document doesn't exist OR the user has no access —
 * callers respond 404 in both cases so document ids can't be probed.
 */
export async function loadDocumentForUser(db, documentId, userId) {
  const row = await db.get(
    `SELECT d.*, o.name AS owner_name, o.email AS owner_email, o.color AS owner_color,
            ub.name AS updated_by_name, s.role AS share_role
       FROM documents d
       JOIN users o ON o.id = d.owner_id
       LEFT JOIN users ub ON ub.id = d.updated_by
       LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
      WHERE d.id = ?`,
    [userId, documentId],
  );
  if (!row) return null;
  const role = row.owner_id === userId ? 'owner' : row.share_role;
  return role ? { doc: row, role } : null;
}
