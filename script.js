// 全域變數
let colorDatabase = [];
let brandsCatalog = [];       // 從 brands.json 載入
let brandsByCode = {};         // 內部 id → 顯示名
let brandCategoryById = {};    // 內部 id → category (paint / standard)
let brandPriceQueryById = {};  // 內部 id → 比價搜尋關鍵字 (僅 paint 品牌有)
let currentResults = [];
let lastQuery = null;          // 記住最近一次查詢,供切換「只看油漆」時重算
let colorsReady = false;       // colors.json 是否已載入完成
let colorsPromise = null;      // 進行中的載入 Promise (避免重複抓)

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadBrands();          // 品牌清單小,首頁就載
    setupColorsPrefetch(); // 色號大檔延遲到接近查詢時才抓
});

// 初始化應用程式
function initializeApp() {
    // 設定導航連結
    setupNavigation();
    
    // 設定標籤切換
    setupTabs();

    // 設定色碼轉換
    setupColorConversion();
}

// 設定導航連結
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            if (targetId) {
                scrollToSection(targetId);
                // 更新活動狀態 (收藏/最近 href="#" 不改變,避免亂標)
                navLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            }
            closeNav(); // 點任一項就收起手機選單
        });
    });
}

// 手機版漢堡選單開合 (桌機 .nav-toggle 隱藏)
function toggleNav() {
    const links = document.getElementById('nav-links');
    const btn = document.getElementById('nav-toggle');
    if (!links) return;
    const open = links.classList.toggle('open');
    if (btn) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? '✕' : '☰';
    }
}

function closeNav() {
    const links = document.getElementById('nav-links');
    const btn = document.getElementById('nav-toggle');
    if (links) links.classList.remove('open');
    if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = '☰';
    }
}

// 設定標籤切換
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // 更新按鈕狀態
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 更新內容顯示
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// 設定色碼轉換
function setupColorConversion() {
    const hexInput = document.getElementById('convert-hex');
    const rgbInput = document.getElementById('convert-rgb');
    const cmykInput = document.getElementById('convert-cmyk');
    const labInput = document.getElementById('convert-lab');
    
    // 設定輸入事件
    hexInput.addEventListener('input', () => convertFromHex(hexInput.value));
    rgbInput.addEventListener('input', () => convertFromRGB(rgbInput.value));
    cmykInput.addEventListener('input', () => convertFromCMYK(cmykInput.value));
    labInput.addEventListener('input', () => convertFromLAB(labInput.value));
}

// 載入 brands.json (小檔,首頁就需要 — 填下拉選單與「支援品牌」格)
async function loadBrands() {
    try {
        const brandsRes = await fetch('brands.json', { cache: 'no-cache' });
        if (!brandsRes.ok) throw new Error('brands.json HTTP ' + brandsRes.status);
        brandsCatalog = await brandsRes.json();
        brandsByCode = Object.fromEntries(brandsCatalog.map(b => [b.id, b.name]));
        brandCategoryById = Object.fromEntries(brandsCatalog.map(b => [b.id, b.category || 'other']));
        brandPriceQueryById = Object.fromEntries(brandsCatalog.filter(b => b.price_query).map(b => [b.id, b.price_query]));
        populateBrandUI();
    } catch (err) {
        console.error('載入 brands.json 失敗', err);
        showNotification('品牌清單載入失敗', 'error');
        brandsCatalog = [];
    }
}

