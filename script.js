// 全域變數
let colorDatabase = [];
let brandsCatalog = [];       // 從 brands.json 載入
let brandsByCode = {};         // 內部 id → 顯示名
let currentResults = [];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadBrandsThenColors();
});

// 初始化應用程式
function initializeApp() {
    // 設定導航連結
    setupNavigation();
    
    // 設定標籤切換
    setupTabs();
    
    // 設定檔案上傳
    setupFileUpload();
    
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
            scrollToSection(targetId);
            
            // 更新活動狀態
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
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

// 設定檔案上傳
function setupFileUpload() {
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('file-input');
    
    uploadBox.addEventListener('click', () => fileInput.click());
    uploadBox.addEventListener('dragover', handleDragOver);
    uploadBox.addEventListener('drop', handleFileDrop);
    fileInput.addEventListener('change', handleFileSelect);
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

// 載入 brands.json 與 colors.json (依序),失敗時不使用假資料
async function loadBrandsThenColors() {
    try {
        const brandsRes = await fetch('brands.json', { cache: 'no-cache' });
        if (!brandsRes.ok) throw new Error('brands.json HTTP ' + brandsRes.status);
        brandsCatalog = await brandsRes.json();
        brandsByCode = Object.fromEntries(brandsCatalog.map(b => [b.id, b.name]));
        populateBrandUI();
    } catch (err) {
        console.error('載入 brands.json 失敗', err);
        showNotification('品牌清單載入失敗', 'error');
        brandsCatalog = [];
    }

    try {
        const colorsRes = await fetch('colors.json', { cache: 'no-cache' });
        if (!colorsRes.ok) throw new Error('colors.json HTTP ' + colorsRes.status);
        const payload = await colorsRes.json();
        // 支援兩種格式: 純陣列 (舊) 或 {colors: [...]} (新 schema_version 2.0)
        colorDatabase = Array.isArray(payload) ? payload : (payload.colors || []);
        // 把 brand_id 對應回 brand 顯示名稱;若 lab/cmyk 缺漏則補上
        colorDatabase.forEach(c => {
            if (!c.brand && c.brand_id) c.brand = brandsByCode[c.brand_id] || c.brand_id;
            if (!c.lab && c.rgb) c.lab = rgbToLab(c.rgb);
            if (!c.cmyk && c.rgb) c.cmyk = rgbToCmyk(c.rgb);
        });
        console.log(`已載入 ${colorDatabase.length} 筆色號資料`);
    } catch (err) {
        console.error('載入 colors.json 失敗', err);
        showNotification('色號資料載入失敗,請稍後再試', 'error');
        colorDatabase = [];
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

    const brandName = getBrandName(brand);
    const codeLower = code.toLowerCase();

    // 精準命中 (品牌一致 且 色號完全相符或包含)
    const matches = colorDatabase.filter(color =>
        color.brand === brandName &&
        color.code.toLowerCase().includes(codeLower)
    );

    if (matches.length === 0) {
        showNotification(`在 ${brandName} 找不到色號「${code}」`, 'warning');
        displayResults([]);
        return;
    }

    // 用第一筆命中色作為查詢來源,找其他品牌的相近色
    const seed = matches[0];
    showNotification(`已找到 ${brandName} ${seed.code},正在比對其他品牌...`, 'info');
    addHistory(seed);
    const similar = findSimilarColors(seed, colorDatabase);
    // 把 seed 自己也擺在最前面,方便對照
    displayResults([{ ...seed, similarity: 0, isSeed: true }, ...similar]);
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
    
    // 轉換為LAB色彩空間
    const labColor = rgbToLab(targetColor);
    
    // 建立虛擬色號物件
    const virtualColor = {
        brand: "查詢色",
        code: "QUERY",
        hex: rgbToHex(targetColor),
        rgb: targetColor,
        lab: labColor,
        name: "查詢顏色",
        url: "#"
    };
    
    // 尋找相似顏色
    const similarColors = findSimilarColors(virtualColor, colorDatabase);
    displayResults(similarColors);
}

// 檔案上傳處理
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = '#000';
    e.currentTarget.style.background = '#f8f9fa';
}

function handleFileDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
    e.currentTarget.style.borderColor = '#e5e5e5';
    e.currentTarget.style.background = '#fff';
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function processFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let data;
            if (file.name.endsWith('.json')) {
                data = JSON.parse(e.target.result);
            } else if (file.name.endsWith('.csv')) {
                data = parseCSV(e.target.result);
            }
            
            if (data && data.length > 0) {
                colorDatabase = colorDatabase.concat(data);
                showNotification(`成功載入 ${data.length} 筆色號資料`, 'success');
            }
        } catch (error) {
            showNotification('檔案格式錯誤', 'error');
        }
    };
    reader.readAsText(file);
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
    const [r, g, b] = rgb.map(x => x / 255);
    const k = 1 - Math.max(r, g, b);
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

