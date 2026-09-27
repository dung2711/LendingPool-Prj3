#!/usr/bin/env python3
"""Fix all LaTeX compilation errors in chapter files."""
import re, os, glob

CHUONG = os.path.join(os.path.dirname(__file__), 'Chuong')

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # 1. Replace lstlisting with verbatim (lstlisting can't handle UTF-8/Vietnamese)
    content = content.replace(r'\begin{lstlisting}', r'\begin{verbatim}')
    content = content.replace(r'\end{lstlisting}', r'\end{verbatim}')
    
    # 2. Fix box-drawing Unicode characters -> ASCII tree
    content = content.replace('├── ', '|-- ')
    content = content.replace('│   ', '|   ')
    content = content.replace('└── ', '`-- ')
    content = content.replace('├', '|--')
    content = content.replace('│', '|')
    content = content.replace('└', '`--')
    content = content.replace('─', '-')
    
    # 3. Fix \< and \> which are undefined control sequences
    # \< should be $<$ and \> should be $>$
    # But careful: \> inside verbatim should stay as-is
    # Process line by line, skip verbatim blocks
    lines = content.split('\n')
    in_verbatim = False
    fixed_lines = []
    for line in lines:
        if r'\begin{verbatim}' in line:
            in_verbatim = True
            fixed_lines.append(line)
            continue
        if r'\end{verbatim}' in line:
            in_verbatim = False
            fixed_lines.append(line)
            continue
        if not in_verbatim:
            # Mask escaped dollar signs
            line = line.replace('\\$', '__ESCAPED_DOLLAR__')
            
            # Map for superscripts
            super_map = {
                '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
                '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'
            }
            
            parts = line.split('$')
            new_parts = []
            for i, part in enumerate(parts):
                in_math = (i % 2 != 0)
                
                if in_math:
                    # Inside math mode
                    part = part.replace('≤', '\\leq')
                    part = part.replace('≥', '\\geq')
                    part = part.replace('Δ', '\\Delta')
                    part = part.replace('×', '\\times')
                    part = part.replace('≈', '\\approx')
                    part = part.replace('−', '-')
                    part = part.replace('←', '\\leftarrow')
                    part = part.replace('→', '\\rightarrow')
                    part = part.replace('↓', '\\downarrow')
                    
                    # Superscripts in math mode
                    def repl_num_super_math(match):
                        base = match.group(1)
                        supers = match.group(2)
                        digits = "".join(super_map[c] for c in supers)
                        return f"{base}^{{{digits}}}"
                    part = re.sub(r'([a-zA-Z\d]+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)', repl_num_super_math, part)
                    
                    def repl_standalone_super_math(match):
                        supers = match.group(0)
                        digits = "".join(super_map[c] for c in supers)
                        return f"^{{{digits}}}"
                    part = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+', repl_standalone_super_math, part)
                else:
                    # Outside math mode (text mode)
                    part = part.replace('≤', '$\\leq$')
                    part = part.replace('≥', '$\\geq$')
                    part = part.replace('Δ', '$\\Delta$')
                    part = part.replace('×', '$\\times$')
                    part = part.replace('≈', '$\\approx$')
                    part = part.replace('−', '-')
                    part = part.replace('←', '$\\leftarrow$')
                    part = part.replace('→', '$\\rightarrow$')
                    part = part.replace('↓', '$\\downarrow$')
                    
                    # Superscripts in text mode -> wrap in math mode
                    def repl_num_super_text(match):
                        base = match.group(1)
                        supers = match.group(2)
                        digits = "".join(super_map[c] for c in supers)
                        return f"${base}^{{{digits}}}$"
                    part = re.sub(r'([a-zA-Z\d]+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)', repl_num_super_text, part)
                    
                    def repl_standalone_super_text(match):
                        supers = match.group(0)
                        digits = "".join(super_map[c] for c in supers)
                        return f"$^{{{digits}}}$"
                    part = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+', repl_standalone_super_text, part)
                    
                    # Fix \< and \> sequences generated from md converter
                    # Fix \< followed by = or space (less than or equal)
                    part = re.sub(r'\\<\s*=', r'$\\leq$', part)
                    # Fix \< (less than)
                    part = part.replace('\\<', '$<$')
                    # Fix \> followed by = (greater than or equal) 
                    part = re.sub(r'\\>\s*=', r'$\\geq$', part)
                    # Fix \> followed by > (much greater)
                    part = part.replace('\\>\\>', '$\\gg$')
                    # Fix standalone \> (greater than) - but not inside \texttt{} etc
                    part = re.sub(r'\\>(?!\s*\{)', '$>$', part)
                    
                    # Replace ^ with \textasciicircum{} in text mode
                    part = part.replace('^', '\\textasciicircum{}')
                
                new_parts.append(part)
            
            line = '$'.join(new_parts)
            line = line.replace('__ESCAPED_DOLLAR__', '\\$')
            
            # Fix & in section/subsection titles
            line = re.sub(r'(\\(?:section|subsection|subsubsection)\{[^}]*?)&([^}]*?\})', 
                         r'\1\\&\2', line)
            # Fix & in \caption{}
            line = re.sub(r'(\\caption\{[^}]*?)(?<!\\)&([^}]*?\})',
                         r'\1\\&\2', line)
            
            # Fix — (em dash) that might cause issues
            line = line.replace('—', '---')
            
            # Fix non-breaking space (U+00A0) 
            line = line.replace('\u00a0', ' ')
            
        fixed_lines.append(line)
    
    content = '\n'.join(fixed_lines)
    
    # 4. Inside verbatim blocks, replace non-breaking spaces with regular spaces
    # and remove any LaTeX commands that shouldn't be there
    lines = content.split('\n')
    in_verbatim = False
    fixed_lines = []
    for line in lines:
        if r'\begin{verbatim}' in line:
            in_verbatim = True
            fixed_lines.append(line)
            continue
        if r'\end{verbatim}' in line:
            in_verbatim = False
            fixed_lines.append(line)
            continue
        if in_verbatim:
            # Replace non-breaking space with regular space
            line = line.replace('\u00a0', ' ')
            # Replace raw Unicode operators and symbols with ASCII in verbatim
            line = line.replace('≤', '<=')
            line = line.replace('≥', '>=')
            line = line.replace('Δ', 'delta')
            line = line.replace('×', ' x ')
            line = line.replace('−', '-')
            line = line.replace('≈', '~=')
            line = line.replace('→', '->')
            line = line.replace('←', '<-')
            
            # Replace $\times$ back to × or x in verbatim
            line = line.replace('$\\times$', ' x ')
            # Replace $\rightarrow$ back to -> in verbatim
            line = line.replace('$\\rightarrow$', '->')
            line = line.replace('$\\leftarrow$', '<-')
            line = line.replace('$\\downarrow$', 'v')
            line = line.replace('$\\leq$', '<=')
            line = line.replace('$\\geq$', '>=')
            line = line.replace('$>$', '>')
            line = line.replace('$<$', '<')
            line = line.replace('$\\Delta$', 'delta')
            # Remove \textbf, \textit, \texttt wrappers in verbatim
            line = re.sub(r'\\textbf\{([^}]*)\}', r'\1', line)
            line = re.sub(r'\\textit\{([^}]*)\}', r'\1', line)
            line = re.sub(r'\\texttt\{([^}]*)\}', r'\1', line)
            # Fix escaped underscores back to regular in verbatim
            line = line.replace('\\_', '_')
            # Fix escaped percent
            line = line.replace('\\%', '%')
            # Fix \[...\] back to [...] in verbatim
            line = re.sub(r'\\\[', '[', line)
            line = re.sub(r'\\\]', ']', line)
            # Fix \textasciicircum{} back to ^ in verbatim
            line = line.replace('\\textasciicircum{}', '^')
        
        fixed_lines.append(line)
    
    content = '\n'.join(fixed_lines)
    
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

# Process all chapter files
for f in sorted(glob.glob(os.path.join(CHUONG, '*.tex'))):
    changed = fix_file(f)
    name = os.path.basename(f)
    print(f"{'FIXED' if changed else 'OK   '} {name}")

print("\nDone!")

import subprocess
print("\n=== Running pdflatex (Pass 1) ===")
subprocess.run(['pdflatex', '-interaction=nonstopmode', 'DoAn.tex'])
print("\n=== Running bibtex ===")
subprocess.run(['bibtex', 'DoAn'])
print("\n=== Running pdflatex (Pass 2) ===")
subprocess.run(['pdflatex', '-interaction=nonstopmode', 'DoAn.tex'])
print("\n=== Running pdflatex (Pass 3) ===")
subprocess.run(['pdflatex', '-interaction=nonstopmode', 'DoAn.tex'])
print("\n=== Done! ===")