// 延遲載入 colors.json (~512KB):首頁不需要,首次查詢或捲到查詢區才抓。
// 可重入(多次呼叫只抓一次);失敗時清掉 promise 以便重試。
function ensureColors() {
    if (colorsReady) return Promise.resolve();
    if (colorsPromise) return colorsPromise;
    colorsPromise = (async () => {
        try {
            const colorsRes = await fetch('colors.json', { cache: 'no-cache' });
            if (!colorsRes.ok) throw new Error('colors.json HTTP ' + colorsRes.status);
            const payload = await colorsRes.json();
            // 支援兩種格式: 純陣列 (舊) 或 {colors: [...]} (新 schema_version 2.0)
            colorDatabase = Array.isArray(payload) ? payload : (payload.colors || []);
            // 把 brand_id 對應回 brand 顯示名稱;若 lab/cmyk 缺漏則補上
            colorDatabase.forEach(c => {
                if (!c.brand && c.brand_id) c.brand = brandsByCode[c.brand_id] || c.brand_id;
                if (!c.category) c.category = brandCategoryById[c.brand_id] || 'other';
                if (!c.lab && c.rgb) c.lab = rgbToLab(c.rgb);
                if (!c.cmyk && c.rgb) c.cmyk = rgbToCmyk(c.rgb);
            });
            colorsReady = true;
            console.log(`已載入 ${colorDatabase.length} 筆色號資料`);
        } catch (err) {
            console.error('載入 colors.json 失敗', err);
            showNotification('色號資料載入失敗,請稍後再試', 'error');
            colorDatabase = [];
            colorsPromise = null; // 允許重試
        }
    })();
    return colorsPromise;
}

// 確保色號就緒後再執行查詢:未就緒時提示「載入中」,載完自動接續
function withColors(fn) {
    if (colorsReady) { fn(); return; }
    showNotification('色號資料載入中,完成後自動查詢…', 'info');
    ensureColors().then(() => { if (colorsReady) fn(); });
}

// 預抓:聚焦查詢輸入、或查詢區進入視窗時就先載色號,讓使用者按下查詢前通常已就緒
function setupColorsPrefetch() {
    ['brand-select', 'color-code', 'hex-input', 'rgb-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('focus', () => ensureColors(), { once: true });
    });
    const search = document.getElementById('search');
    if (search && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) { ensureColors(); io.disconnect(); }
        }, { rootMargin: '200px' });
        io.observe(search);
    } else {
        ensureColors(); // 不支援 IO 時退回直接載入
    }
}

// 將 brands.json 填入 <select> 與 about 的支援品牌格
function populateBrandUI() {
    const select = document.getElementById('brand-select');
    if (select) {
        select.innerHTML = '<option value="">請選擇品牌</option>'
            + brandsCatalog.map(b => `<option value="${b.id}">${b.name}${b.name_en ? ' ' + b.name_en : ''}</option>`).join('');
    }
    const grid = document.getElementById('brands-grid');
    if (grid) {
        grid.innerHTML = brandsCatalog.map(b =>
            `<div class="brand-item">${b.name}${b.name_en ? ' ' + b.name_en : ''}</div>`
        ).join('');
    }
}

// 滾動到指定區塊
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// 色號查詢功能 — 先在 colorDatabase 找符合 (品牌+色號) 的色號,再以它的 LAB 找相近
function searchByCode() {
    const brand = document.getElementById('brand-select').value;
    const code = document.getElementById('color-code').value.trim();

    if (!brand || !code) {
        showNotification('請選擇品牌並輸入色號', 'error');
        return;
    }

    if (!colorsReady) { withColors(searchByCode); return; }

    const brandName = getBrandName(brand);
    const codeLower = code.toLowerCase();

    // 精準命中 (品牌一致 且 色號完全相符或包含);String() 防色號為數字時崩潰
    const matches = colorDatabase.filter(color =>
        color.brand === brandName &&
        String(color.code || '').toLowerCase().includes(codeLower)
    );

    if (matches.length === 0) {
        showNotification(`在 ${brandName} 找不到色號「${code}」`, 'warning');
        displayResults([]);
        return;
    }

    // 用第一筆命中色作為查詢來源,找其他品牌的相近色
    const seed = matches[0];
    showNotification(`已找到 ${brandName} ${seed.code},正在比對其他品牌...`, 'info');
    addHistory({ kind: 'code', brand: seed.brand, brand_id: seed.brand_id, code: seed.code, hex: seed.hex, name: seed.name });
    lastQuery = { seed, showSeed: true };
    runComparison();
}

