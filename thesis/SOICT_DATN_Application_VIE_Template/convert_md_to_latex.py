#!/usr/bin/env python3
r"""
Convert the thesis main.md to LaTeX chapter files for the SOICT template.
Handles: HTML tables, images, bullet lists, blockquotes, markdown headers, bold/italic.
"""

import re
import os
from html.parser import HTMLParser

TEMPLATE_DIR = "/home/hoangdung/lending-pool-prj3/thesis/SOICT_DATN_Application_VIE_Template"
MAIN_MD = "/home/hoangdung/lending-pool-prj3/thesis/main.md"

CHAPTERS = {
    "2_Phan_tich": (769, 979),
    "3_Ly_thuyet": (981, 1293),
    "4_Thiet_ke": (1294, 2327),
    "5_Giai_phap": (2328, 2499),
    "6_Cai_dat": (2500, 3135),
    "7_Kiem_thu": (3136, 3609),
    "8_Ket_luan": (3610, 3776),
}


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_thead = False
        self.in_tbody = False
        self.in_cell = False
        self.current_cell = ""
        self.current_row = []
        self.rows = []
        self.header_rows = []
        self.col_count = 0
        self.col_widths = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t == 'table':
            self.rows = []; self.header_rows = []; self.col_widths = []; self.col_count = 0
        elif t == 'thead': self.in_thead = True
        elif t == 'tbody': self.in_tbody = True; self.in_thead = False
        elif t == 'tr': self.current_row = []
        elif t in ('td','th'):
            self.in_cell = True; self.current_cell = ""
        elif t == 'col':
            for n,v in attrs:
                if n == 'style':
                    m = re.search(r'(\d+)%', v)
                    if m: self.col_widths.append(int(m.group(1)))
        elif t == 'strong': self.current_cell += r"\textbf{"
        elif t == 'br': self.current_cell += " "

    def handle_endtag(self, tag):
        t = tag.lower()
        if t == 'thead': self.in_thead = False
        elif t == 'tbody': self.in_tbody = False
        elif t == 'tr':
            if self.in_thead or (not self.in_tbody and not self.rows):
                self.header_rows.append(self.current_row)
            else:
                self.rows.append(self.current_row)
            if len(self.current_row) > self.col_count:
                self.col_count = len(self.current_row)
        elif t in ('td','th'):
            self.in_cell = False
            cell = self.current_cell.strip().replace('\n',' ').strip()
            cell = cell.replace('&', r'\&').replace('%', r'\%').replace('#', r'\#')
            if r'\textbf' not in cell and r'\texttt' not in cell:
                cell = cell.replace('_', r'\_')
            cell = cell.replace('$', r'\$')
            self.current_row.append(cell)
        elif t == 'strong': self.current_cell += "}"

    def handle_data(self, data):
        if self.in_cell: self.current_cell += data

    def to_latex(self):
        if self.col_count == 0: return ""
        if self.col_widths:
            total = sum(self.col_widths) or 100
            specs = [f"p{{{w/total:.2f}\\textwidth}}" for w in self.col_widths[:self.col_count]]
        else:
            specs = ["l"] * self.col_count
        col_spec = "|" + "|".join(specs) + "|"
        lines = [f"\\begin{{tabular}}{{{col_spec}}}", "\\hline"]
        for row in self.header_rows:
            while len(row) < self.col_count: row.append("")
            cells = [f"\\textbf{{{c}}}" if not c.startswith("\\textbf") else c for c in row]
            lines.append(" & ".join(cells) + r" \\ \hline")
        for row in self.rows:
            while len(row) < self.col_count: row.append("")
            lines.append(" & ".join(row) + r" \\ \hline")
        lines.append("\\end{tabular}")
        return "\n".join(lines)


def parse_html_table(html_text):
    p = TableParser(); p.feed(html_text); return p.to_latex()


