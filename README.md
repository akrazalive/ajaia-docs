# Ajaia Docs

A lightweight collaborative document editor: create and format documents, import files, share them with teammates as viewers or editors, and pick up each other's changes.

**Live app:** https://ajaia-docs-85m9.onrender.com · **Walkthrough:** see [VIDEO_URL.txt](VIDEO_URL.txt)

## Demo accounts

All accounts use the password **`ajaia-demo`**. You can also click an account on the sign-in screen to log in with one click.

| User | Email | Seeded state |
|---|---|---|
| Alice Moreno | `alice@ajaia.dev` | Owns *Welcome to Ajaia Docs* (shared with Bob as **editor**) |
| Bob Okafor | `bob@ajaia.dev` | Owns *Q4 planning notes* (shared with Alice as **viewer**) |
| Carol Chen | `carol@ajaia.dev` | Starts with nothing, so you can test sharing from scratch |

**Suggested review path**
1. Sign in as Alice. Open *Welcome*, edit it, and watch the status change to "Saved".
2. Click **Share** and invite `carol@ajaia.dev` as *View only*.
3. In a private window, sign in as Carol. The doc appears under **Shared with me** and opens read-only.
4. As Alice, change Carol to *Can edit*. Within about 8 seconds Carol's editor unlocks.
5. To see conflict handling, open the same doc as Alice and as Bob, then type in both at once. The second save shows a conflict banner with **Load their version** and **Keep mine**.

## Features

- **Documents.** Create, rename (inline or from the list), edit, delete (owner only), and reopen. Changes autosave about 0.8 s after you stop typing.
- **Rich text.** Bold, italic, underline, strikethrough, inline code, Heading 1–3, bulleted and numbered lists, quotes and dividers, plus undo and redo. Standard keyboard shortcuts work.
- **File upload.** Supports **.txt, .md and .docx files, up to 5 MB**. There are two ways to use it:
  - **Import file** on the dashboard creates a new document from the file.
  - **Import** inside the editor inserts the file's content at the cursor.

  Formatting is preserved: Markdown and .docx headings, lists and emphasis carry over. Other file types are rejected with a clear message.
- **Sharing.**
  - Each document has one owner, who can grant *viewer* or *editor* access by email, change roles, or revoke access.
  - Collaborators can remove a shared document from their own list.
  - The dashboard separates **Owned by me** from **Shared with me** and shows a role badge on every document.
- **Concurrent editing safety.** Saves use optimistic versioning, so a stale save is rejected (HTTP 409) instead of silently overwriting someone else's work. Idle editors poll and pull in collaborators' changes.
- **Export.** Download as Markdown, or Print / Save as PDF using a print stylesheet that shows only the document.

## Run locally

Requires **Node 22.13+** (Node 24 recommended). There's no database to install: local mode uses Node's built-in SQLite.

```bash
npm install
npm run dev        # API on :3001 + Vite dev server on http://localhost:5173
```

Production-style run (one process serving the API and the built client):

```bash
npm run build
npm start          # http://localhost:3001
```

Run the tests:

```bash
npm test           # runs the API suite against SQLite and against Postgres (emulated with pg-mem)
```

Data is stored in `data/ajaia-docs.sqlite`. Delete that file to reset to the seeded demo state.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `DATABASE_URL` | unset | When set, uses Postgres instead of SQLite |
| `SQLITE_FILE` | `data/ajaia-docs.sqlite` | SQLite path (local mode only) |
| `SESSION_SECRET` | dev-only value | HMAC key for session cookies. **Set this in production.** |
| `NODE_ENV` | | Set to `production` for secure cookies |

## Deployment

The repo includes a [Render Blueprint](render.yaml). It creates a free Node web service plus a free Postgres database, and generates `SESSION_SECRET` automatically. On first boot the app creates its tables and seeds the demo accounts.

1. Push this repo to GitHub.
2. In Render, choose **New → Blueprint** and select the repo, then click **Apply**.
3. When the build finishes, open the `ajaia-docs` service URL.

Free-tier caveats: the service sleeps after about 15 minutes idle, so the first request can take around 30–50 s. Render's free Postgres expires after 30 days.

## Project layout

```
server/
  index.js          entry: config, DB, seed, listen
  app.js            Express app, routing, central error handler
  db.js             storage adapter (SQLite or Postgres, one async interface)
  auth.js           password hashing, signed session cookie, middleware
  access.js         owner/editor/viewer rules, the single source of truth for permissions
  content.js        HTML sanitising and .txt/.md/.docx → HTML conversion
  routes/           auth, documents, sharing, file conversion
  seed.js           demo users and documents
  test/api.test.js  integration tests (supertest, run against both drivers)
client/src/
  pages/            Login, Dashboard, Editor
  components/       Toolbar, ShareDialog, Toasts, menus/modals
  api.js            fetch wrapper
  styles.css        design system (tokens, components, document typography, print)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and trade-offs, and [AI_WORKFLOW.md](AI_WORKFLOW.md) for how AI tools were used.