// 色碼查詢功能
function searchByColor() {
    const hex = document.getElementById('hex-input').value;
    const rgb = document.getElementById('rgb-input').value;
    
    if (!hex && !rgb) {
        showNotification('請輸入HEX或RGB色碼', 'error');
        return;
    }

    let targetColor;
    if (hex) {
        targetColor = hexToRgb(hex);
    } else if (rgb) {
        targetColor = parseRGB(rgb);
    }
    
    if (!targetColor) {
        showNotification('色碼格式錯誤', 'error');
        return;
    }

    runColorSearch(targetColor);
}

// 以 RGB 值為來源跑相近色比對 (searchByColor / 色碼轉換橋接 / 歷史重播共用)
function runColorSearch(targetColor) {
    if (!Array.isArray(targetColor) || targetColor.length < 3) {
        showNotification('色碼格式錯誤', 'error');
        return;
    }
    if (!colorsReady) { withColors(() => runColorSearch(targetColor)); return; }

    const hex = rgbToHex(targetColor);
    // 建立虛擬色號物件 (查詢色不顯示為來源卡片)
    const virtualColor = {
        brand: "查詢色",
        code: "QUERY",
        hex: hex,
        rgb: targetColor,
        lab: rgbToLab(targetColor),
        name: "查詢顏色",
        url: "#"
    };

    addHistory({ kind: 'color', brand: 'HEX 查詢', code: hex, hex: hex });
    lastQuery = { seed: virtualColor, showSeed: false };
    runComparison();
}

// 依當前「只看市售油漆」設定,跑比對並顯示 (供查詢與切換共用)
function runComparison() {
    if (!lastQuery) return;
    const paintOnly = document.getElementById('paint-only') && document.getElementById('paint-only').checked;
    const pool = paintOnly ? colorDatabase.filter(c => c.category === 'paint') : colorDatabase;
    const similar = findSimilarColors(lastQuery.seed, pool);
    const list = lastQuery.showSeed
        ? [{ ...lastQuery.seed, similarity: 0, isSeed: true }, ...similar]
        : similar;
    displayResults(list);
}

// 切換「只看市售油漆」時重新比對 (由 checkbox onchange 呼叫)
function rerenderResults() {
    if (lastQuery) runComparison();
}

// 色碼轉換功能
function convertFromHex(hex) {
    if (!hex || !isValidHex(hex)) return;
    
    const rgb = hexToRgb(hex);
    const cmyk = rgbToCmyk(rgb);
    const lab = rgbToLab(rgb);
    
    updateConversionInputs(hex, rgb, cmyk, lab);
    updateColorPreview(hex);
}

function convertFromRGB(rgbStr) {
    if (!rgbStr) return;
    
    const rgb = parseRGB(rgbStr);
    if (!rgb) return;
    
    const hex = rgbToHex(rgb);
    const cmyk = rgbToCmyk(rgb);
    const lab = rgbToLab(rgb);
    
    updateConversionInputs(hex, rgb, cmyk, lab);
    updateColorPreview(hex);
}

function convertFromCMYK(cmykStr) {
    if (!cmykStr) return;
    
    const cmyk = parseCMYK(cmykStr);
    if (!cmyk) return;
    
    const rgb = cmykToRgb(cmyk);
    const hex = rgbToHex(rgb);
    const lab = rgbToLab(rgb);
    
    updateConversionInputs(hex, rgb, cmyk, lab);
    updateColorPreview(hex);
}

function convertFromLAB(labStr) {
    if (!labStr) return;
    
    const lab = parseLAB(labStr);
    if (!lab) return;
    
    const rgb = labToRgb(lab);
    const hex = rgbToHex(rgb);
    const cmyk = rgbToCmyk(rgb);
    
    updateConversionInputs(hex, rgb, cmyk, lab);
    updateColorPreview(hex);
}

// 色彩空間轉換函數
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : null;
}

function rgbToHex(rgb) {
    return '#' + rgb.map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function rgbToCmyk(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) return [0, 0, 0, 0];
    const [r, g, b] = rgb.map(x => x / 255);
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return [0, 0, 0, 100]; // 純黑:避免除以零造成 NaN
    const c = (1 - r - k) / (1 - k);
    const m = (1 - g - k) / (1 - k);
    const y = (1 - b - k) / (1 - k);

    return [
        Math.round(c * 100),
        Math.round(m * 100),
        Math.round(y * 100),
        Math.round(k * 100)
    ];
}

