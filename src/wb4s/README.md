# NAS4USB host layer for WhiteBoard4Share

| Layer | Path |
|-------|------|
| **Engine (synced, not in git)** | `.cache/wb4s-src/` |
| **NAS host (open/save `.wb4s`)** | `Wb4sEditorShell.jsx`, `Wb4sEditorView.jsx` |
| **NAS4USB patches** | `vendor/wb4s-nas4usb-overlay/` |
| **Offline update package** | `lib/updates/wb4s/` |

Vite alias `@wb4s-engine` → `.cache/wb4s-src/src`.

## Setup

```bash
npm run prepare:wb4s-src
```

## Update (admin · USB)

Sidebar **에디터 업데이트** — GitHub clone 또는 `lib/updates/wb4s` 복사 + overlay 적용.

Maintainer merge: `npm run sync:wb4s-upstream`
