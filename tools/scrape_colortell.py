"""
爬 colortell.com 指定 callbook 的所有色號。

色號隱藏在 onclick 屬性裡:
    onclick="show('a6','90YR 83/053','#F2E6DE','37888','DULUX')"

→ callbook, code, hex, internal_id, brand_name
"""
import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

RAW = Path(__file__).parent.parent / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}

ONCLICK_RE = re.compile(
    r"show\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)"
)


def hex_to_rgb(hex_str: str) -> list[int]:
    h = hex_str.lstrip("#")
    if len(h) != 6:
        return [0, 0, 0]
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def scrape(callbook: str) -> dict:
    """爬一個 callbook,回傳 dict {callbook, brand_name, count, colors}。"""
    url = f"https://www.colortell.com/colorbook/?callbook={callbook}"
    print(f"→ 抓 {url}")
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    r.encoding = r.apparent_encoding
    html = r.text

    soup = BeautifulSoup(html, "lxml")
    title = soup.title.string if soup.title else ""
    title = re.sub(r"\s*-\s*ColorTell.*$", "", title or "").strip()

    panels = soup.find_all(class_="panel-heading", onclick=True)
    print(f"  panel 數: {len(panels)}")

    colors = []
    brand_name = None
    seen = set()
    for p in panels:
        onclick = p.get("onclick", "")
        m = ONCLICK_RE.search(onclick)
        if not m:
            continue
        cb, code, hex_val, internal_id, br = m.groups()
        if cb != callbook:
            # 跳過交叉引用其他 callbook 的點(理論上不該有)
            continue
        if brand_name is None:
            brand_name = br
        key = (code, hex_val)
        if key in seen:
            continue
        seen.add(key)
        hex_clean = hex_val.upper()
        if not hex_clean.startswith("#"):
            hex_clean = "#" + hex_clean
        colors.append({
            "code": code.strip(),
            "name": "",  # colortell 沒給色名
            "hex": hex_clean,
            "rgb": hex_to_rgb(hex_clean),
            "internal_id": internal_id,
            "source_callbook": cb,
        })

    return {
        "callbook": callbook,
        "brand_name": brand_name or "",
        "page_title": title,
        "count": len(colors),
        "url": url,
        "colors": colors,
    }


def main(argv: list[str]):
    if len(argv) < 2:
        print("用法: scrape_colortell.py <callbook1> [callbook2 ...]")
        print("範例: scrape_colortell.py a6 a13 b3")
        sys.exit(1)

    callbooks = argv[1:]
    for cb in callbooks:
        try:
            result = scrape(cb)
        except Exception as e:
            print(f"  ✗ {cb} 失敗: {e}")
            continue

        out_file = RAW / f"colortell_{cb}.json"
        out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ✓ {cb} ({result['brand_name']}) 寫入 {out_file.name}, count={result['count']}")
        time.sleep(2)  # 節流


if __name__ == "__main__":
    main(sys.argv)