function cmykToRgb(cmyk) {
    const [c, m, y, k] = cmyk.map(x => x / 100);
    const r = 255 * (1 - c) * (1 - k);
    const g = 255 * (1 - m) * (1 - k);
    const b = 255 * (1 - y) * (1 - k);
    
    return [
        Math.round(r),
        Math.round(g),
        Math.round(b)
    ];
}

// 精確 sRGB → LAB (D65) — 與 tools/build_database.py 一致,確保查詢色與色庫同一套座標。
// 舊版省略 gamma 線性化與白點正規化,深色 L 值會嚴重偏高 (例如 rgb[44,22,32] 算成 L≈39,正解約 10.7),
// 導致「依 HEX/RGB 查」與色碼轉換比對到錯的顏色。
function rgbToLab(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) return [0, 0, 0];
    const gc = c => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
    const [r, g, b] = rgb.map(v => gc(v / 255));

    // sRGB → XYZ (D65)
    const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

    // 參考白 D65
    const xn = 0.95047, yn = 1.00000, zn = 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x / xn), fy = f(y / yn), fz = f(z / zn);

    const L = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const bLab = 200 * (fy - fz);

    // 保留兩位小數,與色庫精度一致
    return [Math.round(L * 100) / 100, Math.round(a * 100) / 100, Math.round(bLab * 100) / 100];
}

// 精確 LAB → sRGB (D65),為上式的反運算 (供色碼轉換顯示)
function labToRgb(lab) {
    if (!Array.isArray(lab) || lab.length < 3) return [0, 0, 0];
    const [L, a, b] = lab;
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const finv = t => {
        const t3 = t * t * t;
        return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
    };
    const xn = 0.95047, yn = 1.00000, zn = 1.08883;
    const x = finv(fx) * xn, y = finv(fy) * yn, z = finv(fz) * zn;

    // XYZ → 線性 sRGB
    let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
    let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
    let bRgb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

    // 線性 → gamma 編碼
    const ge = c => (c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c);
    const clamp = v => Math.max(0, Math.min(255, Math.round(ge(v) * 255)));
    return [clamp(r), clamp(g), clamp(bRgb)];
}

// CIEDE2000 色差演算法 (符合 Sharma 2005 標準參考值;以度為單位運算)
// 註:舊版有兩處錯誤 — SL 用 (L1+L2-50) 應為 ((L1+L2)/2-50);T 末項用 -9° 應為 -63°,
// 會讓顯示的 ΔE 偏差約 ±0.1。此版已對齊 tools/analyze_match.py 驗證過的正解。
function ciede2000(lab1, lab2) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const kL = 1, kC = 1, kH = 1;
    const RAD = Math.PI / 180, DEG = 180 / Math.PI;
    const POW25_7 = 6103515625; // 25^7

    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2;
    const Cb7 = Math.pow(Cb, 7);
    const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + POW25_7)));

    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const Cbp = (C1p + C2p) / 2;

    let h1p = Math.atan2(b1, a1p) * DEG; if (h1p < 0) h1p += 360;
    let h2p = Math.atan2(b2, a2p) * DEG; if (h2p < 0) h2p += 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    const prod = C1p * C2p;
    let dhp = 0;
    if (prod !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) dhp -= 360;
        else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(prod) * Math.sin((dhp * RAD) / 2);

    let Hp;
    if (prod === 0) Hp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) Hp = (h1p + h2p) / 2;
    else Hp = (h1p + h2p < 360) ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;

    const T = 1 - 0.17 * Math.cos((Hp - 30) * RAD)
                + 0.24 * Math.cos((2 * Hp) * RAD)
                + 0.32 * Math.cos((3 * Hp + 6) * RAD)
                - 0.20 * Math.cos((4 * Hp - 63) * RAD);

    const Lbar = (L1 + L2) / 2;
    const SL = 1 + (0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
    const SC = 1 + 0.045 * Cbp;
    const SH = 1 + 0.015 * Cbp * T;

    const dtheta = 30 * Math.exp(-Math.pow((Hp - 275) / 25, 2));
    const Cbp7 = Math.pow(Cbp, 7);
    const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + POW25_7));
    const RT = -RC * Math.sin((2 * dtheta) * RAD);

    return Math.sqrt(
        Math.pow(dLp / (kL * SL), 2) +
        Math.pow(dCp / (kC * SC), 2) +
        Math.pow(dHp / (kH * SH), 2) +
        RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );
}

