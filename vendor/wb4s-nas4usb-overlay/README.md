# EduCowork overlay for WhiteBoard4Share

Patches applied on top of `.cache/wb4s-src/` after sync or **에디터 업데이트** (see `PATCHES.md`).

Re-apply manually after upstream merge:

```powershell
Copy-Item vendor/wb4s-educowork-overlay/src/components/EditorView.tsx .cache/wb4s-src/src/components/EditorView.tsx -Force
Copy-Item vendor/wb4s-educowork-overlay/src/components/Toolbar.tsx .cache/wb4s-src/src/components/Toolbar.tsx -Force
```

Or run `npm run prepare:wb4s-src` / **에디터 업데이트** (overlay is applied automatically).
