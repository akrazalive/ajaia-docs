import path from 'node:path';
import { createApp } from './app.js';
import { createDb } from './db.js';
import { seed } from './seed.js';

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3001);
const secret = process.env.SESSION_SECRET ?? 'dev-only-insecure-secret';
if (isProd && !process.env.SESSION_SECRET) console.warn('SESSION_SECRET is not set; using an insecure default.');

const db = await createDb({
  databaseUrl: process.env.DATABASE_URL,
  sqliteFile: process.env.SQLITE_FILE ?? path.resolve('data/ajaia-docs.sqlite'),
});
if (await seed(db)) console.log('Seeded demo users and documents.');

createApp({ db, secret, secureCookies: isProd, serveClient: true }).listen(port, () => {
  console.log(`Ajaia Docs API (${db.driver}) listening on http://localhost:${port}`);
});