function rgbToLab(rgb) {
    // 簡化的RGB到LAB轉換
    const [r, g, b] = rgb.map(x => x / 255);
    
    // 轉換到XYZ
    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    
    // 轉換到LAB
    const l = 116 * Math.pow(y, 1/3) - 16;
    const a = 500 * (Math.pow(x, 1/3) - Math.pow(y, 1/3));
    const b_lab = 200 * (Math.pow(y, 1/3) - Math.pow(z, 1/3));
    
    return [
        Math.round(l),
        Math.round(a),
        Math.round(b_lab)
    ];
}

function labToRgb(lab) {
    // 簡化的LAB到RGB轉換
    const [l, a, b] = lab;
    
    // 轉換到XYZ
    const y = Math.pow((l + 16) / 116, 3);
    const x = Math.pow(a / 500 + Math.pow(y, 1/3), 3);
    const z = Math.pow(Math.pow(y, 1/3) - b / 200, 3);
    
    // 轉換到RGB
    const r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    const g = x * -0.9689 + y * 1.8758 + z * 0.0415;
    const b_rgb = x * 0.0557 + y * -0.2040 + z * 1.0570;
    
    return [
        Math.max(0, Math.min(255, Math.round(r * 255))),
        Math.max(0, Math.min(255, Math.round(g * 255))),
        Math.max(0, Math.min(255, Math.round(b_rgb * 255)))
    ];
}

// CIEDE2000 色差演算法
function ciede2000(lab1, lab2) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    
    const kL = 1;
    const kC = 1;
    const kH = 1;
    
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cb = (C1 + C2) / 2;
    
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    
    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);
    
    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);
    const Cbp = (C1p + C2p) / 2;
    
    let h1p = Math.atan2(b1, a1p);
    let h2p = Math.atan2(b2, a2p);
    
    if (h1p < 0) h1p += 2 * Math.PI;
    if (h2p < 0) h2p += 2 * Math.PI;
    
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    
    let dhp = h2p - h1p;
    if (dhp > Math.PI) dhp -= 2 * Math.PI;
    if (dhp < -Math.PI) dhp += 2 * Math.PI;
    
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2);
    
    let Hp = (h1p + h2p) / 2;
    if (Math.abs(h1p - h2p) > Math.PI) {
        Hp += Math.PI;
    }
    
    const T = 1 - 0.17 * Math.cos(Hp - Math.PI / 6) + 0.24 * Math.cos(2 * Hp) + 0.32 * Math.cos(3 * Hp + Math.PI / 30) - 0.2 * Math.cos(4 * Hp - Math.PI / 20);
    
    const SL = 1 + (0.015 * Math.pow(L1 + L2 - 50, 2)) / Math.sqrt(20 + Math.pow(L1 + L2 - 50, 2));
    const SC = 1 + 0.045 * Cbp;
    const SH = 1 + 0.015 * Cbp * T;
    
    const RT = -2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7))) * Math.sin(Math.PI / 3 * Math.exp(-Math.pow((Hp * 180 / Math.PI - 275) / 25, 2)));
    
    const dE = Math.sqrt(
        Math.pow(dLp / (kL * SL), 2) +
        Math.pow(dCp / (kC * SC), 2) +
        Math.pow(dHp / (kH * SH), 2) +
        RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    );
    
    return dE;
}

