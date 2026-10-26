# Architecture note

## Shape of the system

```
Browser (React + TipTap)  ──JSON / multipart──▶  Express API  ──▶  Storage adapter ──▶ SQLite (local) | Postgres (hosted)
        ▲  served as static build by the same process                │
        └────────────────── signed httpOnly session cookie ──────────┘
```

I chose a single Node service that serves both the API and the built React app. That means one deploy, one URL, no CORS setup, and same-origin cookies.

## What I prioritized, and why

1. **Correct access control over feature breadth.**
   - Every permission decision goes through `server/access.js`. It loads a document together with the caller's role (`owner`, `editor`, `viewer` or none) and checks the action with `can(role, action)`.
   - If the caller has no access, the API returns **404, not 403**, so document IDs can't be probed.
   - Tests cover every role transition: none → viewer → editor → revoked.
2. **A trustworthy editing loop.**
   - **Autosave** with a visible status: Unsaved, Saving, Saved, Couldn't save (with Retry), and Conflict.
   - **Optimistic concurrency:** each content save sends the version it was based on. The server updates `WHERE version = ?`, and if another save landed first it returns **409** with the latest document. The user then picks *Load their version* or *Keep mine*. This turns silent data loss, the worst failure in a shared editor, into an explicit choice.
   - **Lightweight polling** (every 8 s, paused in background tabs) pulls in collaborators' changes while you're idle, and also picks up role changes and revoked access.
3. **Content safety.**
   - Documents are stored as HTML restricted to an allowlist that matches the editor's schema.
   - Everything is sanitized on the server, both editor saves and file imports, so a crafted request can't store `<script>` or event handlers.
   - The editor schema also strips unknown markup on load, which is a second layer of defense.
4. **File import that fits the product.**
   - Uploads become editable content: a new document from the dashboard, or inserted at the cursor in the editor.
   - .docx goes through `mammoth`, Markdown through `marked`, and plain text is split into paragraphs and escaped. All three end up in the same sanitizer.
   - Limits (5 MB; .txt, .md and .docx only) are enforced on the server and stated in the UI.
5. **Zero-friction setup.**
   - Local runs use Node's built-in `node:sqlite`, so there are no native modules to compile and no database to install.
   - The deployed app uses Postgres, through the same async adapter (`all`, `get`, `run`, `exec`) with portable SQL.
   - The test suite runs against **both** drivers (Postgres emulated with `pg-mem`).

## Key decisions and trade-offs

| Decision | Why | Cost |
|---|---|---|
| TipTap (ProseMirror) editor | Mature, schema-based rich text; good keyboard behavior and paste handling | Bundle size (~225 KB gzipped) |
| Store HTML, not ProseMirror JSON | Imports produce HTML naturally; easy to sanitize, export and inspect | Less structured than JSON for future features such as comments anchored to nodes |
| Polling + optimistic locking instead of real-time CRDT (Yjs) | Fits the timebox, has no extra infrastructure, and never silently loses data | Not true simultaneous co-editing; the second writer resolves a conflict |
| Seeded users + password login + HMAC cookie | Real identity on every request, so sharing logic is genuine. No third-party auth for reviewers to set up | No sign-up, password reset or rate limiting |
| Share by email to existing accounts only | Clear and testable with the seeded users | No invites to people without an account |
| Title changes skip the version check | Renaming shouldn't conflict with someone typing in the body | Concurrent renames are last-write-wins |

## Deliberately out of scope

- Real-time cursors and character-level merging (would use Yjs with a WebSocket provider)
- Comments, suggestions and version history
- Attachments stored as files (uploads are converted into content instead)
- Sign-up, password reset, organizations, link-sharing and public access
- Images and tables in the editor

## What I'd build next with another 2–4 hours

1. **Version history.** Keep a snapshot row on each save (or every N minutes), with a "Restore" view. The version column is already in place.
2. **Real-time co-editing.** Use Yjs with `y-websocket` for live collaboration and presence avatars, replacing the polling.
3. **A diff view in the conflict banner,** so users can merge by hand instead of choosing one version or the other.
4. **Hardening:** rate-limit login, add CSRF tokens on top of SameSite cookies, add structured logging, and add Playwright end-to-end tests for the editor.
