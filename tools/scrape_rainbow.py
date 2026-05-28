"""
爬虹牌官網「彩虹屋」rainbow-house.com.tw 的官方色號。

色號資料藏在 explore 頁的 `window.data = {...}` inline script,
每個色號物件格式:{"id":1311,"title":"R56-8","hex":"#CB5B52"}
title 即虹牌色號。

輸出 data/raw/rainbow_colors.json (與 colortell 相容格式)。
"""
import sys
import re
import json
import time
from pathlib import Path

import requests

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

RAW = Path(__file__).parent.parent / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-TW,zh;q=0.9",
}

# 虹牌色系入口 (o = explore)。3LE 頁的 window.data 似乎已含全色庫,
# 但保險起見多抓幾個色系入口再去重。
SYSTEM_CODES = ["3LE"]

COLOR_OBJ_RE = re.compile(r'\{"id":(\d+),"title":"([^"]+)","hex":"(#[0-9A-Fa-f]{6})"\}')


def hex_to_rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i+2], 16) for i in (0, 2, 4)]


def scrape_system(code):
    url = f"https://www.rainbow-house.com.tw/color-systems/explore/o/{code}"
    print(f"→ {url}")
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    r.encoding = r.apparent_encoding
    html = r.text

    found = COLOR_OBJ_RE.findall(html)
    print(f"  抽出 {len(found)} 個色號物件")
    return found


def main():
    seen = {}  # title → color (去重)
    for code in SYSTEM_CODES:
        try:
            objs = scrape_system(code)
        except Exception as e:
            print(f"  ✗ {code} 失敗: {e}")
            continue
        for _id, title, hex_val in objs:
            title = title.strip()
            hex_clean = hex_val.upper()
            # 以 title (色號) 為去重鍵
            if title in seen:
                continue
            seen[title] = {
                "code": title,
                "name": "",
                "hex": hex_clean,
                "rgb": hex_to_rgb(hex_clean),
                "internal_id": _id,
                "source_callbook": "rainbow",
            }
        time.sleep(1.5)

    colors = list(seen.values())
    result = {
        "callbook": "rainbow",
        "brand_name": "虹牌",
        "page_title": "虹牌油漆 彩虹屋",
        "count": len(colors),
        "url": "https://www.rainbow-house.com.tw/color-systems/explore",
        "colors": colors,
    }
    out = RAW / "rainbow_colors.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ 共 {len(colors)} 個虹牌色號 → {out.name}")
    # 看 title 前綴分布
    prefixes = {}
    for c in colors:
        p = re.match(r"^([A-Za-z]+|\d+)", c["code"])
        key = p.group(1) if p else "?"
        prefixes[key] = prefixes.get(key, 0) + 1
    print("色號前綴分布 (前 15):")
    for k, v in sorted(prefixes.items(), key=lambda x: -x[1])[:15]:
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
