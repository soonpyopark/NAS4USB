# EduCowork overlay for WhiteBoard4Share

Patches applied on top of `vendor/whiteboard4share/` (see `PATCHES.md`).

After merging a new upstream release, re-copy:

```powershell
Copy-Item vendor/wb4s-educowork-overlay/src/components/EditorView.tsx vendor/whiteboard4share/src/components/EditorView.tsx -Force
Copy-Item vendor/wb4s-educowork-overlay/src/components/Toolbar.tsx vendor/whiteboard4share/src/components/Toolbar.tsx -Force
```
