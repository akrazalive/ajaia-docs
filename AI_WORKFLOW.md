# AI workflow note

> **Draft. Review and edit this so it reflects your own experience before submitting.**

## Tools used

- **Claude Code** (Anthropic, Claude Opus) in VS Code. I used it to scaffold the project, write most of the first-pass code, run tests, and drive the app in a browser for verification.
- **Claude in Chrome** for end-to-end clicking through flows and taking screenshots during verification.

## Where AI materially sped things up

- **Scaffolding and boilerplate:** the Express routes, fetch wrapper, React pages and CSS design tokens. This took minutes instead of hours.
- **Library surface area:** TipTap v3 API details (StarterKit now bundles Underline and Link, Placeholder moved to `@tiptap/extensions`, `useEditorState` for toolbar state), plus `mammoth` and `node:sqlite` usage.
- **Test writing:** turning the access-control rules into a dense table of supertest assertions, then running the whole suite against a second storage driver.

## What I changed or rejected

- **Scope.** I rejected real-time CRDT collaboration (Yjs) as too much infrastructure for the timebox. I chose optimistic versioning with a conflict banner instead, which shows the same product thinking (never silently lose data) at a fraction of the risk.
- **A bug in generated code:** the editor called `setEditable(...)` on load. That emits an `update` event by default, so **view-only users saw "Unsaved changes"** and a background save was attempted. I caught it during browser testing and fixed it by passing `emitUpdate = false`.
- **Portability:** the first version of the document-list query used a correlated subquery for share counts. Running the suite against Postgres (pg-mem) failed on it, so I rewrote it as a grouped `LEFT JOIN` that works on both drivers.
- **UI details:** a CSS selector that was too broad stretched the avatars on the login screen. I spotted it in a screenshot and narrowed the selector.
- **Status codes:** I changed "no access" responses from 403 to 404 so that a document's existence isn't leaked.

## How I verified correctness, UX and reliability

- **Automated:** 11 integration tests covering auth, CRUD, sanitization, conflict (409 and force), role enforcement, share validation, and .md/.txt/.docx import. Each runs on **both SQLite and Postgres**, for 22 passing tests in total.
- **Manual end-to-end in a real browser:**
  - signed in as each seeded user
  - edited and formatted text, and confirmed the saved HTML through the API
  - shared a document with Carol as a viewer and confirmed the read-only UI
  - triggered a real conflict by saving as Alice through the API while typing as Bob, then resolved it
  - imported a generated .docx and checked that headings, bold, italic and lists came through
- **Review:** I read every generated file before accepting it, with particular attention to the permission checks in `access.js`, the SQL in `routes/documents.js`, and the save and conflict state machine in `Editor.jsx`.
