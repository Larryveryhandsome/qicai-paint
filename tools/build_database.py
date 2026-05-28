"""
把 data/raw/colortell_*.json 整合成:
  - colors.json (schema 2.0,含 LAB 與 CMYK,給網站直接用)
  - brands.json (廠牌清單,供 select 與 about 區塊動態載入)

並套用 BRAND_OVERRIDES 中文化品牌名 (callbook 對應中文/英文名)。
"""
import json
import math
import re
from datetime import date
from pathlib import Path
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).parent.parent
RAW = ROOT / "data" / "raw"
COLORS_OUT = ROOT / "colors.json"
BRANDS_OUT = ROOT / "brands.json"

# 自訂 callbook → 顯示用品牌資訊
# 來源:tools/fast_discover.py 探測結果
BRAND_OVERRIDES = {
    "a1": {"id": "munsell",            "name": "Munsell 色票",        "name_en": "Munsell",                  "category": "standard",  "official_url": "https://munsell.com"},
    "a2": {"id": "pantone_fhi_cotton", "name": "PANTONE 時尚棉布",     "name_en": "PANTONE FHI Cotton TCX",   "category": "standard",  "official_url": "https://www.pantone.com"},
    "a3": {"id": "pantone_fhi_paper",  "name": "PANTONE 時尚紙",       "name_en": "PANTONE FHI Paper TCX",    "category": "standard",  "official_url": "https://www.pantone.com"},
    "a4": {"id": "pantone_fhi_tpx",    "name": "PANTONE TPX 紙",       "name_en": "PANTONE FHI Paper TPX",    "category": "standard",  "official_url": "https://www.pantone.com"},
    "a5": {"id": "cncscolor",          "name": "CNCS 中國色彩體系",     "name_en": "CNCSCOLOR (Coloro)",       "category": "standard",  "official_url": ""},
    "a6": {"id": "dulux",              "name": "得利 Dulux",            "name_en": "Dulux",                    "category": "paint",     "official_url": "https://www.dulux.com.tw"},
    "a7": {"id": "dulux_matte",        "name": "得利 啞光系列",          "name_en": "Dulux Matte",              "category": "paint",     "official_url": "https://www.dulux.com.tw"},
    "a8": {"id": "cbcc",               "name": "中國建築色卡 CBCC",     "name_en": "China Building Color Card","category": "standard",  "official_url": ""},
    "a9": {"id": "nippon",             "name": "立邦 Nippon",           "name_en": "Nippon Paint",             "category": "paint",     "official_url": "https://www.nipponpaint.com.tw"},
    "rainbow": {"id": "rainbow",       "name": "虹牌",                  "name_en": "Rainbow Paint",            "category": "paint",     "official_url": "https://www.rainbow-house.com.tw"},
}


def rgb_to_lab(rgb):
    """精確的 sRGB → LAB (D65),避免 script.js 那個簡化版的誤差。"""
    r, g, b = [v / 255.0 for v in rgb]
    # sRGB gamma
    def gc(c):
        return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    r, g, b = gc(r), gc(g), gc(b)
    # sRGB → XYZ (D65)
    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041
    # Reference white D65
    xn, yn, zn = 0.95047, 1.00000, 1.08883
    fx = (x / xn) ** (1 / 3) if x / xn > 0.008856 else (7.787 * (x / xn) + 16 / 116)
    fy = (y / yn) ** (1 / 3) if y / yn > 0.008856 else (7.787 * (y / yn) + 16 / 116)
    fz = (z / zn) ** (1 / 3) if z / zn > 0.008856 else (7.787 * (z / zn) + 16 / 116)
    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b_ = 200 * (fy - fz)
    return [round(L, 2), round(a, 2), round(b_, 2)]


def rgb_to_cmyk(rgb):
    r, g, b = [v / 255.0 for v in rgb]
    k = 1 - max(r, g, b)
    if k >= 1 - 1e-9:
        return [0, 0, 0, 100]
    c = (1 - r - k) / (1 - k)
    m = (1 - g - k) / (1 - k)
    y = (1 - b - k) / (1 - k)
    return [round(c * 100), round(m * 100), round(y * 100), round(k * 100)]


def slug(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^a-z0-9_\-]", "", s)
    return s or "unknown"


def collect():
    # colortell 各 callbook + 虹牌官方 (rainbow_colors.json)
    files = sorted(RAW.glob("colortell_a*.json")) + sorted(RAW.glob("*_colors.json"))
    print(f"找到 {len(files)} 個 raw 檔")

    all_colors = []
    brands = {}  # id → {name, name_en, count, source, official_url}

    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  讀檔失敗 {f.name}: {e}")
            continue

        cb = data.get("callbook", "")
        brand_name_raw = data.get("brand_name", "") or f.stem.replace("colortell_", "")
        override = BRAND_OVERRIDES.get(cb, {})
        brand_id = override.get("id", slug(brand_name_raw))
        brand_display = override.get("name", brand_name_raw)
        brand_en = override.get("name_en", brand_name_raw if brand_name_raw != brand_display else "")

        if brand_id not in brands:
            brands[brand_id] = {
                "id": brand_id,
                "name": brand_display,
                "name_en": brand_en,
                "category": override.get("category", "other"),
                "source": "colortell.com",
                "callbook": cb,
                "official_url": override.get("official_url", ""),
                "count": 0,
            }

        for c in data.get("colors", []):
            rgb = c.get("rgb") or []
            if len(rgb) != 3:
                continue
            color = {
                "brand": brand_display,
                "brand_id": brand_id,
                "code": c.get("code", "").strip(),
                "name": c.get("name", ""),
                "hex": c.get("hex", "").upper(),
                "rgb": rgb,
                "lab": rgb_to_lab(rgb),
                "cmyk": rgb_to_cmyk(rgb),
                "source": "colortell.com",
                "source_url": data.get("url", ""),
            }
            all_colors.append(color)
            brands[brand_id]["count"] += 1

    return all_colors, list(brands.values())


def main():
    colors, brands = collect()
    print(f"\n總色號:{len(colors)} 筆,廠牌:{len(brands)} 個")
    for b in brands:
        print(f"  {b['id']:20s} {b['name']:30s} {b['count']:>5} 色")

    # 精簡:每筆色號剔除冗餘欄位,source 統一寫在 schema 層級
    slim_colors = [{
        "brand_id": c["brand_id"],
        "code": c["code"],
        "name": c["name"],
        "hex": c["hex"],
        "rgb": c["rgb"],
        "lab": c["lab"],
        "cmyk": c["cmyk"],
    } for c in colors]

    payload = {
        "schema_version": "2.0",
        "updated_at": date.today().isoformat(),
        "source": "colortell.com",
        "color_count": len(slim_colors),
        "colors": slim_colors,
    }
    # minify (separators 移除空白) — 給瀏覽器用
    COLORS_OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    BRANDS_OUT.write_text(json.dumps(brands, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n寫入 {COLORS_OUT.relative_to(ROOT)} ({COLORS_OUT.stat().st_size // 1024} KB)")
    print(f"寫入 {BRANDS_OUT.relative_to(ROOT)} ({BRANDS_OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
