import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { sessionMiddleware } from './auth.js';
import { ImportError } from './content.js';
import { authRouter, usersRouter } from './routes/auth.js';
import { documentsRouter, filesRouter } from './routes/documents.js';

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');

export function createApp({ db, secret, secureCookies = false, serveClient = false }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(sessionMiddleware(db, secret));

  app.get('/api/health', (_req, res) => res.json({ ok: true, driver: db.driver }));
  app.use('/api/auth', authRouter({ db, secret, secureCookies }));
  app.use('/api/users', usersRouter({ db }));
  app.use('/api/documents', documentsRouter({ db }));
  app.use('/api/files', filesRouter());
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  if (serveClient && fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    // SPA fallback: every non-API GET renders the client app.
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(CLIENT_DIST, 'index.html')) : next()));
  }

  // Central error handler: known errors become clean JSON, everything else is a logged 500.
  app.use((err, _req, res, _next) => {
    if (err instanceof ImportError) return res.status(400).json({ error: err.message });
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'Files must be 5 MB or smaller.' : err.message });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, ...err.extra });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return app;
}
