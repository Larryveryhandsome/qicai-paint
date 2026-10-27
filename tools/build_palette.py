"""漆彩自整色庫產生器：把下面的 PALETTE 清單轉成 colors.json。

資料來源：本專案自行整理。色名是中文常見的通用色名，HEX 是我們自己訂的近似值，
編號 QC-001… 也是自編。沒有引用、改寫或對照任何油漆廠商、色票公司的色號、色名或色卡。
實際調色請以油漆行現場色卡與試刷為準。

用法：python tools/build_palette.py      （產生 colors.json）
     python tools/build_palette.py --check（只檢查，不寫檔；有問題回傳非 0）

要新增顏色：在 PALETTE 對應色系最後加一行 (色名, HEX)，重跑本程式。
編號依清單順序產生，所以**只往後加、不要插隊或刪除**，避免使用者收藏的編號對到別的顏色。
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (色系, [(色名, HEX), ...])；HEX 為本專案自訂近似值
PALETTE = [
    ('白色系', [
        ('純白', '#FFFFFF'), ('雪白', '#FBFBF8'), ('乳白', '#F7F4EA'), ('象牙白', '#F4EEDC'),
        ('米白', '#EFE8D6'), ('奶油白', '#F6EFD9'), ('珍珠白', '#EEEBE3'), ('冷白', '#F1F4F6'),
        ('暖白', '#F8F2E6'), ('蛋殼白', '#F1EBD8'), ('瓷白', '#EDEFEE'), ('霧白', '#E9E8E4'),
    ]),
    ('灰黑色系', [
        ('淺灰', '#D6D6D3'), ('銀灰', '#C2C4C6'), ('霧灰', '#B5B4AF'), ('水泥灰', '#A3A29C'),
        ('中灰', '#8E8E8B'), ('暖灰', '#9E968C'), ('冷灰', '#8D949A'), ('石板灰', '#6E747A'),
        ('深灰', '#5A5A58'), ('鐵灰', '#4A4D50'), ('碳灰', '#3B3B3A'), ('墨黑', '#252525'),
        ('純黑', '#111111'), ('灰藍', '#7D8A96'), ('灰綠', '#8C9688'), ('大象灰', '#7F7A74'),
    ]),
    ('米杏膚色系', [
        ('杏仁色', '#EADCC4'), ('奶茶色', '#D8C2A6'), ('燕麥色', '#DDD0B8'), ('亞麻色', '#E2D6BE'),
        ('沙色', '#D9C7A3'), ('駝色', '#C4A57E'), ('卡其色', '#BBA77F'), ('膚色', '#F0D5BE'),
        ('裸粉膚', '#E7C3AE'), ('奶咖色', '#C9AE92'), ('拿鐵色', '#BC9E80'), ('米灰', '#D3CBBD'),
    ]),
    ('黃色系', [
        ('淡黃', '#FAF0BE'), ('鵝黃', '#F7E38A'), ('奶油黃', '#F5E2A4'), ('檸檬黃', '#F4E04D'),
        ('明黃', '#F6CE2E'), ('向日葵黃', '#F2B92C'), ('芥末黃', '#D2A93A'), ('土黃', '#C49A45'),
        ('金黃', '#E6AE1F'), ('稻草黃', '#E3CD86'), ('香蕉黃', '#F3DC6B'), ('蜂蜜色', '#D9A441'),
    ]),
    ('橙色系', [
        ('杏橘', '#F6C08F'), ('蜜桃橘', '#F7A982'), ('橘色', '#EE8A35'), ('柑橘', '#F29A3E'),
        ('南瓜色', '#D9772F'), ('橘紅', '#E2603A'), ('珊瑚橘', '#EE7E62'), ('焦糖色', '#B9733A'),
        ('赭橙', '#C46A32'), ('琥珀色', '#D18A2E'),
    ]),
    ('紅色系', [
        ('正紅', '#C9282D'), ('大紅', '#D2302F'), ('朱紅', '#D9472B'), ('磚紅', '#A9533E'),
        ('鐵鏽紅', '#8F3E2C'), ('酒紅', '#7A2232'), ('勃艮第紅', '#6A1F2B'), ('胭脂紅', '#B23A4E'),
        ('番茄紅', '#E2483D'), ('莓果紅', '#A42E4F'), ('紅土色', '#B4624A'), ('棗紅', '#7E2B2B'),
    ]),
    ('粉色系', [
        ('淺粉', '#F7DCDD'), ('櫻花粉', '#F5C8D0'), ('嬰兒粉', '#F4D1DA'), ('蜜桃粉', '#F6C2B2'),
        ('珊瑚粉', '#F1A396'), ('玫瑰粉', '#E58AA1'), ('乾燥玫瑰', '#C88C8E'), ('藕粉', '#D9B2B0'),
        ('桃紅', '#E05A8C'), ('芭比粉', '#E4609E'), ('灰粉', '#CDB0AE'), ('豆沙粉', '#C69A92'),
    ]),
    ('紫色系', [
        ('淡紫', '#E2D8EC'), ('薰衣草紫', '#C9B6DE'), ('丁香紫', '#BFA6CF'), ('芋頭紫', '#B7A0C4'),
        ('藕荷紫', '#B99AAE'), ('紫羅蘭', '#8E67B0'), ('葡萄紫', '#6E3B6E'), ('茄子紫', '#4E2A47'),
        ('灰紫', '#9C93A5'), ('梅紫', '#8C4B6E'),
    ]),
    ('藍色系', [
        ('冰藍', '#DDEBF3'), ('淺藍', '#C6DDEE'), ('嬰兒藍', '#B9D6EC'), ('天藍', '#8EC3E6'),
        ('晴空藍', '#6BAED8'), ('湖水藍', '#5AA3C2'), ('海藍', '#2F78AE'), ('寶藍', '#1F55A8'),
        ('鈷藍', '#2A4E9C'), ('丹寧藍', '#4A6F96'), ('霧藍', '#9AAFC2'), ('灰藍石', '#6F8499'),
        ('海軍藍', '#26344F'), ('午夜藍', '#1C2538'), ('藏青', '#24304A'), ('靛藍', '#334B7D'),
    ]),
    ('青綠色系', [
        ('薄荷綠', '#C8E8D8'), ('淺湖綠', '#B6DDD6'), ('蒂芬尼綠', '#7FCDC4'), ('青瓷色', '#A9CBBE'),
        ('松石綠', '#4FB3B0'), ('孔雀綠', '#1F7F80'), ('水鴨綠', '#2F6C72'), ('碧綠', '#3C9A86'),
        ('青灰', '#8EA6A4'), ('深青', '#244E54'),
    ]),
    ('綠色系', [
        ('嫩綠', '#CFE6A8'), ('蘋果綠', '#A9D46F'), ('草綠', '#7DB54A'), ('葉綠', '#5C9A3D'),
        ('抹茶綠', '#A4B26C'), ('橄欖綠', '#7C7A3A'), ('苔蘚綠', '#6A7444'), ('鼠尾草綠', '#A3B09A'),
        ('尤加利綠', '#8FA79A'), ('森林綠', '#2E5A3A'), ('墨綠', '#23392D'), ('軍綠', '#55573B'),
        ('翡翠綠', '#2E8B63'), ('竹綠', '#6E9B5E'), ('灰豆綠', '#B4BBA2'), ('酪梨綠', '#6E7F3B'),
    ]),
    ('大地棕色系', [
        ('淺木色', '#D8B98E'), ('原木色', '#C29A6B'), ('柚木色', '#A87A4D'), ('胡桃木色', '#7A5236'),
        ('咖啡色', '#6B4A33'), ('巧克力色', '#4E3426'), ('深咖啡', '#3B2A20'), ('栗子色', '#7B4A30'),
        ('紅木色', '#7F3F2E'), ('赭石色', '#A0643A'), ('陶土色', '#B9734F'), ('可可色', '#8A6A55'),
        ('摩卡色', '#937562'), ('焦茶色', '#5A3E2E'),
    ]),
]

HEX_RE = re.compile(r'^#[0-9A-F]{6}$')


def hex_to_rgb(h):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def rgb_to_lab(rgb):
    """sRGB → CIELAB (D65)，與 script.js 的 rgbToLab 同一套公式，四捨五入到小數兩位。"""
    def gc(c):
        c = c / 255
        return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    r, g, b = (gc(v) for v in rgb)
    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x / 0.95047), f(y / 1.0), f(z / 1.08883)
    return [round(116 * fy - 16, 2), round(500 * (fx - fy), 2), round(200 * (fy - fz), 2)]


def rgb_to_cmyk(rgb):
    r, g, b = (v / 255 for v in rgb)
    k = 1 - max(r, g, b)
    if k >= 1:
        return [0, 0, 0, 100]
    return [round((1 - v - k) / (1 - k) * 100) for v in (r, g, b)] + [round(k * 100)]


def build():
    colors, names, hexes, errors = [], set(), set(), []
    n = 0
    for group, items in PALETTE:
        for name, hx in items:
            n += 1
            hx = hx.upper()
            if not HEX_RE.match(hx):
                errors.append(f'{name}: HEX 格式錯誤 {hx}')
            if name in names:
                errors.append(f'色名重複：{name}')
            if hx in hexes:
                errors.append(f'HEX 重複：{hx}（{name}）')
            names.add(name)
            hexes.add(hx)
            rgb = hex_to_rgb(hx)
            colors.append({'code': f'QC-{n:03d}', 'name': name, 'group': group, 'hex': hx,
                           'rgb': rgb, 'lab': rgb_to_lab(rgb), 'cmyk': rgb_to_cmyk(rgb)})
    payload = {
        'schema_version': '3.0',
        'source': '漆彩自行整理（通用色名＋自訂 HEX 近似值，不代表任何廠商色卡）',
        'updated_at': date.today().isoformat(),
        'color_count': len(colors),
        'groups': [g for g, _ in PALETTE],
        'colors': colors,
    }
    return payload, errors


def main():
    payload, errors = build()
    for e in errors:
        print('錯誤：', e)
    if errors:
        sys.exit(1)
    if '--check' in sys.argv:
        print(f'檢查通過：{payload["color_count"]} 色')
        return
    out = ROOT / 'colors.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'已寫入 {out.name}：{payload["color_count"]} 色、{len(payload["groups"])} 個色系')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
