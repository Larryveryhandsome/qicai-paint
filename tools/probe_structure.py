"""
深入分析已下載的 colortell HTML 結構,並列舉所有 callbook 代號。
"""
import re
from pathlib import Path
from bs4 import BeautifulSoup

RAW = Path(__file__).parent.parent / "data" / "raw"
OUT = Path(__file__).parent.parent / "data" / "raw" / "structure_report.txt"


def analyze_dulux():
    html = (RAW / "colortell_a6_dulux.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "lxml")

    lines = []
    lines.append("=" * 70)
    lines.append("DULUX (callbook=a6) 結構分析")
    lines.append("=" * 70)

    # 看 .panel-body 結構
    panels = soup.find_all(class_="panel-body_Color_Category")
    lines.append(f"\npanel-body_Color_Category 數: {len(panels)}")

    # 找色號 card 的結構
    # 通常會包在某個容器內
    # 先看前 3 個 panel-body 的父層結構
    if panels:
        for i, p in enumerate(panels[:3]):
            parent = p.parent
            lines.append(f"\n--- panel[{i}] 父層 HTML(截前 500 字)---")
            lines.append(str(parent)[:500])

    # 找所有色號 — 用 HEX 推回去
    hex_re = re.compile(r"#[0-9A-Fa-f]{6}")
    bg_hex_re = re.compile(r'background[-]?color\s*:\s*(#[0-9A-Fa-f]{6})')

    # 直接撈所有 div 或 li 含 style 屬性的
    swatch_candidates = soup.find_all(attrs={"style": re.compile(r"background.*color", re.I)})
    lines.append(f"\n有 background-color style 的元素數: {len(swatch_candidates)}")
    if swatch_candidates:
        for elem in swatch_candidates[:5]:
            lines.append(f"  tag={elem.name}, class={elem.get('class')}, style={elem.get('style')[:80]}")
            lines.append(f"    text={elem.get_text(strip=True)[:80]}")

    # 找 .colorbox / .swatch / .item 之類的常見命名
    for cls_name in ["item", "color", "swatch", "card", "box", "list-item"]:
        elems = soup.find_all(class_=re.compile(rf"^{cls_name}", re.I))
        if elems:
            lines.append(f"\nclass^={cls_name}: 數={len(elems)}")
            lines.append(f"  範例: {str(elems[0])[:300]}")

    # 看頁面結構整體
    # 顯示主要的 div 結構(只取前 3 層)
    body = soup.body
    if body:
        lines.append("\n--- body 第一層 div class 列表 ---")
        for child in body.find_all("div", recursive=False):
            lines.append(f"  div.{' '.join(child.get('class', []))}")

    # 看看有沒有 li
    lis = soup.find_all("li")
    lines.append(f"\n<li> 數: {len(lis)}")
    if lis:
        for i in range(min(3, len(lis))):
            li_str = str(lis[i])[:300]
            lines.append(f"  li[{i}]: {li_str}")

    return lines


def analyze_index():
    """看主頁列出哪些 callbook 代號。"""
    html = (RAW / "colortell_index.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "lxml")

    lines = []
    lines.append("\n" + "=" * 70)
    lines.append("INDEX 頁面 — 找所有 callbook 連結")
    lines.append("=" * 70)

    # 找 nav / sidebar / menu
    # callbook 連結可能藏在 select / option 或 a[href*=callbook]
    all_links = soup.find_all("a", href=True)
    callbook_links = [a for a in all_links if "callbook=" in a["href"]]
    lines.append(f"\n總 <a> 連結數: {len(all_links)}")
    lines.append(f"包含 callbook= 的: {len(callbook_links)}")
    for a in callbook_links[:30]:
        lines.append(f"  {a.get_text(strip=True)} -> {a['href']}")

    # 找 <select> / <option> 含 callbook
    options = soup.find_all("option")
    lines.append(f"\n<option> 數: {len(options)}")
    callbook_opts = [o for o in options if "callbook" in (o.get("value", "") + o.get_text(""))]
    if callbook_opts:
        lines.append(f"含 callbook 的 option:")
        for o in callbook_opts[:30]:
            lines.append(f"  value={o.get('value')!r} text={o.get_text(strip=True)!r}")

    # 找 JavaScript 中的 callbook 字串
    scripts = soup.find_all("script")
    lines.append(f"\n<script> 數: {len(scripts)}")
    callbook_in_script = []
    for s in scripts:
        if s.string and "callbook" in s.string:
            # 抓 callbook=xxx 對應的字串
            for m in re.finditer(r'callbook[=:]?\s*["\']?([a-z0-9]+)["\']?', s.string, re.I):
                callbook_in_script.append(m.group(1))
    lines.append(f"script 中提到的 callbook 代號: {set(callbook_in_script)}")

    # 也可能在 HTML 屬性中
    cb_attrs = set()
    for tag in soup.find_all(True):
        for attr, val in tag.attrs.items():
            if isinstance(val, str) and "callbook=" in val:
                for m in re.finditer(r"callbook=([a-z0-9]+)", val):
                    cb_attrs.add(m.group(1))
    lines.append(f"屬性中提到的 callbook 代號: {cb_attrs}")

    # 最重要:在 raw html 用 regex 撈所有 callbook=xxx
    cb_all = set(re.findall(r"callbook=([a-z0-9]+)", html))
    lines.append(f"\nHTML 全文 callbook= 代號集合: {sorted(cb_all)}")

    # 撈每個代號對應的文字
    lines.append("\n--- 代號 → 品牌名 推測 ---")
    for cb in sorted(cb_all):
        # 看 anchor href 周圍
        for a in soup.find_all("a", href=re.compile(rf"callbook={cb}\b")):
            text = a.get_text(strip=True)
            if text:
                lines.append(f"  {cb}: {text}")
                break

    return lines


def main():
    lines = analyze_dulux() + analyze_index()
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"報告寫入: {OUT}")


if __name__ == "__main__":
    main()
