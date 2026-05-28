"""
探索虹牌官網「彩虹屋」rainbow-house.com.tw 的色彩資料結構。
看是靜態 HTML 還是 SPA (需找 API)。
"""
import sys
import re
import json
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
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-TW,zh;q=0.9",
}

URLS = [
    ("explore_3LE", "https://www.rainbow-house.com.tw/color-systems/explore/o/3LE"),
    ("home", "https://www.rainbow-house.com.tw/"),
]


def main():
    report = []
    for label, url in URLS:
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.encoding = r.apparent_encoding
            html = r.text
        except Exception as e:
            report.append(f"## {label} FAILED: {e}")
            continue

        (RAW / f"rainbow_{label}.html").write_text(html, encoding="utf-8")
        soup = BeautifulSoup(html, "lxml")

        report.append(f"\n## {label}  ({url})")
        report.append(f"HTTP len={len(html)}  title={soup.title.string if soup.title else 'NA'}")

        # HEX / RGB 出現次數
        hexes = re.findall(r"#[0-9A-Fa-f]{6}", html)
        report.append(f"#HEX 出現: {len(hexes)}  範例: {hexes[:8]}")
        rgbs = re.findall(r"rgb\([^)]+\)", html)
        report.append(f"rgb() 出現: {len(rgbs)}  範例: {rgbs[:5]}")

        # 找 JSON-like 資料 (SPA 常把資料塞 script)
        # 找 window.__NUXT__ / __NEXT_DATA__ / app data
        for marker in ["__NUXT__", "__NEXT_DATA__", "window.__", "colorList", "colors:", "colorData"]:
            if marker in html:
                idx = html.find(marker)
                report.append(f"  ★ 含 '{marker}' @ {idx}: {html[idx:idx+120]!r}")

        # 找 API endpoint 跡象
        apis = set(re.findall(r"['\"](/api/[^'\"]+)['\"]", html))
        if apis:
            report.append(f"  API endpoints: {sorted(apis)[:15]}")
        # 找 axios/fetch URL
        fetches = set(re.findall(r"(https?://[^\s'\"]+(?:color|api)[^\s'\"]*)", html, re.I))
        if fetches:
            report.append(f"  fetch-like URLs: {sorted(fetches)[:10]}")

        # script src
        scripts = [s.get("src") for s in soup.find_all("script", src=True)]
        report.append(f"  script src 數: {len(scripts)} 範例: {scripts[:5]}")

        # 色塊元素
        for cls in ["color", "swatch", "chip", "card", "item", "tile"]:
            els = soup.find_all(class_=re.compile(cls, re.I))
            if els:
                report.append(f"  class~{cls}: {len(els)}  e.g. {str(els[0])[:160]}")
                break

    out = RAW / "rainbow_探索.txt"
    out.write_text("\n".join(report), encoding="utf-8")
    print("\n".join(report))
    print(f"\n報告: {out}")


if __name__ == "__main__":
    main()
