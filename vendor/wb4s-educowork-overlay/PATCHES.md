# EduCowork patches on WhiteBoard4Share

These files differ from upstream on purpose. After merging a new upstream release into
`vendor/whiteboard4share/`, copy this overlay onto the vendor tree:

```powershell
Copy-Item vendor/wb4s-educowork-overlay/src/components/EditorView.tsx vendor/whiteboard4share/src/components/EditorView.tsx -Force
Copy-Item vendor/wb4s-educowork-overlay/src/components/Toolbar.tsx vendor/whiteboard4share/src/components/Toolbar.tsx -Force
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
