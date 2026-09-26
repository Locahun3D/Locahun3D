# -*- coding: utf-8 -*-
"""perf-edge-lod.mjs の画面から「端」と「中央」の精細さ（ラプラシアンの分散）を出す（2026-09-26）。
  python scripts/edge-sharpness.py <label> [<label> ...]
値が大きいほど細かい。端/中央 の比が1に近いほど、端まで同じ精細さで読めている。
上下はUI（ボタン類）が重なるので、縦は中央 60% だけを見る。"""
import sys, glob, os, json
from PIL import Image, ImageFilter, ImageStat
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "perf-results")
def sharp(im):
    g = im.convert("L").filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(g).var[0]
for label in sys.argv[1:]:
    rows = []
    for f in sorted(glob.glob(os.path.join(root, f"edge-{label}-*.png"))):
        im = Image.open(f); W, H = im.size; y0, y1 = int(H*0.2), int(H*0.8)
        L = sharp(im.crop((0, y0, int(W*0.15), y1))); R = sharp(im.crop((int(W*0.85), y0, W, y1)))
        C = sharp(im.crop((int(W*0.35), y0, int(W*0.65), y1)))
        rows.append((os.path.basename(f), L, C, R))
    meta = json.load(open(os.path.join(root, f"edge-{label}.json"), encoding="utf-8"))
    print(f"== {label}")
    for (name, L, C, R), s in zip(rows, meta["shots"]):
        print(f"  {name}: 左 {L:7.1f}  中央 {C:7.1f}  右 {R:7.1f}  端/中央 {((L+R)/2)/max(C,1e-6):.2f}  splats {s['n']}  収束 {s['ms']}ms  最低fps {s['minFps']}")
    avg = lambda k: sum(r[k] for r in rows)/len(rows)
    print(f"  平均 端/中央 {((avg(1)+avg(3))/2)/avg(2):.2f}")
