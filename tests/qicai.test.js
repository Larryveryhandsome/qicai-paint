import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const colorsFile = JSON.parse(fs.readFileSync(path.join(root, "colors.json"), "utf8"));
const brands = JSON.parse(fs.readFileSync(path.join(root, "brands.json"), "utf8"));

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

test("colors.json: schema, brand ids, hex/rgb/lab consistency, unique keys, counts", () => {
  const ids = new Set(brands.map((b) => b.id));
  assert.equal(ids.size, brands.length);
  assert.equal(colorsFile.color_count, colorsFile.colors.length);
  const { rgbToLab } = load().__api;
  const seen = new Set();
  const per = {};
  for (const c of colorsFile.colors) {
    assert.ok(ids.has(c.brand_id), `unknown brand ${c.brand_id}`);
    assert.match(c.hex, /^#[0-9A-Fa-f]{6}$/);
    assert.ok(Array.isArray(c.rgb) && c.rgb.length === 3 && c.rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
    assert.equal("#" + c.rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(), c.hex.toUpperCase());
    assert.ok(String(c.code).trim() !== "");
    const key = `${c.brand_id}|${c.code}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
    per[c.brand_id] = (per[c.brand_id] || 0) + 1;
    const lab = rgbToLab(c.rgb);
    assert.ok(c.lab.every((v, i) => Math.abs(v - lab[i]) < 0.1), `lab mismatch ${key}`);
  }
  for (const b of brands) assert.equal(per[b.id], b.count, `count ${b.id}`);
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

test("code lookup prefers exact match over substring (regression: Munsell 5R/1/2 -> 2.5R/1/2)", () => {
  const api = load().__api;
  const mun = colorsFile.colors.filter((c) => c.brand_id === "munsell");
  let wrong = 0;
  for (const c of mun) {
    const m = api.findCodeMatches(colorsFile.colors, "munsell", "x", c.code);
    if (m[0].code !== c.code) wrong++;
  }
  assert.equal(wrong, 0);
  const hit = api.findCodeMatches(colorsFile.colors, "nippon", "x", "RC0107-4");
  assert.ok(hit[0].code.startsWith("RC0107-4"));
  assert.equal(api.findCodeMatches(colorsFile.colors, "nippon", "x", "   ").length, 0);
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

test("ensureColors waits for brands.json so brand name/category are never ids", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const fetchStub = async (url) => {
    if (url.startsWith("brands.json")) { await gate; return { ok: true, json: async () => brands }; }
    return { ok: true, json: async () => colorsFile };
  };
  const ctx = load({ fetch: fetchStub });
  // Simulate DOMContentLoaded wiring: brands load started first, colors requested immediately
  vm.runInContext("brandsPromise = loadBrands();", ctx);
  const p = ctx.__api.ensureColors();
  setTimeout(release, 50);
  await p;
  const nip = ctx.__api.getState().colorDatabase.find((c) => c.brand_id === "nippon");
  assert.equal(nip.category, "paint");
  assert.notEqual(nip.brand, "nippon");
});
