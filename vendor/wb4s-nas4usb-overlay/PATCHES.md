# NAS4USB patches on WhiteBoard4Share

These files differ from upstream on purpose. After syncing upstream into
`.cache/wb4s-src/`, copy this overlay onto the engine tree (or run `npm run prepare:wb4s-src`):

```powershell
Copy-Item vendor/wb4s-nas4usb-overlay/src/components/EditorView.tsx .cache/wb4s-src/src/components/EditorView.tsx -Force
Copy-Item vendor/wb4s-nas4usb-overlay/src/components/Toolbar.tsx .cache/wb4s-src/src/components/Toolbar.tsx -Force
Copy-Item vendor/wb4s-nas4usb-overlay/src/index.css .cache/wb4s-src/src/index.css -Force
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

## index.css

- Scope the upstream `* / html / body / #root` reset under `html.wb4s-embed-mode`
  (`:where()` so specificity stays the same as `*`). Vite never unloads this
  stylesheet after the first `.wb4s` open; without scoping, 닫기 leaves the
  explorer with zero padding and a locked body scroll.
