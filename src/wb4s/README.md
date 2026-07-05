# EduCowork overlay for WhiteBoard4Share

Upstream source lives in `.cache/wb4s-src` (synced from sibling `WhiteBoard4Share v1.0.3` or cloned from GitHub on first build).

This folder contains EduCowork-specific changes applied on top before `npm run build:wb4s-editor`:

- `embed.html`, `src/embed/*` — iframe embed entry for EduCowork
- `src/hooks/useYjsWhiteboardEmbed.ts` — Y.js via EduCowork sync server (`http://host:3008`)
- `src/components/EditorView.tsx`, `Toolbar.tsx` — embed mode (no gallery/API save)
- `src/context/DeptSessionContext.tsx` — `EmbedDeptSessionProvider`
- `vite.config.ts` — relative `base`, multi-page (`embed.html`)
- `src/index.css` — full-height embed layout

Edit files here, then run:

```bash
npm run build:wb4s-editor
```