// 尋找相似顏色 (回傳前 N 個)
function findSimilarColors(targetColor, database, threshold = 10, limit = 30) {
    const similarColors = [];

    database.forEach(color => {
        if (color.code === targetColor.code && color.brand === targetColor.brand) {
            return; // 跳過相同顏色
        }

        const deltaE = ciede2000(targetColor.lab, color.lab);
        if (deltaE <= threshold) {
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
    const cmyk = color.cmyk || rgbToCmyk(color.rgb);
    const nameLine = color.name ? `${color.brand} · ${color.name}` : color.brand;
    const fav = isFavorite(color);
    let badge = '';
    if (!opts.hideBadge) {
        badge = color.isSeed
            ? '<span class="similarity-score" style="background:#000;color:#fff;">查詢來源</span>'
            : (typeof color.similarity === 'number' ? `<span class="similarity-score">ΔE ${color.similarity.toFixed(2)}</span>` : '');
    }
    // 市價 (Phase 2:資料若含 price 欄位才顯示)
    const priceLine = color.price ? `<p class="price-line">參考價: ${color.price}</p>` : '';
    // 收藏按鈕需要的精簡 color 物件
    const slim = {
        brand: color.brand, brand_id: color.brand_id, code: color.code,
        name: color.name || '', hex: color.hex, rgb: color.rgb, cmyk: cmyk, lab: color.lab, price: color.price || null
    };
    const dataColor = encodeURIComponent(JSON.stringify(slim));
    return `
        <div class="result-card fade-in${color.isSeed ? ' is-seed' : ''}">
            <button class="fav-btn ${fav ? 'is-fav' : ''}" data-color="${dataColor}" onclick="toggleFavorite(this)" title="加入/移除收藏" aria-label="收藏">${fav ? '★' : '☆'}</button>
            <div class="color-preview-small" style="background-color: ${color.hex};"></div>
            <div class="result-info">
                <h4>${nameLine}</h4>
                <p>色號: ${color.code}</p>
                <p>HEX: ${color.hex}</p>
                <p>RGB: ${color.rgb.join(', ')}</p>
                <p>CMYK: ${cmyk.join(', ')}</p>
                ${priceLine}
                ${badge}
            </div>
        </div>`;
}

// 顯示結果
function displayResults(results) {
    const container = document.getElementById('results-container');
    const grid = document.getElementById('results-grid');

    if (!results || results.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: #666;">未找到相似顏色</p>';
    } else {
        grid.innerHTML = results.map(c => renderCard(c)).join('');
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

// 更新色彩預覽
function updateColorPreview(hex) {
    const preview = document.getElementById('color-preview');
    const text = document.getElementById('preview-text');
    
    preview.style.backgroundColor = hex;
    text.textContent = hex;
}

// 工具函數 — 從 brands.json 動態查 (替代寫死的對應表)
function getBrandName(brandCode) {
    return brandsByCode[brandCode] || brandCode;
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

function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = lines[i].split(',');
            const obj = {};
            headers.forEach((header, index) => {
                obj[header.trim()] = values[index] ? values[index].trim() : '';
            });
            data.push(obj);
        }
    }
    
    return data;
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
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
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
    if (!iframe) return;
    iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
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
            iframe.src = `https://maps.google.com/maps?q=%E6%B2%B9%E6%BC%86%E8%A1%8C/@${latitude},${longitude},14z&output=embed`;
            showNotification('已定位,顯示附近油漆行', 'success');
        },
        () => showNotification('無法取得位置,請手動輸入地區', 'error'),
        { timeout: 8000 }
    );
}

/* ---- 比對歷史 (localStorage,記錄最近 10 筆查詢來源) ---- */

function addHistory(color) {
    if (!color) return;
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch {}
    const key = colorKey(color);
    hist = hist.filter(c => colorKey(c) !== key);
    hist.unshift({ brand: color.brand, brand_id: color.brand_id, code: color.code, hex: color.hex, ts: Date.now() });
    hist = hist.slice(0, 10);
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
}

// 頁面載入時初始化收藏數量
document.addEventListener('DOMContentLoaded', updateFavCount);
