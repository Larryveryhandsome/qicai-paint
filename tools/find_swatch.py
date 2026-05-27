"""
找到色號 panel 的完整外層 container,看 HEX 顏色藏在哪。
"""
import re
from pathlib import Path
from bs4 import BeautifulSoup

RAW = Path(__file__).parent.parent / "data" / "raw"
OUT = RAW / "swatch_anatomy.txt"


def main():
    html = (RAW / "colortell_a6_dulux.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "lxml")

    # 找第一個 panel-body_Color_Category,層層往上拉,看 5 層
    panel = soup.find(class_="panel-body_Color_Category")
    lines = []

    if panel:
        node = panel
        for level in range(8):
            parent = node.parent
            if parent is None:
                break
            lines.append(f"\n========== level {level} (tag={parent.name}, class={parent.get('class')}) ==========")
            # 把這層直接子元素 (depth 1) 列出
            for i, child in enumerate(parent.children):
                if hasattr(child, "name") and child.name:
                    child_html = str(child)[:400]
                    lines.append(f"  child[{i}] <{child.name}> class={child.get('class')}")
                    lines.append(f"    {child_html}")
            node = parent

    # 也直接看 first 800 字 of the panel's grandparent
    panel2 = soup.find(class_="panel-body_Color_Category")
    if panel2:
        gp = panel2.find_parent().find_parent()
        lines.append("\n\n========== 整個 grandparent HTML(前 1500 字)==========")
        lines.append(str(gp)[:1500])

    # 找所有 style 含 background 的元素 — 上面已經查過沒有
    # 試找 data-* 屬性
    lines.append("\n\n========== 含 data-* 屬性的元素 ==========")
    for tag in soup.find_all(True, limit=2000):
        data_attrs = {k: v for k, v in tag.attrs.items() if k.startswith("data-")}
        if data_attrs:
            lines.append(f"  {tag.name} data={data_attrs}")
            if len(lines) > 50:
                break

    # 看 panel 之前的 <img> 或 <div>(色塊可能用 background-image)
    lines.append("\n\n========== panel-body 的「前一個兄弟」(可能是色塊本身)==========")
    for p in soup.find_all(class_="panel-body_Color_Category")[:3]:
        gp = p.find_parent().find_parent()  # panel-body > card
        if gp:
            # gp 的兄弟或內部 children 看
            lines.append(f"\n  Card outer: <{gp.name} class={gp.get('class')}>")
            for child in gp.children:
                if hasattr(child, "name") and child.name:
                    lines.append(f"    <{child.name}> class={child.get('class')} style={child.get('style')}")
                    if child.get("style"):
                        lines.append(f"      ★ style content: {child.get('style')}")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"報告寫入: {OUT}")


if __name__ == "__main__":
    main()
