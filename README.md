# 漆彩 — 跨品牌油漆色號對照工具

業主、承包商的色號對照工具。輸入任何品牌的色號或 HEX,即可查到其他品牌的相近色號,並顯示 RGB / CMYK 數值,方便採購與印刷溝通。

**部署位置:** `paint.zengzhisui.com`(規劃中)
**狀態:** v2 開發中,2026 Q1 重啟

## 快速啟動(本機)

```bash
# 啟動本機伺服器
python -m http.server 8766

# 瀏覽器開啟 http://localhost:8766
```

不需要任何後端 — 完全是靜態 HTML + JS + JSON。

## 專案結構

```
漆彩/
├── index.html              # 主頁
├── styles.css              # 樣式 (黑白極簡)
├── script.js               # 邏輯 (CIEDE2000 色差比對)
├── brands.json             # 廠牌清單 (動態載入)
├── colors.json             # 色號資料庫 (15K+ 色號,2MB minified)
├── 形象/
│   └── 漆彩LOGO.png        # 品牌標誌
├── tools/                  # 爬蟲與資料建置腳本
│   ├── scrape_colortell.py # 從 colortell.com 抓某 callbook 的色號
│   ├── fast_discover.py    # 並行探測 callbook 對應品牌
│   ├── build_database.py   # 整合 raw → colors.json + brands.json
│   └── ...
├── data/raw/               # 爬蟲原始檔 (gitignore,可重建)
├── 開發規劃-2026Q1.md       # 完整開發計畫
└── .claude/launch.json     # Claude Preview 設定
```

## 資料來源與品牌

目前共 10 個色票系統、17,302 色號。來源:[colortell.com](https://www.colortell.com) 與虹牌官網「彩虹屋」[rainbow-house.com.tw](https://www.rainbow-house.com.tw)。

| 類別 | 廠牌 | 色號數 | 來源 |
|---|---|---|---|
| 油漆 | **虹牌** | 2,207 | 虹牌官網(官方資料) |
| 油漆 | 立邦 Nippon | 1,881 | colortell |
| 油漆 | 得利 Dulux | 1,654 | colortell |
| 油漆 | 得利 啞光系列 | 1,189 | colortell |
| 國際標準 | PANTONE 時尚棉布 (TCX) | 2,310 | colortell |
| 國際標準 | PANTONE 時尚紙 (TCX) | 2,310 | colortell |
| 國際標準 | PANTONE TPX 紙 | 2,100 | colortell |
| 國際標準 | Munsell 色票 | 1,625 | colortell |
| 區域標準 | CNCS 中國色彩體系 | 1,000 | colortell |
| 區域標準 | 中國建築色卡 CBCC | 1,026 | colortell |

YuXun 點名的 P0 品牌(虹牌、青葉、得利、立邦)中,**虹牌、得利、立邦已到位**。

**青葉待補:** 青葉官網([chingyehpaint.com.tw](https://www.chingyehpaint.com.tw))為 Nuxt.js 動態頁,**只有色號、沒有 RGB/HEX**。唯一有青葉 RGB 的是 U7 優漆網(競品站),不宜直接爬。建議:向青葉原廠索取色卡電子檔,或人工建檔後用「上傳自有色卡」功能匯入。

**其他可補:** TOA、Sherwin-Williams、三棵樹(後兩者 colortell/qtccolor 有,加 callbook 即可)。

## 重新爬資料

```bash
# 1. 探測 callbook 對應 (若想新增廠牌)
python tools/fast_discover.py

# 2. 爬指定 callbook
python tools/scrape_colortell.py a1 a2 a3 ...

# 3. 整合成最終 colors.json + brands.json
python tools/build_database.py
```

若新增廠牌,記得在 [`tools/build_database.py`](tools/build_database.py) 的 `BRAND_OVERRIDES` 補上中文化名稱與官網。

## 核心演算法

色差比對採用 **CIEDE2000**,門檻 ΔE ≤ 10(一般使用者可接受的相似色)。
比對在 LAB 色彩空間進行(因為 LAB 對人眼感知最準確)。

- ΔE < 1:人眼無法察覺
- ΔE < 2:專業人士才能察覺
- ΔE < 10:可作為替代色推薦

實作位於 [`script.js`](script.js) 的 `ciede2000()` 與 `findSimilarColors()`。

## 已知限制

- **手機螢幕顯示色 ≠ 實際油漆色**:RGB ↔ CMYK 顏色空間天生有差異,且油漆色受光源、底材、批次影響。網站結果僅供溝通與初步篩選,實際以實體色卡為準。
- **缺台灣本土品牌**:虹牌、青葉、TOA 還沒納入(colortell 是中國站,沒收錄這些)。Phase 2 補。
- **PANTONE 名稱為簡體中文**:colortell 來源是中國站,部分色名為簡體(如「美妙约会」)。台灣使用者可以對照色號使用,不影響功能。

## 開發路線圖

詳見 [開發規劃-2026Q1.md](開發規劃-2026Q1.md)。

**Phase 1 (MVP):** 多廠牌色號搜尋 ✅ 大致完成
**Phase 2:** 市價、附近油漆行、廣告位、收藏
**Phase 3:** 空間模擬圖、AI 拍照取色

## 授權

留白事務所有限公司內部專案。色號資料整合自 colortell.com 公開色卡資料,僅供非商業性比對參考。
