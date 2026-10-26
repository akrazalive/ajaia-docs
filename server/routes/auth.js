import { Router } from 'express';
import {
  SESSION_COOKIE, createSessionToken, requireUser, sessionCookieOptions, verifyPassword,
} from '../auth.js';

export function authRouter({ db, secret, secureCookies }) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    res.cookie(SESSION_COOKIE, createSessionToken(user.id, secret), sessionCookieOptions(secureCookies));
    res.json({ user: { id: user.id, email: user.email, name: user.name, color: user.color } });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireUser, (req, res) => res.json({ user: req.user }));

  return router;
}

export function usersRouter({ db }) {
  const router = Router();
  // Directory of teammates, used for share suggestions.
  router.get('/', requireUser, async (req, res) => {
    const users = await db.all(
      'SELECT id, email, name, color FROM users WHERE id <> ? ORDER BY name', [req.user.id],
    );
    res.json({ users });
  });
  return router;
}
