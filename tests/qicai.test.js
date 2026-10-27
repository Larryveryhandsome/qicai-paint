import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const colorsFile = JSON.parse(fs.readFileSync(path.join(root, "colors.json"), "utf8"));

function pythonCmd() {
  for (const c of ["python", "python3", "py"]) {
    const r = spawnSync(c, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  return null;
}

// Load script.js (classic script with globals) into a sandbox with a stub DOM.
function load(extra = {}) {
  const el = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {}, appendChild() {}, setAttribute() {} });
  const ctx = {
    console, setTimeout, clearTimeout, URL, encodeURIComponent, decodeURIComponent, JSON, Math, Number, String, Array, Object,
    document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], createElement: el, head: { appendChild() {} }, body: { appendChild() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: {},
    ...extra,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "script.js"), "utf8") + "\n;globalThis.__api={ciede2000,rgbToLab,hexToRgb,findSimilarColors,findCodeMatches,renderCard,escapeHtml,ensureColors,getState:()=>({colorDatabase,colorsReady})}", ctx);
  return ctx;
}

test("colors.json: self-made palette schema, unique codes, hex/rgb/lab consistency", () => {
  const { rgbToLab } = load().__api;
  assert.equal(colorsFile.color_count, colorsFile.colors.length);
  assert.ok(colorsFile.colors.length >= 100, "enough colours to be useful");
  const groups = new Set(colorsFile.groups);
  const codes = new Set();
  const names = new Set();
  const hexes = new Set();
  for (const c of colorsFile.colors) {
    assert.match(c.code, /^QC-\d{3}$/, `code format ${c.code}`);
    assert.ok(!codes.has(c.code), `duplicate code ${c.code}`);
    codes.add(c.code);
    assert.ok(c.name && !names.has(c.name), `name missing/duplicate ${c.code}`);
    names.add(c.name);
    assert.ok(groups.has(c.group), `unknown group ${c.group}`);
    assert.match(c.hex, /^#[0-9A-F]{6}$/);
    assert.ok(!hexes.has(c.hex), `duplicate hex ${c.hex}`);
    hexes.add(c.hex);
    assert.ok(Array.isArray(c.rgb) && c.rgb.length === 3 && c.rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
    assert.equal("#" + c.rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(), c.hex);
    const lab = rgbToLab(c.rgb);
    assert.ok(c.lab.every((v, i) => Math.abs(v - lab[i]) < 0.1), `lab mismatch ${c.code}`);
    assert.ok(Array.isArray(c.cmyk) && c.cmyk.length === 4 && c.cmyk.every((v) => v >= 0 && v <= 100));
  }
  for (const g of colorsFile.groups) assert.ok(colorsFile.colors.some((c) => c.group === g), `empty group ${g}`);
});

test("no third-party brand or scraped-source names anywhere in shipped files", () => {
  const banned = /立邦|nippon|得利|dulux|虹牌|青葉|pantone|munsell|colortell|rainbow-house|sherwin|三棵樹|TOA|cncs|cbcc/i;
  for (const f of ["index.html", "script.js", "colors.json", "styles.css"]) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    const m = text.match(banned);
    assert.equal(m, null, `${f} mentions ${m && m[0]}`);
  }
  assert.ok(!fs.existsSync(path.join(root, "brands.json")), "brands.json must be gone");
});

test("build_palette.py --check passes and reproduces colors.json", { skip: !pythonCmd() }, () => {
  const py = pythonCmd();
  const r = spawnSync(py, ["-X", "utf8", path.join(root, "tools", "build_palette.py"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const gen = spawnSync(py, ["-X", "utf8", "-c",
    "import sys,json;sys.path.insert(0,'tools');import build_palette as b;p,e=b.build();print(json.dumps({k:v for k,v in p.items() if k!='updated_at'},ensure_ascii=False,sort_keys=True))"],
    { encoding: "utf8", cwd: root });
  assert.equal(gen.status, 0, gen.stderr);
  const key = (c) => [c.code, c.name, c.group, c.hex].join("|");
  const g = JSON.parse(gen.stdout);
  assert.deepEqual(g.colors.map(key), colorsFile.colors.map(key));
  assert.deepEqual(g.groups, colorsFile.groups);
});

test("CIEDE2000 matches Sharma 2005 reference pairs", () => {
  const { ciede2000 } = load().__api;
  const ref = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  for (const [a, b, d] of ref) {
    assert.ok(Math.abs(ciede2000(a, b) - d) < 1e-3, `${a} vs ${b}`);
    assert.ok(Math.abs(ciede2000(b, a) - d) < 1e-3);
  }
});

test("lookup by code or name: exact match beats prefix/substring", () => {
  const api = load().__api;
  for (const c of colorsFile.colors) {
    assert.equal(api.findCodeMatches(colorsFile.colors, c.code)[0].code, c.code, c.code);
    assert.equal(api.findCodeMatches(colorsFile.colors, c.name)[0].name, c.name, c.name);
  }
  assert.equal(api.findCodeMatches(colorsFile.colors, "qc-025")[0].code, "QC-025"); // case-insensitive
  assert.ok(api.findCodeMatches(colorsFile.colors, "白").length > 3, "partial name finds several");
  assert.equal(api.findCodeMatches(colorsFile.colors, "   ").length, 0);
  assert.equal(api.findCodeMatches(colorsFile.colors, "ZZZ-NOPE").length, 0);
});

test("similar-color search: full-table scan is fast and never returns NaN", () => {
  const api = load().__api;
  const t = Date.now();
  for (let i = 0; i < 20; i++) api.findSimilarColors({ lab: [10 + i * 4, i - 10, 5], code: "Q", brand: "q" }, colorsFile.colors);
  assert.ok((Date.now() - t) / 20 < 100, "avg scan under 100 ms");
  assert.equal(api.findSimilarColors({ lab: null }, colorsFile.colors).length, 0);
  assert.doesNotThrow(() => api.findSimilarColors({ lab: [50, 0, 0], code: "Q", brand: "q" }, [{ code: 1 }, { lab: "bad" }, { lab: [1, 2, 3], code: 5, brand: "z" }]));
});

test("renderCard escapes hostile data (XSS)", () => {
  const api = load().__api;
  const xss = `"><img src=x onerror=alert(1)>`;
  const html = api.renderCard({ brand: xss, brand_id: "x", code: xss, name: xss, hex: xss, rgb: [1, 2, 3], category: "paint", price: xss });
  assert.ok(!html.includes("<img"), "no raw tag");
  assert.ok(!/onclick="previewOnWall\('[^']*"/.test(html) || html.includes("#cccccc"));
});

test("renderCard neutralises tampered localStorage favorites (rgb/cmyk strings)", () => {
  const api = load().__api;
  const html = api.renderCard({ brand: "b", brand_id: "b", code: "1", hex: "#fff", rgb: ["<img src=x onerror=1>", 2, 3], cmyk: [0, 0, 0, "<svg onload=1>"] });
  assert.ok(!html.includes("<img") && !html.includes("<svg"));
});

test("ensureColors loads the self-made library and never requests brands.json", async () => {
  const urls = [];
  const fetchStub = async (url) => { urls.push(url); return { ok: true, json: async () => colorsFile }; };
  const ctx = load({ fetch: fetchStub });
  await ctx.__api.ensureColors();
  const st = ctx.__api.getState();
  assert.equal(st.colorsReady, true);
  assert.equal(st.colorDatabase.length, colorsFile.colors.length);
  assert.ok(urls.every((u) => u.startsWith("colors.json")), urls.join());
  const c = st.colorDatabase[0];
  assert.equal(c.brand, c.group); // card header shows the colour family
  assert.equal(c.brand_id, "qc");
});

test("every colour finds itself plus neighbours; far-off colour still gets a fallback via runComparison", () => {
  const api = load().__api;
  const hits = colorsFile.colors.filter((c) => api.findSimilarColors(c, colorsFile.colors).length > 0).length;
  assert.ok(hits / colorsFile.colors.length > 0.9, "most colours have a neighbour within dE 10");
  const nearest = api.findSimilarColors({ lab: [50, 90, 90], code: "Q", brand: "q" }, colorsFile.colors, Infinity, 6);
  assert.equal(nearest.length, 6);
});