def fmt_text(text):
    """Apply inline formatting to text."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\\textbf{\1}', text)
    text = re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'\\textit{\1}', text)
    text = re.sub(r'`([^`]+?)`', r'\\texttt{\1}', text)
    text = text.replace('&', r'\&')
    text = text.replace('%', r'\%')
    text = re.sub(r'(?<!\\)_(?!\{)', r'\_', text)
    text = text.replace('\\`', '`')
    return text


def convert_chapter(lines, chapter_name):
    out = []
    out.append("\\documentclass[../DoAn.tex]{subfiles}")
    out.append("\\begin{document}")
    out.append("")

    i = 0
    in_code = False
    code_buf = []
    in_table = False
    table_buf = []
    skipped_chapter_heading = False

    while i < len(lines):
        line = lines[i]

        # Skip the chapter heading (# ...)
        if line.startswith('# ') and not skipped_chapter_heading:
            skipped_chapter_heading = True
            i += 1; continue

        # --- Code blocks (handle both ``` and escaped \`\`\`) ---
        stripped = line.strip().rstrip()
        is_code_fence = stripped.startswith('```') or stripped.startswith('\\`\\`\\`')
        if is_code_fence and not in_code:
            in_code = True; code_buf = []; i += 1; continue
        if is_code_fence and in_code:
            in_code = False
            # Filter out empty lines at start/end
            while code_buf and code_buf[0].strip() == '': code_buf.pop(0)
            while code_buf and code_buf[-1].strip() == '': code_buf.pop()
            if code_buf:
                out.append("\\begin{lstlisting}")
                out.extend(code_buf)
                out.append("\\end{lstlisting}")
                out.append("")
            i += 1; continue
        if in_code:
            code_buf.append(line); i += 1; continue

        # --- HTML tables ---
        if '<table>' in line.lower():
            in_table = True; table_buf = [line]; i += 1; continue
        if in_table:
            table_buf.append(line)
            if '</table>' in line.lower():
                in_table = False
                latex_tab = parse_html_table("\n".join(table_buf))
                if latex_tab:
                    out.append("\\begin{table}[H]")
                    out.append("\\centering")
                    out.append("\\resizebox{\\textwidth}{!}{%")
                    out.append(latex_tab)
                    out.append("}")
                    # look for caption
                    j = i + 1
                    while j < len(lines) and lines[j].strip() == '': j += 1
                    if j < len(lines) and re.match(r'^Bảng\s', lines[j].strip()):
                        cap = lines[j].strip().replace('_', r'\_').replace('&', r'\&').replace('%', r'\%')
                        out.append(f"\\caption{{{cap}}}")
                        i = j + 1
                        out.append("\\end{table}"); out.append("")
                        continue
                    out.append("\\end{table}"); out.append("")
            i += 1; continue

        # --- Images ---
        img_m = re.search(r'<img\s+src="([^"]+)"[^>]*/?\s*>', line)
        if img_m:
            img_file = os.path.basename(img_m.group(1))
            img_name = os.path.splitext(img_file)[0]
            j = i + 1
            while j < len(lines) and lines[j].strip() == '': j += 1
            caption = ""
            if j < len(lines) and lines[j].strip().startswith('Hình '):
                caption = lines[j].strip().replace('_', r'\_').replace('&', r'\&').replace('%', r'\%')
                i = j + 1
            else:
                i += 1
            out.append("\\begin{figure}[H]")
            out.append("\\centering")
            out.append(f"\\includegraphics[width=0.9\\textwidth]{{media/{img_file}}}")
            if caption:
                out.append(f"\\caption{{{caption}}}")
            out.append(f"\\label{{fig:{img_name}}}")
            out.append("\\end{figure}")
            out.append("")
            continue

        # --- Section headers ---
        # ## N. Title  or  ## N.Title
        m = re.match(r'^##\s+\d+\.?\s*(.*)', line)
        if m and not line.startswith('###'):
            title = m.group(1).strip().replace('**', '')
            out.append(f"\\section{{{title}}}")
            out.append("")
            i += 1; continue

        # ### N.N. Title  or  ### N.N Title
        m = re.match(r'^###\s+\d+\.\d+\.?\s*(.*)', line)
        if m:
            title = m.group(1).strip().replace('**', '')
            out.append(f"\\subsection{{{title}}}")
            out.append("")
            i += 1; continue

        # ### Title (no number)
        m = re.match(r'^###\s+(.+)', line)
        if m and not line.startswith('####'):
            title = m.group(1).strip().replace('**', '')
            title = re.sub(r'^\d+[\.\d]*\.?\s*', '', title)
            if title:
                out.append(f"\\subsection{{{title}}}")
                out.append("")
                i += 1; continue

        # #### N.N.N. Title
        m = re.match(r'^####\s+\d+\.\d+\.\d+\.?\s*(.*)', line)
        if m:
            title = m.group(1).strip().replace('**', '')
            out.append(f"\\subsubsection{{{title}}}")
            out.append("")
            i += 1; continue

        # #### Title (no number or empty)
        m = re.match(r'^####\s*(.*)', line)
        if m:
            title = m.group(1).strip().replace('**', '')
            title = re.sub(r'^\d+[\.\d]*\.?\s*', '', title)
            if title:
                out.append(f"\\subsubsection{{{title}}}")
                out.append("")
            i += 1; continue

        # --- Blockquotes ---
        if line.startswith('> '):
            quote_lines = []
            while i < len(lines) and lines[i].startswith('> '):
                ql = lines[i][2:].strip()
                ql = fmt_text(ql)
                quote_lines.append(ql)
                i += 1
            out.append("\\begin{quote}")
            out.append("\\textit{" + " ".join(quote_lines) + "}")
            out.append("\\end{quote}")
            out.append("")
            continue

        # --- Bullet lists ---
        if line.strip().startswith('- '):
            items = []
            while i < len(lines) and lines[i].strip().startswith('- '):
                it = lines[i].strip()[2:]
                it = fmt_text(it)
                items.append(it)
                i += 1
            out.append("\\begin{itemize}")
            for it in items:
                out.append(f"  \\item {it}")
            out.append("\\end{itemize}")
            out.append("")
            continue

        # --- Numbered lists (simple: "1. text" at start)
        nm = re.match(r'^(\d+)\.\s\s+(.+)', line.strip())
        if nm:
            items = []
            while i < len(lines):
                nm2 = re.match(r'^(\d+)\.\s\s+(.+)', lines[i].strip())
                if nm2:
                    it = fmt_text(nm2.group(2))
                    items.append(it)
                    i += 1
                else:
                    break
            if items:
                out.append("\\begin{enumerate}")
                for it in items:
                    out.append(f"  \\item {it}")
                out.append("\\end{enumerate}")
                out.append("")
                continue

        # --- Empty lines ---
        if line.strip() == '':
            out.append("")
            i += 1; continue

        # --- Regular paragraph ---
        text = line.strip()
        if text:
            text = fmt_text(text)
            out.append(text)

        i += 1

    out.append("")
    out.append("\\end{document}")
    return "\n".join(out)


def main():
    with open(MAIN_MD, 'r', encoding='utf-8') as f:
        all_lines = [l.rstrip('\n') for l in f.readlines()]

    for ch_name, (start, end) in CHAPTERS.items():
        ch_lines = all_lines[start-1:end]
        latex = convert_chapter(ch_lines, ch_name)
        path = os.path.join(TEMPLATE_DIR, "Chuong", f"{ch_name}.tex")
        with open(path, 'w', encoding='utf-8') as f:
            f.write(latex)
        print(f"OK {ch_name}.tex: {len(ch_lines)} md -> {len(latex.splitlines())} tex")

    print("\nDone!")


if __name__ == "__main__":
    main()