// 尋找相似顏色 (回傳前 N 個)
function findSimilarColors(targetColor, database, threshold = 10, limit = 30) {
    const similarColors = [];
    // 來源色若無有效 lab,無法比對
    if (!targetColor || !Array.isArray(targetColor.lab)) return similarColors;

    database.forEach(color => {
        if (!Array.isArray(color.lab)) return; // 跳過缺 lab 的壞資料,不拖垮整批
        if (color.code === targetColor.code && color.brand === targetColor.brand) {
            return; // 跳過相同顏色
        }

        const deltaE = ciede2000(targetColor.lab, color.lab);
        if (Number.isFinite(deltaE) && deltaE <= threshold) {
            similarColors.push({
                ...color,
                similarity: deltaE
            });
        }
    });

    similarColors.sort((a, b) => a.similarity - b.similarity);
    return similarColors.slice(0, limit);
}

// 產生單張色卡 HTML (結果區與收藏彈窗共用)
function renderCard(color, opts = {}) {
    // 安全處理 rgb / hex(防缺欄位或惡意上傳資料)
    const rgb = (Array.isArray(color.rgb) && color.rgb.length >= 3)
        ? color.rgb
        : (hexToRgb(color.hex || '') || [0, 0, 0]);
    const cmyk = Array.isArray(color.cmyk) ? color.cmyk : rgbToCmyk(rgb);
    // hex 會放進 style,只允許合法色碼,否則用安全預設(防 CSS injection)
    const safeHex = /^#?[0-9A-Fa-f]{3,8}$/.test(String(color.hex || '')) ? color.hex : '#cccccc';

    // 所有顯示文字一律跳脫
    const eBrand = escapeHtml(color.brand);
    const nameLine = color.name ? `${eBrand} · ${escapeHtml(color.name)}` : eBrand;
    const fav = isFavorite(color);
    let badge = '';
    if (!opts.hideBadge) {
        badge = color.isSeed
            ? '<span class="similarity-score" style="background:#000;color:#fff;">查詢來源</span>'
            : (typeof color.similarity === 'number' ? `<span class="similarity-score">ΔE ${color.similarity.toFixed(2)}</span>` : '');
    }
    // 市價 (Phase 2:資料若含 price 欄位才顯示)
    const priceLine = color.price ? `<p class="price-line">參考價: ${escapeHtml(color.price)}</p>` : '';
    // 比價連結 (僅市售油漆;油漆價格綁「品牌×產品線×容量」而非單一色號,故導向品牌層級的即時比價)
    let priceLink = '';
    if (color.category === 'paint') {
        const q = brandPriceQueryById[color.brand_id] || (String(color.brand || '').split(/\s+/)[0] + ' 乳膠漆');
        const url = 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(q);
        priceLink = `<a class="price-link" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">查市價 / 比價 →</a>`;
    }
    // 類型標示:市售油漆 vs 色彩標準
    const catTag = color.category === 'paint'
        ? '<span class="cat-tag cat-paint">市售油漆</span>'
        : (color.category === 'standard' ? '<span class="cat-tag cat-standard">色彩標準</span>' : '');
    // 收藏按鈕需要的精簡 color 物件
    const slim = {
        brand: color.brand, brand_id: color.brand_id, code: color.code,
        name: color.name || '', hex: color.hex, rgb: rgb, cmyk: cmyk, lab: color.lab,
        category: color.category || 'other', price: color.price || null
    };
    const dataColor = encodeURIComponent(JSON.stringify(slim));
    return `
        <div class="result-card fade-in${color.isSeed ? ' is-seed' : ''}">
            <button class="fav-btn ${fav ? 'is-fav' : ''}" data-color="${dataColor}" onclick="toggleFavorite(this)" title="加入/移除收藏" aria-label="收藏">${fav ? '★' : '☆'}</button>
            <div class="color-preview-small" style="background-color: ${safeHex};" onclick="previewOnWall('${safeHex}')" title="點擊在牆面預覽此色" role="button" tabindex="0"></div>
            <div class="result-info">
                <h4>${nameLine} ${catTag}</h4>
                <p>色號: ${escapeHtml(color.code)}</p>
                <p>HEX: ${escapeHtml(color.hex)}</p>
                <p>RGB: ${rgb.join(', ')}</p>
                <p>CMYK: ${cmyk.join(', ')}</p>
                ${priceLine}
                ${badge}
                ${priceLink}
            </div>
        </div>`;
}

