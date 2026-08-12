# TipTap → HWPX export tools

Uses [pypandoc-hwpx](https://github.com/msjang/pypandoc-hwpx) (MIT) plus a bundled
Pandoc binary to convert TipTap HTML into `.hwpx`.

Pandoc Windows binary is downloaded from GitHub Releases (currently **3.10.1**);
see [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) (GPL-2.0-or-later).

## Prepare (host machine)

Requires **Python 3** on PATH (`python` or `py -3`).

```bash
npm run prepare:hwpx-export
```

This will:

1. Copy vendored `pypandoc_hwpx` into `tools/hwpx-export/vendor/`
2. Download Pandoc for Windows into `tools/hwpx-export/pandoc/`
3. `pip install --target pydeps pypandoc pillow`

## Runtime

The Electron host (or LAN API `/api/tiptap/exportHwpx`) runs
`run_convert.py` with the bundled Pandoc on `PATH`.

Tablet/browser clients call the host API; conversion always runs on the NAS4USB host.
