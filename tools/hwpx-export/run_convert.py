#!/usr/bin/env python3
"""HTML/DOCX/MD → HWPX via vendored pypandoc-hwpx + bundled pandoc."""

from __future__ import annotations

import os
import sys


def _bootstrap_paths() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    pydeps = os.path.join(here, "pydeps")
    vendor_root = os.path.join(here, "vendor")
    pandoc_dir = os.path.join(here, "pandoc")

    if os.path.isdir(pydeps):
        sys.path.insert(0, pydeps)
    if os.path.isdir(vendor_root):
        sys.path.insert(0, vendor_root)

    if os.path.isdir(pandoc_dir):
        os.environ["PATH"] = pandoc_dir + os.pathsep + os.environ.get("PATH", "")

    # Prefer tools copy, then repo vendor/pypandoc-hwpx layout.
    candidates = [
        os.path.join(here, "vendor", "pypandoc_hwpx", "blank.hwpx"),
        os.path.join(here, "pypandoc_hwpx", "blank.hwpx"),
        os.path.join(here, "..", "..", "vendor", "pypandoc-hwpx", "pypandoc_hwpx", "blank.hwpx"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return candidates[0]


def main() -> int:
    if len(sys.argv) < 3:
        print(
            "Usage: run_convert.py <input.html> <output.hwpx> [reference.hwpx]",
            file=sys.stderr,
        )
        return 2

    input_path = os.path.abspath(sys.argv[1])
    output_path = os.path.abspath(sys.argv[2])
    reference_path = (
        os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else _bootstrap_paths()
    )

    if not os.path.isfile(input_path):
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 1
    if not os.path.isfile(reference_path):
        print(f"Reference HWPX not found: {reference_path}", file=sys.stderr)
        return 1

    try:
        from pypandoc_hwpx.PandocToHwpx import PandocToHwpx
    except Exception as err:  # noqa: BLE001 — surface import errors to NAS4USB
        print(
            "Failed to import pypandoc-hwpx. Run `npm run prepare:hwpx-export` "
            f"and ensure Python 3 is available.\n{err}",
            file=sys.stderr,
        )
        return 1

    try:
        PandocToHwpx.convert_to_hwpx(input_path, output_path, reference_path)
    except Exception as err:  # noqa: BLE001
        print(f"HWPX conversion failed: {err}", file=sys.stderr)
        return 1

    if not os.path.isfile(output_path):
        print(f"Output was not created: {output_path}", file=sys.stderr)
        return 1

    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