// 顯示結果
function displayResults(results) {
    const container = document.getElementById('results-container');
    const grid = document.getElementById('results-grid');

    if (!results || results.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: #666;">未找到相似顏色，可改用「只比對市售油漆」或放寬條件</p>';
    } else {
        grid.innerHTML = results.map(c => renderCard(c)).join('');
    }

    // 更新結果數 (不計查詢來源卡)
    const countEl = document.getElementById('result-count');
    if (countEl) {
        const shown = results ? results.filter(r => !r.isSeed).length : 0;
        countEl.textContent = shown > 0 ? `共 ${shown} 個相近色` : '';
    }

    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
}

// 更新轉換輸入框
function updateConversionInputs(hex, rgb, cmyk, lab) {
    document.getElementById('convert-hex').value = hex;
    document.getElementById('convert-rgb').value = rgb.join(', ');
    document.getElementById('convert-cmyk').value = cmyk.join(', ');
    document.getElementById('convert-lab').value = lab.join(', ');
}

// 更新色彩預覽 (牆面模擬:#color-preview 即牆面)
function updateColorPreview(hex) {
    const preview = document.getElementById('color-preview');
    const text = document.getElementById('preview-text');

    if (preview) preview.style.backgroundColor = hex;
    if (text) text.textContent = hex;
}

// 點查詢結果色塊 → 套到色碼轉換的牆面模擬,並捲動到該區
function previewOnWall(hex) {
    if (!hex) return;
    const input = document.getElementById('convert-hex');
    if (input) input.value = hex;
    convertFromHex(hex);       // 同步 RGB/CMYK/LAB (標準 6 碼時)
    updateColorPreview(hex);   // 確保牆面一定上色 (含 8 碼/簡碼)
    scrollToSection('convert');
}

// 工具函數 — 從 brands.json 動態查 (替代寫死的對應表)
function getBrandName(brandCode) {
    return brandsByCode[brandCode] || brandCode;
}

// HTML 跳脫:防止上傳色卡的資料注入 HTML/破壞版面 (self-XSS)
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

function isValidHex(hex) {
    return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

function parseRGB(rgbStr) {
    const match = rgbStr.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
}

function parseCMYK(cmykStr) {
    const match = cmykStr.match(/(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])] : null;
}

