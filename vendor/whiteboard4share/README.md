# EduCowork minimal overlay for WhiteBoard4Share

Upstream source lives in `.cache/wb4s-src` (synced from GitHub `WhiteBoard4Share` v1.0.3 on first build).

This folder applies **host integration only** — collab, drawing engine, and Y.js hooks come from upstream unchanged.

- `src/components/EditorView.tsx` — embed close/rename callbacks for NAS file explorer
- `src/components/Toolbar.tsx` — embed back label (`← 닫기`)

After editing, run:

```bash
npm run prepare:wb4s-src
```
