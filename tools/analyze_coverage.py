"""
分析漆彩色庫的「夠不夠」:
1. 油漆品牌 vs 標準色票的數量分布
2. 色彩空間覆蓋密度:對均勻取樣的測試色,看能否找到相近色
   (分別測「只用油漆品牌」與「用全部色票」)

距離用 CIE76 (LAB 歐氏距離),計算快;CIEDE2000 通常給更小的值,
所以這裡的數字是「保守估計」—— 實際網站更容易找到相近色。
"""
import sys
import json
import math
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).parent.parent
colors = json.loads((ROOT / "colors.json").read_text(encoding="utf-8"))["colors"]

# 哪些 brand_id 是「實際能買到的油漆」
PAINT_BRANDS = {"rainbow", "nippon", "dulux", "dulux_matte"}

paint = [c for c in colors if c["brand_id"] in PAINT_BRANDS]
standard = [c for c in colors if c["brand_id"] not in PAINT_BRANDS]

print("=" * 60)
print("一、資料組成")
print("=" * 60)
from collections import Counter
cnt = Counter(c["brand_id"] for c in colors)
for bid, n in cnt.most_common():
    tag = "[油漆]" if bid in PAINT_BRANDS else "[標準]"
    print(f"  {tag} {bid:20s} {n:>5}")
print(f"\n  油漆品牌色: {len(paint):>6} ({len(paint)*100//len(colors)}%)")
print(f"  標準色票  : {len(standard):>6} ({len(standard)*100//len(colors)}%)")
print(f"  合計      : {len(colors):>6}")


def lab_of(c):
    return c["lab"]


def cie76(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)


def nearest(target_lab, pool_labs):
    best = 999
    for l in pool_labs:
        d = cie76(target_lab, l)
        if d < best:
            best = d
            if best < 0.5:
                break
    return best


# sRGB -> LAB (D65),跟 build_database 一致
def rgb_to_lab(rgb):
    r, g, b = [v/255.0 for v in rgb]
    def gc(c): return ((c+0.055)/1.055)**2.4 if c > 0.04045 else c/12.92
    r, g, b = gc(r), gc(g), gc(b)
    x = r*0.4124564 + g*0.3575761 + b*0.1804375
    y = r*0.2126729 + g*0.7151522 + b*0.0721750
    z = r*0.0193339 + g*0.1191920 + b*0.9503041
    xn, yn, zn = 0.95047, 1.0, 1.08883
    def f(t): return t**(1/3) if t > 0.008856 else 7.787*t + 16/116
    fx, fy, fz = f(x/xn), f(y/yn), f(z/zn)
    return [116*fy-16, 500*(fx-fy), 200*(fy-fz)]


print("\n" + "=" * 60)
print("二、色彩空間覆蓋密度測試")
print("=" * 60)
print("方法:在 RGB 立方體均勻取樣測試色,看在色庫中能找到多接近的色")
print("(ΔE<3 肉眼幾乎無差;<5 很接近;<10 可接受替代)\n")

# 均勻取樣 RGB 網格 (10x10x10 = 1000 個測試色)
test_labs = []
step = range(0, 256, 28)  # 0,28,...,252 -> 約 10 級
for r in step:
    for g in step:
        for b in step:
            test_labs.append(rgb_to_lab([r, g, b]))

paint_labs = [lab_of(c) for c in paint]
all_labs = [lab_of(c) for c in colors]

for label, pool in [("僅油漆品牌(虹/立邦/得利)", paint_labs), ("全部色票", all_labs)]:
    dists = [nearest(t, pool) for t in test_labs]
    dists.sort()
    n = len(dists)
    median = dists[n//2]
    p90 = dists[int(n*0.9)]
    worst = dists[-1]
    lt3 = sum(1 for d in dists if d < 3)*100//n
    lt5 = sum(1 for d in dists if d < 5)*100//n
    lt10 = sum(1 for d in dists if d < 10)*100//n
    print(f"  【{label}】 池大小 {len(pool)}")
    print(f"     最近鄰 ΔE 中位數={median:.1f}  90分位={p90:.1f}  最差={worst:.1f}")
    print(f"     ΔE<3: {lt3}%   ΔE<5: {lt5}%   ΔE<10: {lt10}%\n")

print("=" * 60)
print("三、常見牆面色覆蓋測試 (米白/灰/米色系 — 業主最常用)")
print("=" * 60)
wall_colors = {
    "純白": [245, 245, 242], "米白": [238, 232, 220], "暖灰": [200, 195, 188],
    "淺灰": [210, 210, 210], "奶茶色": [214, 196, 174], "莫蘭迪綠": [168, 178, 160],
    "霧藍": [176, 196, 208], "粉膚": [232, 210, 200], "深灰": [110, 110, 112],
    "燕麥": [222, 212, 196],
}
for name, rgb in wall_colors.items():
    t = rgb_to_lab(rgb)
    dp = nearest(t, paint_labs)
    print(f"  {name:8s} RGB{tuple(rgb)}  →  最近油漆色 ΔE={dp:.1f}")
