#!/usr/bin/env python3
"""
Search-Replace editor for coding agents.
Avoids line-number drift by matching on exact content.

Usage:
  sr.py <file> <search> <replace>
  sr.py <file> --apply <patch_file>

Search/Replace format in patch_file:
  <<<<<<< SEARCH
  exact content to find
  =======
  replacement content  
  >>>>>>> REPLACE
"""
import sys
import re

def apply_search_replace(filepath, search, replace):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if search not in content:
        print(f"ERROR: Search block not found in {filepath}", file=sys.stderr)
        # Show closest match hints
        lines = search.strip().split('\n')
        if lines:
            for i, line in enumerate(lines[:3]):
                if line.strip() in content:
                    print(f"  Hint: line {i+1} of search block found: '{line.strip()}'", file=sys.stderr)
        sys.exit(1)
    
    count = content.count(search)
    if count > 1:
        print(f"WARNING: Search block found {count} times. Replacing first occurrence.", file=sys.stderr)
    
    content = content.replace(search, replace, 1)
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"OK: Replaced in {filepath}")

def apply_patch_file(filepath, patch_path):
    with open(patch_path, 'r') as f:
        patch = f.read()
    
    # Parse all SEARCH/REPLACE blocks
    pattern = r'<<<<<<< SEARCH\n(.*?)=======\n(.*?)>>>>>>> REPLACE'
    matches = re.findall(pattern, patch, re.DOTALL)
    
    if not matches:
        print("ERROR: No SEARCH/REPLACE blocks found", file=sys.stderr)
        sys.exit(1)
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    applied = 0
    for search, replace in matches:
        # Strip trailing newline from search but preserve structure
        search = search.rstrip('\n')
        replace = replace.rstrip('\n')
        
        if search not in content:
            print(f"SKIP: Block not found: {search[:50]}...", file=sys.stderr)
            continue
        
        content = content.replace(search, replace, 1)
        applied += 1
    
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"OK: Applied {applied}/{len(matches)} replacements in {filepath}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)
    
    filepath = sys.argv[1]
    
    if '--apply' in sys.argv:
        patch_idx = sys.argv.index('--apply')
        patch_path = sys.argv[patch_idx + 1]
        apply_patch_file(filepath, patch_path)
    elif len(sys.argv) >= 4:
        _, _, search, replace = sys.argv
        apply_search_replace(filepath, search, replace)
    else:
        print("ERROR: Need <file> <search> <replace> or <file> --apply <patch>", file=sys.stderr)
        sys.exit(1)
