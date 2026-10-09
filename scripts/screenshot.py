#!/usr/bin/env python3
"""Headless-Chrome screenshot helper used to verify the deck and the 3D scene.

usage: python3 scripts/screenshot.py URL OUT.png [--size 1920x1080] [--wait MS]
"""
import argparse, subprocess, sys, tempfile, os

HERE = os.path.dirname(os.path.abspath(__file__))
# Prefer the clean headless shell Remotion downloads (no enterprise extensions / updater); fall back to Chrome.app.
SHELL = os.path.join(HERE, "..", "node_modules", ".remotion", "chrome-headless-shell", "mac-arm64",
                     "chrome-headless-shell-mac-arm64", "chrome-headless-shell")
CHROME = SHELL if os.path.exists(SHELL) else "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

ap = argparse.ArgumentParser()
ap.add_argument("url"); ap.add_argument("out")
ap.add_argument("--size", default="1920x1080")
ap.add_argument("--wait", type=int, default=8000, help="virtual time budget in ms")
a = ap.parse_args()
with tempfile.TemporaryDirectory(prefix="shot-", dir=os.environ.get("TMPDIR_SHOT")) as prof:
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
           "--no-first-run", "--hide-scrollbars", f"--user-data-dir={prof}", f"--window-size={a.size.replace('x', ',')}",
           f"--virtual-time-budget={a.wait}", "--autoplay-policy=no-user-gesture-required",
           f"--screenshot={a.out}", a.url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=max(60, a.wait / 1000 + 45))
    except subprocess.TimeoutExpired:
        print("timeout", file=sys.stderr); sys.exit(2)
    ok = os.path.exists(a.out)
    print(("wrote " if ok else "FAILED ") + a.out)
    if not ok:
        print(r.stderr[-2000:], file=sys.stderr); sys.exit(1)
