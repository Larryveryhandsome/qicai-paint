"""
暴力掃 colortell.com 的 callbook=a1...a40 與 b1...b30 與 c1...c30,
從每頁 <title> 識別品牌名。
"""
import sys
import time
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

OUT = Path(__file__).parent.parent / "data" / "raw" / "callbook_map.txt"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
}


def probe(cb: str) -> tuple[str | None, int]:
    """回傳 (title, color_count)。404/錯誤回 None。"""
    url = f"https://www.colortell.com/colorbook/?callbook={cb}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            return None, 0
        r.encoding = r.apparent_encoding
        html = r.text
        soup = BeautifulSoup(html, "lxml")
        title = soup.title.string if soup.title else ""
        # 數一下 panel-heading 的數量
        count = len(soup.find_all(class_="panel-heading"))
        # 去掉「ColorTell色彩管理」尾巴
        title = re.sub(r"\s*-\s*ColorTell.*$", "", title or "").strip()
        return title, count
    except Exception as e:
        return f"ERR: {e}", 0


def main():
    results = []
    # 掃 a1 ~ a40
    prefixes = ["a", "b", "c"]
    for prefix in prefixes:
        for i in range(1, 41):
            cb = f"{prefix}{i}"
            title, count = probe(cb)
            line = f"{cb:>5}  {count:>5} colors  title={title!r}"
            print(line)
            results.append(line)
            time.sleep(1.2)  # 節流

    OUT.write_text("\n".join(results), encoding="utf-8")
    print(f"\n寫入 {OUT}")


if __name__ == "__main__":
    main()