function parseLAB(labStr) {
    const match = labStr.match(/(-?\d+),\s*(-?\d+),\s*(-?\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
}

// 通知系統
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加樣式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
    `;
    
    // 根據類型設定背景色
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    
    document.body.appendChild(notification);
    
    // 自動移除
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 添加通知動畫樣式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

/* ===================== Phase 2:收藏 / 附近油漆行 / 歷史 ===================== */

const FAV_KEY = 'qicai_favorites_v1';
const HIST_KEY = 'qicai_history_v1';

function colorKey(c) {
    return `${c.brand_id || c.brand || ''}|${c.code || ''}`;
}

function loadFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
    catch { return []; }
}

function saveFavorites(list) {
    try {
        localStorage.setItem(FAV_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('收藏無法儲存(無痕模式或儲存空間已滿)', e);
        showNotification('此瀏覽器無法儲存收藏(可能為無痕模式)', 'warning');
    }
    updateFavCount();
}

function isFavorite(color) {
    const key = colorKey(color);
    return loadFavorites().some(c => colorKey(c) === key);
}

// 收藏 / 取消收藏 (由卡片上的 ★ 按鈕呼叫)
function toggleFavorite(btn) {
    let color;
    try { color = JSON.parse(decodeURIComponent(btn.dataset.color)); }
    catch { return; }

    const key = colorKey(color);
    let favs = loadFavorites();
    const idx = favs.findIndex(c => colorKey(c) === key);

    if (idx >= 0) {
        favs.splice(idx, 1);
        btn.classList.remove('is-fav');
        btn.textContent = '☆';
        showNotification('已移除收藏', 'info');
    } else {
        favs.push(color);
        btn.classList.add('is-fav');
        btn.textContent = '★';
        showNotification(`已收藏 ${color.brand} ${color.code}`, 'success');
    }
    saveFavorites(favs);
}

function updateFavCount() {
    const badge = document.getElementById('fav-count');
    if (!badge) return;
    const n = loadFavorites().length;
    badge.textContent = n;
    badge.classList.toggle('has-items', n > 0);
}

function openFavorites(e) {
    if (e) e.preventDefault();
    renderFavorites();
    document.getElementById('fav-modal').style.display = 'flex';
}

function closeFavorites(e) {
    if (e) e.preventDefault();
    document.getElementById('fav-modal').style.display = 'none';
}

function renderFavorites() {
    const grid = document.getElementById('fav-grid');
    const empty = document.getElementById('fav-empty');
    const favs = loadFavorites();

    if (favs.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    grid.innerHTML = favs.map(c => renderCard(c, { hideBadge: true })).join('');
}

/* ---- 附近油漆行 (Google Maps Embed,免 API key) ---- */

function updateStoresMap(query) {
    const iframe = document.getElementById('stores-map');
    if (iframe) iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    // 同步更新後備連結:即使 iframe embed 被 Google 擋,使用者仍可點此開啟
    const link = document.getElementById('stores-link');
    if (link) link.href = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function searchStores() {
    const loc = document.getElementById('store-location').value.trim();
    if (!loc) {
        showNotification('請輸入縣市或地區', 'warning');
        return;
    }
    updateStoresMap(`${loc} 油漆行`);
}

function useMyLocation() {
    if (!navigator.geolocation) {
        showNotification('此瀏覽器不支援定位,請手動輸入地區', 'warning');
        return;
    }
    showNotification('正在取得你的位置...', 'info');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            const iframe = document.getElementById('stores-map');
            // 以座標為中心搜尋油漆行
            if (iframe) iframe.src = `https://maps.google.com/maps?q=%E6%B2%B9%E6%BC%86%E8%A1%8C/@${latitude},${longitude},14z&output=embed`;
            const link = document.getElementById('stores-link');
            if (link) link.href = `https://www.google.com/maps/search/%E6%B2%B9%E6%BC%86%E8%A1%8C/@${latitude},${longitude},14z`;
            showNotification('已定位,顯示附近油漆行', 'success');
        },
        () => showNotification('無法取得位置,請手動輸入地區', 'error'),
        { timeout: 8000 }
    );
}

/* ---- 比對歷史 (localStorage,記錄最近 10 筆查詢來源) ---- */

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; }
    catch { return []; }
}

// 記錄一筆查詢來源。entry.kind: 'code' (品牌色號) 或 'color' (HEX/RGB)
// 整段包 try-catch:無痕模式/配額滿時略過歷史,絕不影響查詢主流程
function addHistory(entry) {
    if (!entry) return;
    try {
        const key = entry.kind === 'color'
            ? `color|${entry.hex || ''}`
            : `${entry.brand_id || entry.brand || ''}|${entry.code || ''}`;
        let hist = loadHistory().filter(h => h._key !== key);
        hist.unshift({
            _key: key,
            kind: entry.kind || 'code',
            brand: entry.brand || '',
            brand_id: entry.brand_id || '',
            code: entry.code || '',
            hex: entry.hex || '',
            name: entry.name || '',
            ts: Date.now()
        });
        localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, 12)));
    } catch (e) {
        /* 略過歷史記錄 */
    }
    updateHistCount();
}

