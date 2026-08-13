"""HTML-like table layout for TipTap → HWPX (nested tables, header fill, 100% width)."""

from __future__ import annotations

import random
import re
import time
import xml.etree.ElementTree as ET

# Content width ≈ A4 minus Hangul default L/R margins (matches blank.hwpx).
PAGE_CONTENT_WIDTH = 45000
# HTML td padding ~0.4rem / 0.6rem.
CELL_PAD_H = 510
CELL_PAD_V = 280
MIN_ROW_HEIGHT = 1400
NESTED_MIN_WIDTH = 2000

# TipTap HTML: td/th border #d1d5db, th background #f9fafb.
CELL_BORDER_XML = """
<hh:borderFill id="{id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
    <hh:slash type="NONE" Crooked="0" isCounter="0"/>
    <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
    <hh:leftBorder type="SOLID" width="0.12 mm" color="#D1D5DB"/>
    <hh:rightBorder type="SOLID" width="0.12 mm" color="#D1D5DB"/>
    <hh:topBorder type="SOLID" width="0.12 mm" color="#D1D5DB"/>
    <hh:bottomBorder type="SOLID" width="0.12 mm" color="#D1D5DB"/>
    <hh:diagonal type="NONE" width="0.1 mm" color="#D1D5DB"/>
    <hc:fillBrush>
      <hc:winBrush faceColor="{fill}" hatchColor="#000000" alpha="0"/>
    </hc:fillBrush>
</hh:borderFill>
"""


