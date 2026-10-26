// Seeds demo accounts (and a couple of starter documents) on an empty database,
// so reviewers can exercise the sharing flow immediately.
import crypto from 'node:crypto';
import { hashPassword } from './auth.js';

export const DEMO_PASSWORD = 'ajaia-demo';

export const DEMO_USERS = [
  { email: 'alice@ajaia.dev', name: 'Alice Moreno', color: '#3E6B5A' },
  { email: 'bob@ajaia.dev', name: 'Bob Okafor', color: '#8A5A44' },
  { email: 'carol@ajaia.dev', name: 'Carol Chen', color: '#5B5F8F' },
];

const WELCOME = `
<h1>Welcome to Ajaia Docs</h1>
<p>This is a <strong>lightweight collaborative editor</strong>. A few things to try:</p>
<ul>
  <li>Format text with <strong>bold</strong>, <em>italic</em>, <u>underline</u> and headings.</li>
  <li>Click <strong>Share</strong> to give Bob or Carol <em>viewer</em> or <em>editor</em> access.</li>
  <li>Use <strong>Import</strong> to pull in a .txt, .md or .docx file.</li>
</ul>
<h2>How saving works</h2>
<p>Changes save automatically a moment after you stop typing. If a collaborator saves first, you'll be asked whether to load their version or keep yours.</p>
<ol><li>Edit</li><li>Pause</li><li>Saved</li></ol>`;

const PLANNING = `
<h1>Q4 planning notes</h1>
<p>Draft priorities for the internal tools team.</p>
<h2>Themes</h2>
<ol>
  <li><strong>Faster handoffs</strong> between product and engineering</li>
  <li>Fewer status meetings, more <em>written</em> updates</li>
  <li>One place for shared specs</li>
</ol>
<blockquote><p>Shared with Alice as a viewer, so she can read but not edit.</p></blockquote>`;

export async function seed(db) {
  const existing = await db.get('SELECT COUNT(*) AS n FROM users');
  if (Number(existing.n) > 0) return false;

  const ids = {};
  for (const u of DEMO_USERS) {
    ids[u.email] = crypto.randomUUID();
    await db.run('INSERT INTO users (id, email, name, color, password_hash) VALUES (?, ?, ?, ?, ?)',
      [ids[u.email], u.email, u.name, u.color, hashPassword(DEMO_PASSWORD)]);
  }

  const now = new Date().toISOString();
  const alice = ids['alice@ajaia.dev'];
  const bob = ids['bob@ajaia.dev'];
  const welcomeId = crypto.randomUUID();
  const planningId = crypto.randomUUID();
  const insertDoc = 'INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, 1, ?, ?, ?)';
  const insertShare = 'INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)';

  await db.run(insertDoc, [welcomeId, alice, 'Welcome to Ajaia Docs', WELCOME.trim(), now, now, alice]);
  await db.run(insertDoc, [planningId, bob, 'Q4 planning notes', PLANNING.trim(), now, now, bob]);
  await db.run(insertShare, [welcomeId, bob, 'editor', now]);
  await db.run(insertShare, [planningId, alice, 'viewer', now]);
  return true;
}
