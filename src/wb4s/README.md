# EduCowork host layer for WhiteBoard4Share

| Layer | Path |
|-------|------|
| **Vendored editor (fixed copy)** | `vendor/whiteboard4share/` |
| **NAS host (open/save `.wb4s`)** | `Wb4sEditorShell.jsx`, `Wb4sEditorView.jsx` |
| **EduCowork patches** | `vendor/wb4s-educowork-overlay/` |

Vite alias `@wb4s-engine` → `vendor/whiteboard4share/src`.

Upstream updates: see `vendor/whiteboard4share/UPSTREAM.md` and `npm run sync:wb4s-upstream`.