function updateHistCount() {
    const badge = document.getElementById('hist-count');
    if (!badge) return;
    const n = loadHistory().length;
    badge.textContent = n;
    badge.classList.toggle('has-items', n > 0);
}

function openHistory(e) {
    if (e) e.preventDefault();
    renderHistory();
    document.getElementById('hist-modal').style.display = 'flex';
}

function closeHistory(e) {
    if (e) e.preventDefault();
    document.getElementById('hist-modal').style.display = 'none';
}

function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '剛剛';
    if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
    if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
    return `${Math.floor(s / 86400)} 天前`;
}

function renderHistory() {
    const list = document.getElementById('hist-list');
    const empty = document.getElementById('hist-empty');
    const hist = loadHistory();

    if (!hist.length) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    list.innerHTML = hist.map((h, i) => {
        const safeHex = /^#?[0-9A-Fa-f]{3,8}$/.test(String(h.hex || '')) ? h.hex : '#cccccc';
        const label = h.kind === 'color'
            ? `HEX 查詢 ${escapeHtml(h.hex)}`
            : `${escapeHtml(h.brand)} ${escapeHtml(h.code)}${h.name ? ' · ' + escapeHtml(h.name) : ''}`;
        return `
            <button class="hist-item" onclick="replayHistory(${i})" title="重新查詢">
                <span class="hist-swatch" style="background-color:${safeHex};"></span>
                <span class="hist-label">${label}</span>
                <span class="hist-time">${timeAgo(h.ts)}</span>
            </button>`;
    }).join('');
}

// 重播一筆歷史查詢
function replayHistory(idx) {
    const hist = loadHistory();
    const h = hist[idx];
    if (!h) return;
    if (!colorsReady) { withColors(() => replayHistory(idx)); return; }
    closeHistory();

    if (h.kind === 'color') {
        const rgb = hexToRgb(h.hex);
        if (!rgb) { showNotification('色碼無效,無法重新查詢', 'warning'); return; }
        runColorSearch(rgb);
        return;
    }
    // 品牌色號:回色庫找出來源色
    const seed = colorDatabase.find(c =>
        (c.brand_id === h.brand_id || c.brand === h.brand) && String(c.code) === String(h.code));
    if (!seed) {
        showNotification('找不到此色號(色庫可能已更新)', 'warning');
        return;
    }
    lastQuery = { seed, showSeed: true };
    runComparison();
}

function clearHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch (e) { /* ignore */ }
    renderHistory();
    updateHistCount();
    showNotification('已清除查詢紀錄', 'info');
}

// 色碼轉換 → 以目前顏色查相近油漆 (橋接轉換與查詢)
function searchFromConverter() {
    const hex = (document.getElementById('convert-hex').value || '').trim();
    const rgb = hexToRgb(hex);
    if (!rgb) {
        showNotification('請先在上方輸入有效的 HEX 色碼', 'warning');
        return;
    }
    runColorSearch(rgb);
}

// Enter 鍵即查詢 (色號 / HEX / RGB / 地區)
function setupKeyboardShortcuts() {
    const onEnter = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
    };
    onEnter('color-code', searchByCode);
    onEnter('hex-input', searchByColor);
    onEnter('rgb-input', searchByColor);
    onEnter('store-location', searchStores);

    // 無障礙:Esc 關閉彈窗/選單;結果色塊用 Enter/空白鍵也能上牆
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const fav = document.getElementById('fav-modal');
            const hist = document.getElementById('hist-modal');
            if (fav && fav.style.display !== 'none') closeFavorites();
            if (hist && hist.style.display !== 'none') closeHistory();
            closeNav();
        } else if ((e.key === 'Enter' || e.key === ' ') &&
                   e.target && e.target.classList && e.target.classList.contains('color-preview-small')) {
            e.preventDefault();
            e.target.click(); // 觸發 inline 的 previewOnWall
        }
    });
}

// 頁面載入時初始化收藏 / 歷史數量與鍵盤快捷鍵
document.addEventListener('DOMContentLoaded', function() {
    updateFavCount();
    updateHistCount();
    setupKeyboardShortcuts();
});
