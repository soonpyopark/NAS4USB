# WhiteBoard4Share (vendored)

Fixed copy of [WhiteBoard4Share](https://github.com/soonpyopark/WhiteBoard4Share) used by NAS4USB/EduCowork.

| Field | Value |
|-------|--------|
| Version | See `UPSTREAM.json` |
| Engine import | `@wb4s-engine` → `vendor/whiteboard4share/src` |
| Host integration | `src/wb4s/Wb4sEditorView.jsx`, `src/components/editors/Wb4sEditorShell.jsx` |
| Local patches | `vendor/wb4s-educowork-overlay/` (see `PATCHES.md`) |

## Manual upstream update

When WhiteBoard4Share releases a new version:

### 1. Fetch upstream into a scratch folder

```bash
npm run sync:wb4s-upstream
```

This clones the latest GitHub repo to `.cache/wb4s-upstream-merge/` (gitignored).

### 2. Compare with this folder

```bash
git diff --no-index vendor/whiteboard4share .cache/wb4s-upstream-merge
```

Or use VS Code / Cursor **Compare Selected** on the two folders.

### 3. Merge upstream changes

- Copy updated files from scratch into `vendor/whiteboard4share/`
- Do **not** copy: `node_modules/`, `dist/`, `exe/`, `electron/`, `electron-dist/`
- Resolve conflicts file by file (prefer upstream for engine/collab; keep EduCowork patches)

### 4. Re-apply EduCowork patches

```powershell
Copy-Item vendor/wb4s-educowork-overlay/src/components/EditorView.tsx vendor/whiteboard4share/src/components/EditorView.tsx -Force
Copy-Item vendor/wb4s-educowork-overlay/src/components/Toolbar.tsx vendor/whiteboard4share/src/components/Toolbar.tsx -Force
```

See `vendor/wb4s-educowork-overlay/PATCHES.md` for what each patch does.

### 5. Bump version metadata

Edit `UPSTREAM.json`:

```json
{ "version": "1.0.x", "repository": "https://github.com/soonpyopark/WhiteBoard4Share.git" }
```

Also update `scripts/wb4s-upstream.mjs` → `WB4S_UPSTREAM_VERSION`.

### 6. Reinstall & test

```bash
npm run prepare:wb4s-deps
npm run dev:restart
```

Test: open `.wb4s`, draw, **작성 내용 저장**, multi-client collab, **← 닫기**, file list refresh.

## Dependencies

`vendor/whiteboard4share/node_modules/` is not committed. Run `npm run prepare:wb4s-deps` after clone.
