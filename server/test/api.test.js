import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { newDb } from 'pg-mem';
import { createApp } from '../app.js';
import { createDb } from '../db.js';
import { DEMO_PASSWORD, seed } from '../seed.js';

// The whole suite runs once per storage driver: SQLite (local) and Postgres (deployed, emulated by pg-mem).
const DRIVERS = {
  sqlite: () => createDb({ sqliteFile: ':memory:' }),
  postgres: () => {
    const { Pool } = newDb().adapters.createPg();
    return createDb({ pgPool: new Pool() });
  },
};

describe.each(Object.keys(DRIVERS))('%s', (driver) => {
let app;

beforeEach(async () => {
  const db = await DRIVERS[driver]();
  await seed(db);
  app = createApp({ db, secret: 'test-secret' });
});

async function signIn(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  return agent;
}

describe('auth', () => {
  it('rejects bad credentials and unauthenticated requests', async () => {
    await request(app).post('/api/auth/login').send({ email: 'alice@ajaia.dev', password: 'nope' }).expect(401);
    await request(app).get('/api/documents').expect(401);
  });

  it('rejects a tampered session cookie', async () => {
    await request(app).get('/api/auth/me').set('Cookie', 'ajaia_session=eyJ1aWQiOiJ4In0.forged').expect(401);
  });
});

describe('documents', () => {
  it('creates, renames, edits and reopens a document with formatting intact', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const { body: created } = await alice.post('/api/documents').send({}).expect(201);
    expect(created.document.title).toBe('Untitled document');

    await alice.patch(`/api/documents/${created.document.id}`).send({ title: '  Launch   plan ' }).expect(200);
    const html = '<h2>Goals</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li>one</li></ul>';
    await alice.patch(`/api/documents/${created.document.id}`).send({ content: html, version: 1 }).expect(200);

    const { body } = await alice.get(`/api/documents/${created.document.id}`).expect(200);
    expect(body.document.title).toBe('Launch plan');
    expect(body.document.content).toBe(html);
    expect(body.document.version).toBe(2);
  });

  it('strips unsafe HTML from saved content', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const { body } = await alice.post('/api/documents')
      .send({ content: '<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=y></p>' }).expect(201);
    expect(body.document.content).toBe('<p>Hi</p>');
  });

  it('rejects a stale save with 409 and accepts a forced overwrite', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const bob = await signIn('bob@ajaia.dev');
    const { body: list } = await alice.get('/api/documents');
    const doc = list.owned[0];

    await bob.patch(`/api/documents/${doc.id}`).send({ content: '<p>Bob was here</p>', version: 1 }).expect(200);
    const conflict = await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>Alice</p>', version: 1 }).expect(409);
    expect(conflict.body.document.content).toBe('<p>Bob was here</p>');
    expect(conflict.body.error).toMatch(/Bob Okafor/);

    await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>Alice</p>', force: true }).expect(200);
  });
});

describe('sharing and access control', () => {
  it('separates owned and shared documents', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const { body } = await alice.get('/api/documents').expect(200);
    expect(body.owned.map((d) => d.title)).toEqual(['Welcome to Ajaia Docs']);
    expect(body.shared).toMatchObject([{ title: 'Q4 planning notes', role: 'viewer', owner: { name: 'Bob Okafor' } }]);
  });

  it('enforces owner / editor / viewer / no-access rules', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const carol = await signIn('carol@ajaia.dev');
    const { body: created } = await alice.post('/api/documents').send({ title: 'Private' }).expect(201);
    const id = created.document.id;

    // No access: indistinguishable from a missing document.
    await carol.get(`/api/documents/${id}`).expect(404);

    // Viewer can read but not edit, share or delete.
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'carol@ajaia.dev', role: 'viewer' }).expect(201);
    await carol.get(`/api/documents/${id}`).expect(200);
    await carol.patch(`/api/documents/${id}`).send({ content: '<p>x</p>', version: 1 }).expect(403);
    await carol.post(`/api/documents/${id}/shares`).send({ email: 'bob@ajaia.dev' }).expect(403);

    // Upgrade to editor: can edit, still can't delete.
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'carol@ajaia.dev', role: 'editor' }).expect(201);
    await carol.patch(`/api/documents/${id}`).send({ content: '<p>x</p>', version: 1 }).expect(200);
    await carol.delete(`/api/documents/${id}`).expect(403);

    // Revoke: access is gone.
    const { body: shares } = await alice.get(`/api/documents/${id}/shares`);
    await alice.delete(`/api/documents/${id}/shares/${shares.shares[0].id}`).expect(200);
    await carol.get(`/api/documents/${id}`).expect(404);
  });

  it('validates share requests', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const { body } = await alice.get('/api/documents');
    const id = body.owned[0].id;
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'not-an-email' }).expect(400);
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'nobody@ajaia.dev' }).expect(404);
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'alice@ajaia.dev' }).expect(400);
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'bob@ajaia.dev', role: 'admin' }).expect(400);
  });
});

describe('file import', () => {
  it('turns a Markdown upload into a new formatted document', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const md = '# Roadmap\n\nSome **bold** text.\n\n- one\n- two\n';
    const { body } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from(md), 'roadmap.md').expect(201);
    expect(body.document.title).toBe('roadmap');
    expect(body.document.content).toContain('<h1>Roadmap</h1>');
    expect(body.document.content).toContain('<strong>bold</strong>');
    expect(body.document.content).toContain('<li>one</li>');
  });

  it('converts plain text paragraphs and escapes markup', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const { body } = await alice.post('/api/files/convert')
      .attach('file', Buffer.from('Hello <b>world</b>\n\nSecond'), 'notes.txt').expect(200);
    expect(body.html).toBe('<p>Hello &lt;b&gt;world&lt;/b&gt;</p><p>Second</p>');
  });

  it('rejects unsupported and malformed files with a clear message', async () => {
    const alice = await signIn('alice@ajaia.dev');
    const pdf = await alice.post('/api/documents/import').attach('file', Buffer.from('%PDF'), 'deck.pdf').expect(400);
    expect(pdf.body.error).toMatch(/Unsupported file type/);
    await alice.post('/api/documents/import').attach('file', Buffer.from('not a zip'), 'fake.docx').expect(400);
  });
});
});