def _normalize_hex_color(value):
    raw = str(value or "").strip()
    if not raw or raw.lower() in ("transparent", "inherit", "none"):
        return ""
    m = re.fullmatch(r"#([0-9a-f]{3,8})", raw, re.I)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(ch * 2 for ch in h)
        return f"#{h[:6].upper()}"
    m = re.match(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", raw, re.I)
    if m:
        return "#{:02X}{:02X}{:02X}".format(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return ""


def _span_shade_color(attr):
    """Pandoc Span attr: [id, [classes], [[key, val], ...]]."""
    if not isinstance(attr, (list, tuple)) or not attr:
        return ""
    classes = attr[1] if len(attr) > 1 else []
    pairs = attr[2] if len(attr) > 2 else []
    kvs = {}
    if isinstance(pairs, list):
        for item in pairs:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                kvs[str(item[0]).lower()] = str(item[1])
    for key in ("data-color", "data-background-color", "background-color"):
        hexv = _normalize_hex_color(kvs.get(key, ""))
        if hexv:
            return hexv
    style = kvs.get("style") or ""
    m = re.search(r"background(?:-color)?\s*:\s*([^;]+)", style, re.I)
    if m:
        hexv = _normalize_hex_color(m.group(1))
        if hexv:
            return hexv
    if isinstance(classes, list) and "mark" in classes:
        return "#F2F0F0"
    return ""


def apply():
    from pypandoc_hwpx.PandocToHwpx import PandocToHwpx

    orig_init = PandocToHwpx.__init__
    orig_process_blocks = PandocToHwpx._process_blocks
    orig_handle_para = PandocToHwpx._handle_para
    orig_handle_plain = PandocToHwpx._handle_plain
    orig_process_inlines = PandocToHwpx._process_inlines
    orig_get_char_pr_id = PandocToHwpx._get_char_pr_id

    def __init__(self, *args, **kwargs):
        self._table_width_stack = []
        self._force_bold = False
        orig_init(self, *args, **kwargs)
        if self.header_root is not None:
            _ensure_table_border_fill(self, self.header_root)

    def _append_border_fill(self, root, fill_color):
        ns = self.namespaces
        border_fills = root.find(".//hh:borderFills", ns)
        if border_fills is None:
            border_fills = ET.SubElement(root, "{http://www.hancom.co.kr/hwpml/2011/head}borderFills")
        max_id = 0
        for bf in border_fills.findall("hh:borderFill", ns):
            max_id = max(max_id, int(bf.get("id", 0)))
        fill_id = str(max_id + 1)
        node = ET.fromstring(CELL_BORDER_XML.format(id=fill_id, fill=fill_color).strip())
        border_fills.append(node)
        return fill_id

    def _ensure_table_border_fill(self, root):
        self.table_border_fill_id = _append_border_fill(self, root, "none")
        self.table_header_fill_id = _append_border_fill(self, root, "#F9FAFB")

    def _process_blocks(self, blocks, table_width=None):
        if not hasattr(self, "_table_width_stack"):
            self._table_width_stack = []
        pushed = table_width is not None
        if pushed:
            self._table_width_stack.append(table_width)
        try:
            return orig_process_blocks(self, blocks)
        finally:
            if pushed:
                self._table_width_stack.pop()

    def _handle_para(self, content):
        if getattr(self, "_force_bold", False):
            normal_char_pr_id = 0
            if self.header_root is not None:
                style_node = self.header_root.find(
                    f'.//hh:style[@id="{self.normal_style_id}"]', self.namespaces
                )
                if style_node is not None:
                    normal_char_pr_id = style_node.get("charPrIDRef", 0)
            xml = self._create_para_start(style_id=self.normal_style_id, para_pr_id=self.normal_para_pr_id)
            xml += self._process_inlines(content, base_char_pr_id=normal_char_pr_id, active_formats={"BOLD"})
            xml += "</hp:p>"
            return xml
        return orig_handle_para(self, content)

    def _handle_plain(self, content):
        if getattr(self, "_force_bold", False):
            return _handle_para(self, content)
        return orig_handle_plain(self, content)

    def _process_inlines(self, inlines, base_char_pr_id=0, active_formats=None):
        if not isinstance(inlines, list):
            return orig_process_inlines(self, inlines, base_char_pr_id, active_formats)
        if active_formats is None:
            active_formats = set()
        results = []
        chunk = []

        def flush():
            if chunk:
                results.append(orig_process_inlines(self, chunk, base_char_pr_id, active_formats))
                chunk.clear()

        for item in inlines:
            if item.get("t") == "Span":
                flush()
                content = item.get("c") or []
                attr = content[0] if content else []
                inner = content[1] if len(content) > 1 else []
                new_formats = set(active_formats)
                shade = _span_shade_color(attr)
                if shade:
                    new_formats.add(f"SHADE:{shade}")
                results.append(_process_inlines(self, inner, base_char_pr_id, new_formats))
            else:
                chunk.append(item)
        flush()
        return "".join(results)

    def _get_char_pr_id(self, base_id, active_formats):
        new_id = orig_get_char_pr_id(self, base_id, active_formats)
        shades = [
            part[6:]
            for part in (active_formats or [])
            if isinstance(part, str) and part.startswith("SHADE:")
        ]
        if not shades or self.header_root is None:
            return new_id
        node = self.header_root.find(f'.//hh:charPr[@id="{new_id}"]', self.namespaces)
        if node is not None:
            node.set("shadeColor", shades[-1])
        return new_id

    def _flatten_rows(content):
        table_head = content[3]
        table_bodies = content[4]
        table_foot = content[5]
        rows = []
        for row in table_head[1]:
            rows.append((row, True))
        for body in table_bodies:
            for row in body[2]:
                rows.append((row, False))
            for row in body[3]:
                rows.append((row, False))
        for row in table_foot[1]:
            rows.append((row, False))
        return rows

    def _col_widths(specs, total_width):
        col_cnt = max(1, len(specs))
        rel = []
        for spec in specs:
            width_info = spec[1] if len(spec) > 1 else None
            if isinstance(width_info, dict) and width_info.get("t") == "ColWidth":
                try:
                    rel.append(float(width_info.get("c") or 0))
                except (TypeError, ValueError):
                    rel.append(0.0)
            else:
                rel.append(0.0)
        known = sum(rel)
        if known > 0:
            leftover = max(0.0, 1.0 - known)
            zeros = sum(1 for r in rel if r <= 0)
            widths = []
            for r in rel:
                frac = r if r > 0 else (leftover / zeros if zeros else 0)
                widths.append(max(800, int(total_width * frac)))
            drift = total_width - sum(widths)
            if widths:
                widths[-1] = max(800, widths[-1] + drift)
            return widths
        even = int(total_width / col_cnt)
        widths = [even] * col_cnt
        widths[-1] = total_width - even * (col_cnt - 1)
        return widths

    def _estimate_blocks_height(self, blocks):
        if not blocks:
            return MIN_ROW_HEIGHT
        total = 0
        for block in blocks:
            if not isinstance(block, dict):
                total += MIN_ROW_HEIGHT
                continue
            if block.get("t") == "Table":
                total += _estimate_table_height(self, block.get("c"))
            else:
                total += MIN_ROW_HEIGHT
        return max(total, MIN_ROW_HEIGHT)

    def _estimate_table_height(self, content):
        if not content or len(content) < 6:
            return MIN_ROW_HEIGHT
        height = 0
        for row, _header in _flatten_rows(content):
            row_h = MIN_ROW_HEIGHT
            for cell in row[1]:
                row_h = max(row_h, _estimate_blocks_height(self, cell[4]))
            height += row_h
        return max(height, MIN_ROW_HEIGHT)

    def _handle_table(self, content):
        specs = content[2]
        tagged_rows = _flatten_rows(content)
        if not tagged_rows:
            return ""

        nested = bool(getattr(self, "_table_width_stack", None))
        if nested:
            total_width = max(NESTED_MIN_WIDTH, int(self._table_width_stack[-1]))
        else:
            total_width = PAGE_CONTENT_WIDTH

        col_cnt = max(1, len(specs))
        col_widths = _col_widths(specs, total_width)
        row_cnt = len(tagged_rows)

        tbl_id = str(int(time.time() * 1000) % 100000000 + random.randint(0, 10000))
        xml_parts = []
        xml_parts.append(
            self._create_para_start(style_id=self.normal_style_id, para_pr_id=self.normal_para_pr_id)
        )
        xml_parts.append(self._create_run_start(char_pr_id=0))

        treat_as_char = "1" if nested else "0"
        horz_rel = "PARA" if nested else "COLUMN"
        out_bottom = "0" if nested else "850"
        fill_ref = getattr(self, "table_border_fill_id", "3")
        header_fill = getattr(self, "table_header_fill_id", fill_ref)

        xml_parts.append(
            f'<hp:tbl id="{tbl_id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" '
            f'textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" '
            f'rowCnt="{row_cnt}" colCnt="{col_cnt}" cellSpacing="0" borderFillIDRef="{fill_ref}" noAdjust="0">'
        )

        occupied = set()
        curr_row_addr = 0
        row_heights = []
        generated_rows = []

        for row, is_header_row in tagged_rows:
            cells = row[1]
            curr_col_addr = 0
            row_h = MIN_ROW_HEIGHT
            cell_xml = []

            for cell in cells:
                while (curr_row_addr, curr_col_addr) in occupied:
                    curr_col_addr += 1
                actual_col = curr_col_addr
                rowspan = cell[2]
                colspan = cell[3]
                cell_blocks = cell[4]
                for r in range(rowspan):
                    for c in range(colspan):
                        occupied.add((curr_row_addr + r, actual_col + c))

                cell_width = 0
                for i in range(colspan):
                    if actual_col + i < len(col_widths):
                        cell_width += col_widths[actual_col + i]
                    else:
                        cell_width += int(total_width / col_cnt)

                inner_width = max(NESTED_MIN_WIDTH, cell_width - CELL_PAD_H * 2)
                prev_bold = getattr(self, "_force_bold", False)
                self._force_bold = is_header_row or prev_bold
                cell_content_xml = self._process_blocks(cell_blocks, table_width=inner_width)
                self._force_bold = prev_bold
                if not str(cell_content_xml).strip():
                    cell_content_xml = (
                        f'{self._create_para_start(style_id=self.normal_style_id, para_pr_id=self.normal_para_pr_id)}'
                        f'{self._create_run_start(char_pr_id=0)}<hp:t></hp:t></hp:run></hp:p>'
                    )

                content_h = _estimate_blocks_height(self, cell_blocks)
                row_h = max(row_h, content_h)

                sublist_id = str(int(time.time() * 100000) % 1000000000 + random.randint(0, 100000))
                cell_fill = header_fill if is_header_row else fill_ref
                header_flag = "1" if is_header_row else "0"
                cell_xml.append(
                    {
                        "xml_open": (
                            f'<hp:tc name="" header="{header_flag}" hasMargin="0" protect="0" '
                            f'editable="0" dirty="0" borderFillIDRef="{cell_fill}">'
                            f'<hp:subList id="{sublist_id}" textDirection="HORIZONTAL" lineWrap="BREAK" '
                            f'vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" '
                            f'textHeight="0" hasTextRef="0" hasNumRef="0">'
                            f"{cell_content_xml}</hp:subList>"
                            f'<hp:cellAddr colAddr="{actual_col}" rowAddr="{curr_row_addr}"/>'
                            f'<hp:cellSpan colSpan="{colspan}" rowSpan="{rowspan}"/>'
                        ),
                        "width": cell_width,
                        "rowspan": rowspan,
                    }
                )
                curr_col_addr += colspan

            row_heights.append(row_h)
            generated_rows.append(cell_xml)
            curr_row_addr += 1

        table_height = sum(row_heights)
        xml_parts.append(
            f'<hp:sz width="{total_width}" widthRelTo="ABSOLUTE" height="{table_height}" '
            f'heightRelTo="ABSOLUTE" protect="0"/>'
        )
        xml_parts.append(
            f'<hp:pos treatAsChar="{treat_as_char}" affectLSpacing="0" flowWithText="1" allowOverlap="0" '
            f'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="{horz_rel}" vertAlign="TOP" horzAlign="LEFT" '
            f'vertOffset="0" horzOffset="0"/>'
        )
        xml_parts.append(f'<hp:outMargin left="0" right="0" top="0" bottom="{out_bottom}"/>')
        xml_parts.append(
            f'<hp:inMargin left="{CELL_PAD_H}" right="{CELL_PAD_H}" top="{CELL_PAD_V}" bottom="{CELL_PAD_V}"/>'
        )

        for row_i, cell_xml in enumerate(generated_rows):
            xml_parts.append("<hp:tr>")
            row_h = row_heights[row_i]
            for cell in cell_xml:
                cell_h = row_h * max(1, cell["rowspan"])
                xml_parts.append(cell["xml_open"])
                xml_parts.append(f'<hp:cellSz width="{cell["width"]}" height="{cell_h}"/>')
                xml_parts.append(
                    f'<hp:cellMargin left="{CELL_PAD_H}" right="{CELL_PAD_H}" '
                    f'top="{CELL_PAD_V}" bottom="{CELL_PAD_V}"/>'
                )
                xml_parts.append("</hp:tc>")
            xml_parts.append("</hp:tr>")

        xml_parts.append("</hp:tbl>")
        xml_parts.append("</hp:run>")
        xml_parts.append("</hp:p>")
        return "".join(xml_parts)

    PandocToHwpx.__init__ = __init__
    PandocToHwpx._ensure_table_border_fill = _ensure_table_border_fill
    PandocToHwpx._process_blocks = _process_blocks
    PandocToHwpx._handle_para = _handle_para
    PandocToHwpx._handle_plain = _handle_plain
    PandocToHwpx._handle_table = _handle_table
    PandocToHwpx._process_inlines = _process_inlines
    PandocToHwpx._get_char_pr_id = _get_char_pr_id
