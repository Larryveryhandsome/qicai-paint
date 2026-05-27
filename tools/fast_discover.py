"""
並行版 callbook 探索 — 用 ThreadPoolExecutor,8 個 worker。
比序列版快 8 倍。輸出含品牌名與色號數量。
"""
import sys
import re
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

OUT = Path(__file__).parent.parent / "data" / "raw" / "callbook_map.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
}


def probe(cb: str) -> dict:
    url = f"https://www.colortell.com/colorbook/?callbook={cb}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            return {"callbook": cb, "ok": False, "status": r.status_code}
        r.encoding = r.apparent_encoding
        html = r.text
        soup = BeautifulSoup(html, "lxml")
        title = (soup.title.string if soup.title else "") or ""
        title = re.sub(r"\s*-\s*ColorTell.*$", "", title).strip()
        count = len(soup.find_all(class_="panel-heading", onclick=re.compile(r"show\(")))
        # 從 onclick 抽 brand name (第一個)
        brand = ""
        first = soup.find(class_="panel-heading", onclick=re.compile(r"show\("))
        if first:
            m = re.search(r"show\('[^']+','[^']+','[^']+','[^']+','([^']+)'\)", first.get("onclick", ""))
            if m:
                brand = m.group(1)
        return {"callbook": cb, "ok": True, "title": title, "brand": brand, "count": count}
    except Exception as e:
        return {"callbook": cb, "ok": False, "error": str(e)[:100]}


def main():
    # 涵蓋 a1-b30 共 60 個,並行 8 個 worker
    callbooks = [f"{p}{i}" for p in ("a", "b") for i in range(1, 31)]
    print(f"探索 {len(callbooks)} 個 callbook,8 工作者並行...", flush=True)

    results = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(probe, cb): cb for cb in callbooks}
        for fut in as_completed(futures):
            r = fut.result()
            results.append(r)
            if r.get("ok"):
                print(f"  ✓ {r['callbook']:>4}  {r.get('count', 0):>5}  {r.get('brand', ''):<25} | {r.get('title', '')[:50]}", flush=True)
            else:
                print(f"  ✗ {r['callbook']:>4}  {r.get('status', r.get('error', '?'))}", flush=True)

    results.sort(key=lambda x: x["callbook"])
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n寫入 {OUT}", flush=True)

    # 摘要:有效的 callbook
    valid = [r for r in results if r.get("ok") and r.get("count", 0) > 10]
    print(f"\n有效廠牌 ({len(valid)}):", flush=True)
    for r in valid:
        print(f"  {r['callbook']:>4}  {r['count']:>5} 色  {r['brand']}", flush=True)


if __name__ == "__main__":
    main()
