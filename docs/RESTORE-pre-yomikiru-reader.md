# Restore: pre–Yomikiru-style Comic Reader

Checkpoint created **before** the ComicReaderShell (A + replace) work.

| Item | Value |
|------|--------|
| Git tag | `checkpoint/pre-yomikiru-reader` |
| Commit | `7017f583c807221bf51a6f028a6391ecb7a1efb0` |

> The tag points at **HEAD at tagging time**. Uncommitted working-tree changes were **not** included.

## Soft restore (images only)

PDF already uses the legacy `PdfViewerShell` by default.
To route **images** back to `ImageViewerShell` without git rollback:

1. Set in browser/Electron DevTools console:

   ```js
   localStorage.setItem('nas4usb.useLegacyImagePdfViewers', '1');
   location.reload();
   ```

2. Or set `USE_LEGACY_IMAGE_PDF_VIEWERS = true` in
   [`src/lib/comicReader/legacyViewerFlag.js`](../src/lib/comicReader/legacyViewerFlag.js)
   and rebuild/reload.

3. Or set `"useLegacyImagePdfViewers": true` in `.nas4usb-settings.json` and restart the app.

To undo soft restore:

```js
localStorage.removeItem('nas4usb.useLegacyImagePdfViewers');
location.reload();
```

Legacy files kept on purpose (do not delete for rollback):

- `src/components/editors/ImageViewerShell.jsx`
- `src/components/editors/PdfViewerShell.jsx`
- PDF markup / sidecar under `src/lib/pdf/`

## Hard restore (git)

Detach to the checkpoint:

```bash
git switch --detach checkpoint/pre-yomikiru-reader
```

Or create a branch from it:

```bash
git switch -c restore/pre-yomikiru-reader checkpoint/pre-yomikiru-reader
```

To throw away later Comic Reader commits on `main` (destructive — only if you intend to):

```bash
git reset --hard checkpoint/pre-yomikiru-reader
```

## What soft restore does *not* change

- Archive/EPUB openables (`cbz`, `cbr`, `zip`, `rar`, `7z`, `epub`) still use `ComicReaderShell`.
- Soft restore only restores **images** to `ImageViewerShell`. PDF already uses `PdfViewerShell`.
