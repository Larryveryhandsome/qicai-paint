"""
從 rainbow_explore_3LE.html 找出色號資料的存放方式。
4444 個 hex 一定藏在某個 inline script 的 JSON 或 JS 變數裡。
"""
import sys
import re
import json
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

RAW = Path(__file__).parent.parent / "data" / "raw"
html = (RAW / "rainbow_explore_3LE.html").read_text(encoding="utf-8")

# 1. 找所有含 hex 的 JSON 物件樣式 {"...hex...":"#xxxxxx"...}
# 先抓一個 hex 附近 200 字
idx = html.find('#', html.find('background'))
m = re.search(r'#[0-9A-Fa-f]{6}', html)
if m:
    s = max(0, m.start() - 150)
    print("=== 第一個 hex 附近 300 字 ===")
    print(repr(html[s:m.start()+150]))

# 2. 找像 color 物件陣列的 JSON: 含 id / hex / name / code
# 嘗試抓 [{...hex...}] 結構
print("\n=== 搜尋 JSON 陣列 (含 hex 的物件) ===")
# 找 "hex":"#xxxxxx" 的 key 命名
for key_pat in [r'"hex"\s*:', r'hex\s*:\s*"', r'"value"\s*:', r'"code"\s*:', r'"name"\s*:', r'"id"\s*:']:
    cnt = len(re.findall(key_pat, html))
    if cnt:
        print(f"  pattern {key_pat!r}: {cnt} 次")

# 3. 找物件: 抓一個 {...} 含 hex 的完整片段
obj_matches = re.findall(r'\{[^{}]*?#[0-9A-Fa-f]{6}[^{}]*?\}', html)
print(f"\n含 hex 的 {{...}} 物件數: {len(obj_matches)}")
for o in obj_matches[:5]:
    print(f"  {o[:200]}")

# 4. 找 <script> 區塊中最大的那個 (通常含資料)
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.S)
print(f"\ninline <script> 數: {len(scripts)}")
scripts_sorted = sorted(enumerate(scripts), key=lambda x: -len(x[1]))
for i, (orig_idx, s) in enumerate(scripts_sorted[:3]):
    print(f"\n--- 最大 script #{i} (原序 {orig_idx}, 長 {len(s)}) 前 400 字 ---")
    print(s[:400])
    # 該 script 裡 hex 數
    print(f"   (此 script 含 {len(re.findall(r'#[0-9A-Fa-f]{6}', s))} 個 hex)")

# 5. 找 data-* 屬性帶 json
data_json = re.findall(r'data-[a-z]+=\'(\[.*?\])\'', html, re.S)
print(f"\ndata-* 帶 JSON 陣列: {len(data_json)}")
for d in data_json[:2]:
    print(f"  {d[:300]}")
