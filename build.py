#!/usr/bin/env python3
"""
build.py — one-click full rebuild of metro_graph.html
  1. src/build_graph.py  → data/metro_graph.json
  2. src/build_html.py   → metro_graph.html
"""
import subprocess, sys, time, pathlib

ROOT = pathlib.Path(__file__).parent

steps = [
    ("Graph JSON", [sys.executable, str(ROOT / "src/build_graph.py")]),
    ("HTML page",  [sys.executable, str(ROOT / "src/build_html.py")]),
]

t0 = time.time()
for name, cmd in steps:
    print(f"▶  {name}...", flush=True)
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        print(f"✗  {name} failed (exit {r.returncode})")
        sys.exit(r.returncode)
    print(f"✓  {name} done")

print(f"\n✅  Build complete in {time.time()-t0:.1f}s  →  metro_graph.html")
