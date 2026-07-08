# EduCowork patches on WhiteBoard4Share

These files differ from upstream on purpose. After syncing upstream into
`.cache/wb4s-src/`, copy this overlay onto the engine tree (or run `npm run prepare:wb4s-src`):

```powershell
Copy-Item vendor/wb4s-educowork-overlay/src/components/EditorView.tsx .cache/wb4s-src/src/components/EditorView.tsx -Force
Copy-Item vendor/wb4s-educowork-overlay/src/components/Toolbar.tsx .cache/wb4s-src/src/components/Toolbar.tsx -Force
```

## EditorView.tsx

- `EditorEmbedMode`: `onClose`, `onRenameTitle` callbacks for NAS file explorer
- `showBackButton` when `onClose` is provided
- `handleBack` → calls `onClose` in embed mode
- `commitTitle` → `onRenameTitle` in embed mode
- `hideShare={false}` in embed (show **작성 내용 저장** for Yjs share)
- `exportDocument({ includeThumbnail })` — skip thumbnail on close save (host performance)
- Toolbar `backLabel` **← 닫기** in embed

## Toolbar.tsx

- Optional `backLabel` prop (default **← 갤러리**)
