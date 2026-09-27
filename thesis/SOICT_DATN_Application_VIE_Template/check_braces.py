import glob
import os

def check_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    clean_lines = []
    in_verbatim = False
    for line in lines:
        if r'\begin{verbatim}' in line:
            in_verbatim = True
            clean_lines.append("")
            continue
        if r'\end{verbatim}' in line:
            in_verbatim = False
            clean_lines.append("")
            continue
        if in_verbatim:
            clean_lines.append("")
            continue
            
        # Strip comments
        comment_start = -1
        for i in range(len(line)):
            if line[i] == '%' and (i == 0 or line[i-1] != '\\'):
                comment_start = i
                break
        if comment_start != -1:
            line = line[:comment_start]
        clean_lines.append(line)
        
    clean_content = "\n".join(clean_lines)
    
    stack = []
    errors = False
    for idx, char in enumerate(clean_content):
        if char == '{':
            stack.append(idx)
        elif char == '}':
            if not stack:
                line_no = clean_content[:idx].count('\n') + 1
                col = idx - clean_content[:idx].rfind('\n')
                print(f"  [ERROR] Extra closed brace '}}' at line {line_no}, col {col}")
                errors = True
            else:
                stack.pop()
                
    while stack:
        open_idx = stack.pop()
        line_no = clean_content[:open_idx].count('\n') + 1
        col = open_idx - clean_content[:open_idx].rfind('\n')
        snippet = clean_content[open_idx:open_idx+50].replace('\n', ' ')
        print(f"  [ERROR] Unclosed open brace '{{' at line {line_no}, col {col}: {snippet}")
        errors = True
    return errors

for f in sorted(glob.glob('Chuong/*.tex')):
    print(f"Checking {f}...")
    check_file(f)
