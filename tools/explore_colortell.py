"""
探索 colortell.com 的 HTML 結構,作為爬蟲設計依據。
跑完後輸出到 data/raw/colortell_探索.txt。
"""
import sys
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

OUT_DIR = Path(__file__).parent.parent / "data" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}

URLS = [
    ("dir", "https://www.colortell.com/colorbook/dir"),
    ("a6_dulux", "https://www.colortell.com/colorbook/?callbook=a6"),
    ("index", "https://www.colortell.com/colorbook/"),
]


def fetch(url: str) -> str:
    print(f"→ {url}")
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    r.encoding = r.apparent_encoding
    return r.text


def explore():
    report = []
    for label, url in URLS:
        try:
            html = fetch(url)
        except Exception as e:
            report.append(f"\n## {label} — FAILED\n{url}\nError: {e}")
            continue

        # 保存原始 HTML
        (OUT_DIR / f"colortell_{label}.html").write_text(html, encoding="utf-8")

        soup = BeautifulSoup(html, "lxml")

        report.append(f"\n## {label}\nURL: {url}")
        report.append(f"HTML 長度: {len(html)} bytes")
        report.append(f"<title>: {soup.title.string if soup.title else 'N/A'}")

        # 抓 callbook 參數
        callbook_links = soup.find_all("a", href=re.compile(r"callbook="))
        report.append(f"\ncallbook 連結數: {len(callbook_links)}")
        for a in callbook_links[:20]:
            href = a.get("href", "")
            text = a.get_text(strip=True)
            report.append(f"  {text}  →  {href}")

        # 找色號的常見容器
        tables = soup.find_all("table")
        report.append(f"\n<table> 數量: {len(tables)}")
        for i, t in enumerate(tables[:3]):
            rows = t.find_all("tr")
            report.append(f"  table[{i}] rows={len(rows)}")
            if rows:
                report.append(f"    第一列: {rows[0].get_text(' | ', strip=True)[:200]}")
                if len(rows) > 1:
                    report.append(f"    第二列: {rows[1].get_text(' | ', strip=True)[:200]}")

        # 找有 hex/rgb 字樣的元素
        hex_pattern = re.compile(r"#[0-9A-Fa-f]{6}")
        hex_matches = hex_pattern.findall(html)
        report.append(f"\n#HEX 字串總數: {len(hex_matches)}")
        if hex_matches:
            report.append(f"  前 5 個: {hex_matches[:5]}")

        # rgb(...) 模式
        rgb_pattern = re.compile(r"rgb\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)")
        rgb_matches = rgb_pattern.findall(html)
        report.append(f"rgb() 字串總數: {len(rgb_matches)}")
        if rgb_matches:
            report.append(f"  前 5 個: {rgb_matches[:5]}")

        # background-color
        bg_pattern = re.compile(r"background[-]?color\s*:\s*([^;\"']+)")
        bg_matches = bg_pattern.findall(html)
        report.append(f"background-color 樣式數: {len(bg_matches)}")
        if bg_matches:
            report.append(f"  前 5 個: {bg_matches[:5]}")

        # 嘗試找色號的 ID/class
        for cls in ["color", "colorbox", "colorcard", "list", "item", "swatch"]:
            elems = soup.find_all(class_=re.compile(cls, re.I))
            if elems:
                report.append(f'\nclass=~"{cls}" 元素數: {len(elems)}')
                report.append(f"  範例: {str(elems[0])[:200]}")

        # 抓有色號 code 結構的文字
        code_pattern = re.compile(r"\b[A-Z]{2,}[\s-]*\d+[A-Z]*[\s\-/]*\d*", re.I)
        # 太寬,跳過

        time.sleep(2)

    out_file = OUT_DIR / "colortell_探索報告.txt"
    out_file.write_text("\n".join(report), encoding="utf-8")
    print(f"\n報告寫入: {out_file}")
    print("\n" + "=" * 60)
    print("\n".join(report))


if __name__ == "__main__":
    explore()
