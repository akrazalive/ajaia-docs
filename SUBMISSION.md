# Submission: Ajaia Docs (Full Stack Product Engineer take-home)

**Candidate:** Asaf Khan Raza
**Live app:** https://ajaia-docs-85m9.onrender.com
**Source repo:** https://github.com/akrazalive/ajaia-docs  
**Walkthrough video:** `<VIDEO_URL>` (also in `VIDEO_URL.txt`)
**Demo logins:** `alice@ajaia.dev`, `bob@ajaia.dev`, `carol@ajaia.dev`. The password for all three is `ajaia-demo`.

## What's included

| Item | Location |
|---|---|
| Source code | `server/` (Express API), `client/` (React + TipTap), `package.json`, `vite.config.js` |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Automated tests | `server/test/api.test.js` (run with `npm test`; 22 tests across SQLite and Postgres) |
| Deployment config | `render.yaml` (Render Blueprint: web service + Postgres) |
| Walkthrough video link | `VIDEO_URL.txt` |
| This file | `SUBMISSION.md` |

## Status

**Working end to end**
- Creating, renaming, editing and deleting documents, with autosave and reopening
- Rich text: bold, italic, underline, strikethrough, headings H1–H3, bulleted and numbered lists, quotes, inline code and dividers
- Uploading .txt, .md and .docx files, either as a new document or inserted into the current one
- Sharing with an owner, editor and viewer roles, granting, changing and revoking access, and separate Owned / Shared lists
- Persistence in SQLite locally and Postgres in the deployment
- Conflict-safe concurrent saves, plus polling to pick up collaborators' changes
- Export to Markdown and Print / PDF
- Validation and error handling: file type and size limits, title and content limits, email and role validation, clear error messages

**Not built, by choice** (see ARCHITECTURE.md)
- Real-time character-level co-editing and live cursors
- Comments, suggestions and version history
- Sign-up and password reset

**Next 2–4 hours:** version history with restore, Yjs real-time collaboration, a diff view for conflicts, and Playwright end-to-end tests.
