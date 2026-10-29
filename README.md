# 漆彩 — 油漆色號與近似色查詢工具

業主、承包商的色彩溝通工具。輸入漆彩色號(如 `QC-025`)、色名(如「米白」)或 HEX,即可查到色庫中的近似顏色,並顯示 RGB / CMYK 數值,方便跟油漆行溝通、請師傅調色。

**線上試用:** <https://larryveryhandsome.github.io/qicai-paint/>

## 色庫是自行整理的(重要說明)

- 色庫共 152 色、12 個色系,**全部由本專案自行整理**:通用色名(例如「米白」「霧藍」)+ 我們自己訂的近似 HEX + 自編色號 `QC-001` ~ `QC-152`。
- **不含任何油漆廠牌、色票公司的名稱、色號或色名**,也沒有爬取或改寫別人的資料。
- HEX 只是近似值,**不代表任何廠商色卡**。實際調色請以油漆行現場色卡與小範圍試刷為準。
- 想擴充:編輯 [`tools/build_palette.py`](tools/build_palette.py) 的 `PALETTE`,在對應色系最後加一行 `(色名, HEX)`,重新產生 `colors.json`。**只往後加、不要插隊或刪除**,避免收藏的編號對到別的顏色。

## 快速啟動(本機)

```bash
# 啟動本機伺服器
python -m http.server 8766

# 瀏覽器開啟 http://localhost:8766
```

不需要任何後端 — 完全是靜態 HTML + JS + JSON。

## 跑測試

```bash
npm test        # 等同 node --test,需要 Node 18 以上;有裝 Python 時會多驗證色庫產生器
```

測試內容:色庫格式與唯一性、HEX/RGB/LAB 一致、CIEDE2000 對照標準答案、查詢排序、XSS 防護、出貨檔案不得出現第三方品牌名稱。

## 需要哪些金鑰?

不需要。網站沒有後端,不呼叫任何需要 API key / token 的服務(「附近油漆行」使用 Google 地圖公開嵌入,免金鑰)。

## 專案結構

```
漆彩/
├── index.html              # 主頁
├── styles.css              # 樣式 (黑白極簡)
├── script.js               # 邏輯 (CIEDE2000 色差比對)
├── colors.json             # 自整色庫 (152 色,由 build_palette.py 產生)
├── 形象/漆彩LOGO.png        # 標誌
├── tools/build_palette.py  # 色庫產生器 (python tools/build_palette.py [--check])
└── tests/qicai.test.js     # 單元測試
```

## 核心演算法

色差比對採用 **CIEDE2000**,門檻 ΔE ≤ 10(一般使用者可接受的相似色)。
比對在 LAB 色彩空間進行(因為 LAB 對人眼感知最準確)。

- ΔE < 1:人眼無法察覺
- ΔE < 2:專業人士才能察覺
- ΔE < 10:可作為替代色推薦

若色庫中找不到 ΔE 10 以內的顏色,會改列「最接近的 6 色」並註明僅供參考。

實作位於 [`script.js`](script.js) 的 `ciede2000()` 與 `findSimilarColors()`。

## 已知限制

- **手機螢幕顯示色 ≠ 實際油漆色**:RGB ↔ CMYK 顏色空間天生有差異,且油漆色受光源、底材、批次影響。網站結果僅供溝通與初步篩選,實際以實體色卡為準。
- **色庫規模小**:152 色是常用通用色,不是完整色卡;不能用來對照特定廠牌的色號。
- **舊版收藏/查詢紀錄失效**:舊版以廠牌色號存在瀏覽器裡的收藏,換成自整色庫後對不到色,可到「最近查詢」清除。

## 授權與資料

程式碼與色庫採 [Apache-2.0](LICENSE) 授權,可以免費使用、修改、商用;轉散布時請保留 LICENSE 與 [NOTICE](NOTICE)(含作者與客製化聯絡資訊)。色庫為自行整理,不含第三方資料,原則上不提供任何準確度保證。

注意:git 歷史中仍保有舊版(含廠牌色號資料與爬蟲腳本)的紀錄,現有檔案已全部移除。

## 🛠️ 需要客製化?

這個工具是開源的,可以免費使用。如果你想要:
- 改成符合你們公司的流程、欄位或品牌
- 串接你現在在用的系統(LINE、Google 表單、POS、會計軟體……)
- 幫你安裝、架站、教學,或長期維護

歡迎加 LINE 跟我們聊。我們會依需求的範圍與複雜度報價,原則上以實際報價單為準。

<a href="https://line.me/ti/p/xzHT2IywOM"><img src="https://scdn.line-apps.com/n/line_add_friends/btn/zh-Hant.png" alt="加入好友" height="36"></a>

- 💬 LINE：[林其衞](https://line.me/ti/p/xzHT2IywOM)(請註明「漆彩 客製化」)
- 🏢 留白事務所:網頁設計、AI 自動化、房仲遠端助理
- 👤 作者：[留白事務所](https://github.com/Larryveryhandsome)
