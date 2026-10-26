# AI workflow note

## Tools used

- **Claude Code** (Anthropic, Claude Opus) running as an agent inside VS Code. It planned the build, wrote the code, ran the tests, and made the git commits.
- **Claude in Chrome**, which Claude Code used to drive a real browser: clicking through the app locally and on the live deployment, taking screenshots, and setting up the Render Blueprint.
- **GitHub CLI** and **Render**, for the repo and the hosting.

I treated the AI as a fast implementer working to my brief. I set the product direction, design constraints and release decisions, and every claim in this submission was checked by running the app or the tests.

## Where AI materially sped up the work

- **Going from brief to a working full-stack slice in one session.** That covered the Express API, the React and TipTap editor, the storage layer, the seed data, and the docs. Without AI this is easily several days of work. Here the time went into deciding and verifying rather than typing.
- **Library details.** TipTap v3 has changed from earlier versions: StarterKit now includes Underline and Link, Placeholder moved to `@tiptap/extensions`, and toolbar state comes from `useEditorState`. The agent checked the installed packages instead of guessing from memory. It did the same with Node 24's built-in `node:sqlite` and with `mammoth` for .docx files.
- **Tests.** It turned the access rules into dense integration tests, then ran the whole suite against a second database driver.
- **Deployment.** It wrote the Render Blueprint (`render.yaml`), created the GitHub repo, deployed, and smoke-tested the live API and UI.

## Decisions I made, and AI output I changed or rejected

- **Design direction.** I asked for a clean, professional look: blended neutral colors, no gradients, small buttons, refined typography and relevant icons. The result is warm paper neutrals with one deep-green accent, Newsreader and Instrument Sans fonts, and Lucide icons.
- **Scope.** We rejected real-time CRDT co-editing (Yjs plus WebSockets) as too much infrastructure for the timebox. Instead we used **optimistic versioning with a conflict banner**. It has the same core guarantee, never silently losing someone's work, at a fraction of the risk.
- **Bugs found by testing the AI's own output:**
  - **View-only users saw "Unsaved changes."** The editor called TipTap's `setEditable()`, which fires an update event by default, so read-only documents were marked as edited and tried to save in the background. This was caught in the browser while signed in as a viewer, and fixed by turning that event off.
  - **A query that only worked on SQLite.** The first document-list query used a correlated subquery. When the suite ran against Postgres (emulated with `pg-mem`), three tests failed, so the query was rewritten as a grouped `LEFT JOIN` that works on both.
  - **Visual bugs from screenshots.** For example, an over-broad CSS selector stretched the avatars on the login screen.
- **Security choices.**
  - "No access" returns 404 rather than 403, so document IDs can't be probed.
  - All HTML is sanitized on the server, for both editor saves and file imports. Relying on the editor's own filtering wasn't enough.
- **Deployment.** I chose to make the repo public, which let Render deploy it from the public URL without me granting Render access to my GitHub account.

## How correctness, UX and reliability were verified

- **Automated tests:** 11 integration tests (supertest) run against **both SQLite and Postgres**, so 22 pass in total. They cover:
  - authentication, including a forged session cookie
  - creating, renaming and editing documents, and reopening them with formatting intact
  - HTML sanitization
  - stale saves rejected with 409, plus the forced overwrite
  - each step of access: none → viewer → editor → revoked
  - validation of share requests
  - importing .md, .txt and .docx files, and rejecting bad files
- **End-to-end in a real browser, locally:**
  - signed in as each seeded user
  - formatted text, then read the saved HTML back through the API
  - shared a document with Carol as a viewer and confirmed the read-only UI
  - caused a real conflict (Alice saving through the API while Bob typed), then resolved it
  - imported a generated .docx and confirmed headings, bold, italic and lists came through
- **On the live deployment:** checked the health endpoint (showing the Postgres driver), signed in, listed documents, and edited and autosaved in the browser, then reverted that test edit.
- **What wasn't verified:** I didn't do a full visual check of the phone layout. The responsive CSS exists but wasn't screenshot-tested.
