/* Lights Out at Ashgrove: a raycast horror game with four stages and online co-op. */
(() => {
'use strict';
const VERSION = 7;
const MAXP = 4;
const $ = id => document.getElementById(id);
const cvs = $('game'), ctx = cvs.getContext('2d');
const R = Math.random, rand = n => (R() * n) | 0, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const COARSE = matchMedia('(pointer: coarse)').matches;
const QS = new URLSearchParams(location.search);
const T = 64, TM = 63, MW = 23, MH = 23;
const NOISE = new Float32Array(65536); for (let i = 0; i < 65536; i++) NOISE[i] = R() - .5;
const idx = (x, y) => y * MW + x;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r2 = v => Math.round(v * 100) / 100;
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let srand = R;
const srandi = n => (srand() * n) | 0;
function shuffle(a, rng = R) { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------- stages (text lives in i18n.js) ---------- */
const STAGES = [
  { key: 'ward', mon: 'stalker', obj: 'fuse', objN: 5, door: 'lift', amb: [.72, .8, 1], ambK: 1, drain: 1, bats: 5, cams: 1, flares: 1, loops: 70, rooms: 3, drone: 41.2 },
  { key: 'morgue', mon: 'statue', obj: 'key', objN: 4, door: 'steel', amb: [.78, .88, 1], ambK: 1.1, drain: 1, bats: 4, cams: 2, flares: 1, loops: 50, rooms: 4, drone: 36.7, blackout: true },
  { key: 'boiler', mon: 'blind', obj: 'valve', objN: 3, door: 'hatch', hold: 3.2, amb: [.62, .85, .8], ambK: 1, drain: 1, bats: 4, cams: 1, flares: 2, loops: 90, rooms: 2, drone: 32.7, water: true },
  { key: 'chapel', mon: 'shade', obj: 'candle', objN: 4, door: 'chapel', hold: 2, amb: [.95, .72, .7], ambK: .5, drain: 1.3, bats: 6, cams: 2, flares: 1, loops: 60, rooms: 5, drone: 49, dark: true }
];
const I18N = window.ASH_I18N;
let LANG = I18N[store.get('ashgrove-lang')] ? store.get('ashgrove-lang') : 'en';
const L = () => I18N[LANG];
const stx = (i = stageIdx) => L().stages[i];
function t(key, p) {
  const s = stx(), vars = { exit: s.exit, obj: s.objName, objs: s.objs, one: s.objOne, ctr: s.ctr, N: STAGES[stageIdx].objN, stage: s.name, ...(p || {}) };
  const str = L()[key] ?? I18N.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/* ---------- screen buffers ---------- */
let W = 320, H = 200, F = 200, low, lctx, img, px, zbuf, cone, vig;
function resize() {
  cvs.width = innerWidth; cvs.height = innerHeight;
  H = COARSE ? 150 : 200; W = clamp(Math.round(H * innerWidth / Math.max(1, innerHeight)), 100, 480);
  F = Math.min(H, W * 0.75);
  low = document.createElement('canvas'); low.width = W; low.height = H; lctx = low.getContext('2d');
  img = lctx.createImageData(W, H); px = img.data; zbuf = new Float32Array(W);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  cone = new Float32Array(W * H); vig = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / H, dy = (y - H / 2) / H, rr = dx * dx + dy * dy, i = y * W + x;
    cone[i] = 0.08 + Math.exp(-rr / 0.03) + Math.exp(-rr / 0.12) * 0.3;
    vig[i] = clamp(1.2 - Math.sqrt(dx * dx * 0.6 + dy * dy * 1.3) * 1.5, 0.12, 1);
  }
}

/* ---------- procedural textures ---------- */
function mk(draw) { const c = document.createElement('canvas'); c.width = c.height = T; const g = c.getContext('2d'); draw(g); return c; }
function grit(g, amt) { const d = g.getImageData(0, 0, T, T); for (let i = 0; i < d.data.length; i += 4) { if (!d.data[i + 3]) continue; const n = (R() - .5) * amt; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0); }
function stain(g, n, col, maxY) { for (let i = 0; i < n; i++) { const x = R() * T, y = R() * maxY, r = 4 + R() * 14, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},.5)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(0, 0, T, T); } }
function tex(c, ec) {
  const d = c.getContext('2d').getImageData(0, 0, T, T).data, e = new Uint8Array(T * T);
  if (ec) { const ed = ec.getContext('2d').getImageData(0, 0, T, T).data; for (let i = 0; i < T * T; i++) e[i] = ed[i * 4 + 3] > 90 ? 1 : 0; }
  return { d, e };
}
const sprite = draw => tex(mk(g => draw(g, false)), mk(g => draw(g, true)));
const plain = (draw, amt = 24) => tex(mk(g => { draw(g); grit(g, amt); }));
function scrawl(g, lines, col, font = 'bold 9px monospace') { g.fillStyle = col; g.font = font; g.textAlign = 'center'; lines.forEach((l, i) => g.fillText(l, 32, 18 + i * 11)); }

function wardBase(g) {
  g.fillStyle = '#5d6351'; g.fillRect(0, 0, T, T);
  for (let x = 0; x < T; x += 8) { g.fillStyle = 'rgba(28,34,24,.28)'; g.fillRect(x, 0, 3, 44); }
  g.fillStyle = 'rgba(210,200,160,.13)';
  for (let y = 4; y < 42; y += 10) for (let x = 2; x < T; x += 8) g.fillRect(x + ((y / 10 | 0) % 2) * 4, y, 2, 3);
  g.fillStyle = '#3b2b1e'; g.fillRect(0, 44, T, 20);
  g.fillStyle = '#22180f'; g.fillRect(0, 44, T, 2); g.fillRect(0, 62, T, 2);
  for (let x = 0; x < T; x += 16) g.fillRect(x, 46, 1, 16);
  stain(g, 6, '58,38,14', 46);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(38,24,10,.35)'; g.fillRect(rand(T), rand(20), 1, 10 + R() * 30); }
}
function tileBase(g) {
  g.fillStyle = '#aeb3ad'; g.fillRect(0, 0, T, T); g.fillStyle = '#7d827d';
  for (let i = 0; i < T; i += 8) { g.fillRect(i, 0, 1, T); g.fillRect(0, i, T, 1); }
  const gr = g.createLinearGradient(0, 28, 0, 64); gr.addColorStop(0, 'rgba(60,55,40,0)'); gr.addColorStop(1, 'rgba(60,55,40,.5)'); g.fillStyle = gr; g.fillRect(0, 0, T, T);
  stain(g, 4, '70,66,40', T);
}
function brickBase(g) {
  g.fillStyle = '#2a1c17'; g.fillRect(0, 0, T, T);
  for (let r = 0; r < 8; r++) { const off = (r % 2) * 8; for (let c = -1; c < 4; c++) { const v = rand(22); g.fillStyle = `rgb(${96 + v},${50 + v / 2},${36 + v / 3})`; g.fillRect(c * 16 + off + 1, r * 8 + 1, 14, 6); } }
  const gr = g.createLinearGradient(0, 30, 0, 64); gr.addColorStop(0, 'rgba(20,50,40,0)'); gr.addColorStop(1, 'rgba(20,50,40,.6)'); g.fillStyle = gr; g.fillRect(0, 0, T, T);
  stain(g, 4, '15,30,25', T);
}
function stoneBase(g) {
  g.fillStyle = '#1d1b19'; g.fillRect(0, 0, T, T);
  for (let r = 0; r < 5; r++) { const off = (r % 2) * 10; for (let c = -1; c < 4; c++) { const v = rand(18); g.fillStyle = `rgb(${56 + v},${53 + v},${50 + v})`; g.fillRect(c * 20 + off - 9, r * 13 + 1, 18, 11); } }
  stain(g, 4, '20,15,10', T);
}
function doorTex(on, style) {
  return sprite((g, em) => {
    if (!em) {
      if (style === 'lift') {
        const gr = g.createLinearGradient(0, 0, T, 0); gr.addColorStop(0, '#4b4f53'); gr.addColorStop(.5, '#7a7f84'); gr.addColorStop(1, '#4b4f53');
        g.fillStyle = gr; g.fillRect(0, 0, T, T); g.fillStyle = '#1a1b1c'; g.fillRect(0, 0, T, 4); g.fillRect(0, 0, 5, T); g.fillRect(T - 5, 0, 5, T); g.fillRect(31, 16, 2, 48);
      } else if (style === 'steel') {
        g.fillStyle = '#4c5650'; g.fillRect(0, 0, T, T); g.fillStyle = '#23282a'; g.fillRect(0, 0, T, 4); g.fillRect(0, 0, 5, T); g.fillRect(T - 5, 0, 5, T);
        g.strokeStyle = '#262b29'; g.lineWidth = 3; g.beginPath(); g.arc(32, 38, 10, 0, 7); g.moveTo(22, 38); g.lineTo(42, 38); g.moveTo(32, 28); g.lineTo(32, 48); g.stroke();
        g.fillStyle = '#2d3331'; for (let y = 20; y < 62; y += 10) { g.fillRect(9, y, 2, 2); g.fillRect(53, y, 2, 2); }
      } else if (style === 'hatch') {
        g.fillStyle = '#5a3a24'; g.fillRect(0, 0, T, T); g.fillStyle = '#2f1d12'; g.fillRect(0, 0, T, 4); g.fillRect(0, 22, T, 4); g.fillRect(0, 44, T, 4);
        g.fillStyle = '#3a2416'; for (let x = 6; x < T; x += 10) { g.fillRect(x, 28, 2, 2); g.fillRect(x, 50, 2, 2); }
        stain(g, 5, '120,60,20', T);
      } else {
        g.fillStyle = '#3a2414'; g.fillRect(0, 0, T, T); g.fillStyle = '#1e140c'; g.fillRect(31, 16, 2, 48); g.fillRect(0, 0, 4, T); g.fillRect(T - 4, 0, 4, T);
        g.fillStyle = '#1e1e1e'; g.fillRect(4, 22, 56, 4); g.fillRect(4, 50, 56, 4);
        g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.5; g.beginPath(); g.arc(27, 38, 3, 0, 7); g.moveTo(40, 38); g.arc(37, 38, 3, 0, 7); g.stroke();
      }
      stain(g, 3, '70,40,20', T); grit(g, 18);
      g.fillStyle = '#111'; g.fillRect(26, 5, 12, 9);
    }
    g.fillStyle = on ? '#5dff7a' : '#ff2a1a'; g.fillRect(29, 7, 6, 5);
  });
}
const BUILD = {
  ward: () => ({
    walls: [plain(wardBase, 26),
      plain(g => { wardBase(g); g.strokeStyle = 'rgba(25,14,8,.85)'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { const ox = 8 + k * 13, oy = 12 + (k % 2) * 9; g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(ox + i * 2.5, oy); g.lineTo(ox + i * 2.5 + 1, oy + 10); } g.moveTo(ox - 2, oy + 8); g.lineTo(ox + 10, oy + 2); g.stroke(); } }, 26),
      plain(g => { wardBase(g); scrawl(g, ['IT SEES', 'LIGHT'], 'rgba(96,14,10,.9)'); }, 26)],
    floor: plain(g => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#4a463f' : '#77736a'; g.fillRect(x * 32, y * 32, 32, 32); } g.fillStyle = '#2a2824'; g.fillRect(0, 0, T, 1); g.fillRect(0, 32, T, 1); g.fillRect(0, 0, 1, T); g.fillRect(32, 0, 1, T); stain(g, 4, '40,30,18', T); }, 30),
    ceil: plain(g => { g.fillStyle = '#3c3a36'; g.fillRect(0, 0, T, T); g.fillStyle = '#26241f'; g.fillRect(0, 0, T, 1); g.fillRect(0, 0, 1, T); g.fillRect(0, 32, T, 1); g.fillRect(32, 0, 1, T); stain(g, 3, '62,48,24', T); }, 22),
    doorOff: doorTex(false, 'lift'), doorOn: doorTex(true, 'lift')
  }),
  morgue: () => ({
    walls: [plain(tileBase, 20),
      plain(g => { g.fillStyle = '#55595c'; g.fillRect(0, 0, T, T); for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) { const x = 3 + c * 31, y = 3 + r * 20; g.fillStyle = '#8e9499'; g.fillRect(x, y, 27, 17); g.fillStyle = '#6b7075'; g.fillRect(x, y + 15, 27, 2); g.fillStyle = '#2e3133'; g.fillRect(x + 9, y + 7, 9, 3); g.fillStyle = '#d9d4c4'; g.fillRect(x + 20, y + 3, 5, 3); } stain(g, 3, '60,50,30', T); }, 20),
      plain(g => { tileBase(g); scrawl(g, ['KEEP', 'WATCHING'], 'rgba(110,16,12,.9)', 'bold 8px monospace'); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(110,16,12,.7)'; g.fillRect(16 + rand(32), 32, 1, 4 + rand(14)); } }, 20)],
    floor: plain(g => { g.fillStyle = '#5a5b58'; g.fillRect(0, 0, T, T); stain(g, 6, '30,30,28', T); g.strokeStyle = 'rgba(25,25,22,.7)'; g.beginPath(); g.moveTo(5, 10); g.lineTo(20, 24); g.lineTo(18, 40); g.moveTo(44, 50); g.lineTo(60, 58); g.stroke(); }, 26),
    ceil: plain(g => { g.fillStyle = '#2c2e30'; g.fillRect(0, 0, T, T); g.fillStyle = '#55585a'; g.fillRect(20, 26, 24, 12); g.fillStyle = '#9a9e9c'; g.fillRect(22, 29, 20, 6); }, 16),
    doorOff: doorTex(false, 'steel'), doorOn: doorTex(true, 'steel')
  }),
  boiler: () => ({
    walls: [plain(brickBase, 18),
      plain(g => { brickBase(g); for (const x of [8, 44]) { g.fillStyle = '#6e4a2c'; g.fillRect(x, 0, 9, T); g.fillStyle = '#9a6c40'; g.fillRect(x + 2, 0, 2, T); g.fillStyle = '#4a311d'; for (let y = 6; y < T; y += 20) g.fillRect(x - 1, y, 11, 4); } }, 18),
      plain(g => { brickBase(g); g.fillStyle = '#3d3f3a'; g.fillRect(16, 12, 32, 30); g.fillStyle = '#d8d2bf'; g.beginPath(); g.arc(32, 26, 8, 0, 7); g.fill(); g.strokeStyle = '#a3241a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(32, 26); g.lineTo(37, 21); g.stroke(); g.fillStyle = '#d8d2bf'; g.font = '6px monospace'; g.textAlign = 'center'; g.fillText('PSI', 32, 40); }, 18)],
    floor: plain(g => { g.fillStyle = '#0f1d1c'; g.fillRect(0, 0, T, T); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(80,120,112,${.12 + R() * .25})`; g.fillRect(rand(T), rand(T), 3 + rand(9), 1); } stain(g, 3, '5,10,10', T); }, 10),
    ceil: plain(g => { g.fillStyle = '#1c1816'; g.fillRect(0, 0, T, T); g.fillStyle = '#3a2a20'; g.fillRect(0, 10, T, 6); g.fillRect(0, 40, T, 6); g.fillStyle = '#4c382a'; g.fillRect(0, 11, T, 1); g.fillRect(0, 41, T, 1); }, 16),
    doorOff: doorTex(false, 'hatch'), doorOn: doorTex(true, 'hatch')
  }),
  chapel: () => {
    const arch = g => { g.beginPath(); g.moveTo(19, 56); g.lineTo(19, 22); g.arc(32, 22, 13, Math.PI, 0); g.lineTo(45, 56); g.closePath(); };
    const glass = sprite((g, em) => {
      if (!em) { stoneBase(g); grit(g, 18); g.fillStyle = '#0d0b0a'; arch(g); g.fill(); }
      g.save(); arch(g); g.clip();
      const cols = ['#5e1712', '#16285e', '#5e4a14', '#1f4a2a', '#4a1650'];
      for (let y = 8; y < 56; y += 8) for (let x = 19; x < 45; x += 6) { g.fillStyle = cols[(x / 6 + y / 8 | 0) % cols.length]; g.fillRect(x + 1, y + 1, 5, 7); }
      g.restore();
    });
    return {
      walls: [plain(stoneBase, 18), glass, plain(g => { stoneBase(g); scrawl(g, ['IT HATES', 'THE LIGHT'], 'rgba(205,195,175,.55)', '8px monospace'); }, 18)],
      floor: plain(g => { for (let y = 0; y < T; y += 8) { const v = rand(16); g.fillStyle = `rgb(${54 + v},${36 + v / 2},${22})`; g.fillRect(0, y, T, 8); g.fillStyle = '#1a0f08'; g.fillRect(0, y, T, 1); g.fillRect((y * 7) % T, y, 1, 8); } stain(g, 3, '20,10,5', T); }, 18),
      ceil: plain(g => { g.fillStyle = '#15100c'; g.fillRect(0, 0, T, T); g.fillStyle = '#2a1c12'; g.fillRect(0, 0, 8, T); g.fillRect(32, 0, 8, T); }, 14),
      doorOff: doorTex(false, 'chapel'), doorOn: doorTex(true, 'chapel')
    };
  }
};
const SETS = {};
const getSet = key => SETS[key] || (SETS[key] = BUILD[key]());

let SPR = null;
const COATS = ['#3a4150', '#355040', '#5a2e2e', '#6b5a2a'];
function buildSprites() {
  const valve = on => sprite((g, em) => {
    if (!em) {
      g.fillStyle = '#4a4038'; g.fillRect(29, 40, 6, 24); g.fillStyle = '#5a4e44'; g.fillRect(20, 60, 24, 4);
      g.strokeStyle = '#8a1e14'; g.lineWidth = 2.5; g.beginPath(); g.arc(32, 36, 9, 0, 7); g.stroke();
      g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < 4; k++) { const an = k * Math.PI / 4 + (on ? .4 : 0); g.moveTo(32 + Math.cos(an) * 9, 36 + Math.sin(an) * 9); g.lineTo(32 - Math.cos(an) * 9, 36 - Math.sin(an) * 9); } g.stroke();
      g.fillStyle = '#333'; g.beginPath(); g.arc(32, 36, 2, 0, 7); g.fill();
    }
    g.fillStyle = on ? '#5dff7a' : '#ff3b2a'; g.fillRect(31, 50, 3, 3);
  });
  const candle = lit => sprite((g, em) => {
    if (!em) { g.fillStyle = '#5a4a2e'; g.fillRect(24, 60, 16, 4); g.fillRect(30, 56, 4, 4); g.fillStyle = '#d9d2bd'; g.fillRect(29, 40, 6, 16); g.fillStyle = '#b8b09a'; g.fillRect(29, 40, 6, 2); g.fillStyle = '#111'; g.fillRect(31, 37, 1, 3); }
    if (lit) { g.fillStyle = '#ff9a2a'; g.beginPath(); g.ellipse(31.5, 32, 3, 5, 0, 0, 7); g.fill(); g.fillStyle = '#fff1b0'; g.beginPath(); g.ellipse(31.5, 33, 1.3, 2.5, 0, 0, 7); g.fill(); }
    else { g.fillStyle = '#6a3020'; g.fillRect(31, 37, 1, 1); }
  });
  SPR = {
    fuse: sprite((g, em) => {
      if (!em) { g.fillStyle = '#7a6235'; g.fillRect(25, 38, 14, 5); g.fillRect(25, 59, 14, 5); g.fillStyle = 'rgba(200,200,190,.9)'; g.fillRect(27, 43, 10, 16); }
      g.fillStyle = '#ffb347'; g.fillRect(31, 43, 2, 16); g.fillStyle = '#c96a1c'; g.fillRect(28, 46, 2, 10); g.fillRect(34, 46, 2, 10);
    }),
    key: sprite((g, em) => {
      if (!em) { g.strokeStyle = '#b08d3c'; g.lineWidth = 2; g.beginPath(); g.arc(32, 44, 5, 0, 7); g.stroke(); g.fillStyle = '#b08d3c'; g.fillRect(31, 49, 2, 13); g.fillRect(33, 56, 4, 2); g.fillRect(33, 60, 3, 2); g.fillStyle = '#d8d0b8'; g.fillRect(37, 38, 9, 6); }
      g.fillStyle = '#ffe08a'; g.fillRect(28, 42, 2, 2); g.fillRect(36, 45, 1, 1);
    }),
    valveOff: valve(false), valveOn: valve(true), candleOff: candle(false), candleOn: candle(true),
    bat: sprite((g, em) => {
      if (!em) { g.fillStyle = '#2f3d2b'; g.fillRect(24, 44, 16, 20); g.fillStyle = '#b8b29a'; g.fillRect(24, 50, 16, 5); g.fillStyle = '#888'; g.fillRect(29, 41, 6, 3); }
      g.fillStyle = '#9dff6a'; g.fillRect(31, 58, 2, 2);
    }),
    cam: sprite((g, em) => {
      if (!em) { g.fillStyle = '#1b1b1d'; g.fillRect(22, 48, 20, 14); g.fillStyle = '#3a3a3e'; g.beginPath(); g.arc(32, 55, 5, 0, 7); g.fill(); g.fillStyle = '#777'; g.beginPath(); g.arc(32, 55, 3, 0, 7); g.fill(); g.fillStyle = '#cfcfcf'; g.fillRect(24, 49, 6, 3); g.fillStyle = '#d6c690'; g.fillRect(22, 61, 20, 1); }
      g.fillStyle = '#ff3030'; g.fillRect(38, 50, 2, 2);
    }),
    flareItem: sprite((g, em) => {
      if (!em) { g.save(); g.translate(32, 58); g.rotate(-.5); g.fillStyle = '#b3221a'; g.fillRect(-12, -2.5, 22, 5); g.fillStyle = '#e8e2d0'; g.fillRect(10, -2.5, 4, 5); g.restore(); }
      g.fillStyle = '#ff6a5a'; g.fillRect(41, 51, 2, 2);
    }),
    flareLit: sprite((g, em) => {
      if (!em) { g.fillStyle = '#8a1c15'; g.fillRect(30, 50, 4, 14); }
      g.fillStyle = '#ff4a3a'; g.beginPath(); g.ellipse(32, 43, 6, 9, 0, 0, 7); g.fill(); g.fillStyle = '#ffd6c8'; g.beginPath(); g.ellipse(32, 46, 2.5, 4, 0, 0, 7); g.fill();
    }),
    mate: COATS.map(coat => sprite((g, em) => {
      if (!em) {
        g.fillStyle = '#1f2228'; g.fillRect(27, 44, 4, 20); g.fillRect(33, 44, 4, 20);
        g.fillStyle = coat; g.fillRect(24, 22, 16, 24); g.fillRect(21, 24, 3, 17); g.fillRect(40, 24, 3, 9); g.fillRect(40, 31, 6, 3);
        g.fillStyle = '#c9b29a'; g.beginPath(); g.ellipse(32, 16, 5, 6, 0, 0, 7); g.fill(); g.fillStyle = '#2a1d14'; g.fillRect(27, 9, 10, 4);
        g.fillStyle = '#555'; g.fillRect(45, 29, 4, 6);
      }
      g.fillStyle = '#ffe9a8'; g.fillRect(46, 30, 3, 3);
    })),
    mateDown: COATS.map(coat => sprite((g, em) => {
      if (!em) { g.fillStyle = coat; g.fillRect(14, 56, 30, 7); g.fillStyle = '#1f2228'; g.fillRect(44, 57, 14, 5); g.fillStyle = '#c9b29a'; g.beginPath(); g.ellipse(10, 59, 5, 4, 0, 0, 7); g.fill(); }
      g.fillStyle = '#ff3b2f'; g.fillRect(31, 44, 2, 7); g.fillRect(28.5, 46.5, 7, 2);
    })),
    stalker: sprite((g, em) => {
      if (!em) {
        g.fillStyle = '#0c0a0a'; g.strokeStyle = '#0c0a0a';
        g.fillRect(27, 40, 3, 24); g.fillRect(34, 40, 3, 24);
        g.beginPath(); g.moveTo(24, 15); g.lineTo(40, 15); g.lineTo(37, 43); g.lineTo(27, 43); g.closePath(); g.fill();
        g.lineWidth = 2.2; g.beginPath(); g.moveTo(25, 17); g.quadraticCurveTo(16, 34, 19, 57); g.moveTo(39, 17); g.quadraticCurveTo(48, 34, 45, 57); g.stroke();
        g.lineWidth = 1; g.beginPath(); for (const [hx, s] of [[19, -1], [45, 1]]) for (let f = -1; f <= 1; f++) { g.moveTo(hx, 57); g.lineTo(hx + f * 1.5 + s, 62); } g.stroke();
        g.fillRect(30, 10, 4, 6);
        g.fillStyle = '#b8b0a3'; g.beginPath(); g.ellipse(32, 6, 4.6, 6.6, 0, 0, 7); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.ellipse(30.2, 5, 1.6, 2.2, 0, 0, 7); g.ellipse(33.8, 5, 1.6, 2.2, 0, 0, 7); g.fill(); g.fillRect(31, 9, 2, 3);
      }
      g.fillStyle = '#fff'; g.fillRect(30, 5, 1, 1); g.fillRect(34, 5, 1, 1);
    }),
    statue: sprite((g, em) => {
      if (em) return;
      const skin = '#c8b9a2', dark = '#8f8170';
      g.fillStyle = skin; g.fillRect(27, 42, 4, 22); g.fillRect(33, 42, 4, 22); g.fillRect(25, 18, 14, 25); g.fillRect(30, 12, 4, 7);
      g.fillStyle = dark; g.fillRect(27, 52, 4, 1); g.fillRect(33, 52, 4, 1); g.fillRect(25, 34, 14, 1);
      g.strokeStyle = skin; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(26, 20); g.lineTo(17, 29); g.lineTo(13, 21); g.moveTo(38, 20); g.lineTo(47, 29); g.lineTo(51, 21); g.stroke();
      g.fillStyle = dark; g.beginPath(); g.arc(17, 29, 1.5, 0, 7); g.arc(47, 29, 1.5, 0, 7); g.fill();
      g.fillStyle = skin; g.beginPath(); g.ellipse(32, 7, 6, 7, 0, 0, 7); g.fill();
      g.strokeStyle = '#5a5045'; g.lineWidth = 1; g.beginPath(); g.moveTo(35, 0); g.lineTo(31, 6); g.lineTo(34, 12); g.stroke();
      g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(29.5, 7, 1.6, 1.1, 0, 0, 7); g.ellipse(34.5, 7, 1.6, 1.1, 0, 0, 7); g.fill();
    }),
    blind: sprite((g, em) => {
      if (!em) {
        g.fillStyle = '#34413a'; g.beginPath(); g.moveTo(21, 21); g.lineTo(43, 19); g.lineTo(40, 47); g.lineTo(24, 47); g.closePath(); g.fill();
        g.fillRect(25, 46, 5, 18); g.fillRect(35, 46, 5, 18);
        g.strokeStyle = '#34413a'; g.lineWidth = 3; g.beginPath(); g.moveTo(23, 23); g.quadraticCurveTo(14, 40, 16, 62); g.moveTo(41, 22); g.quadraticCurveTo(50, 40, 48, 62); g.stroke();
        g.fillStyle = '#3c4a42'; g.beginPath(); g.arc(32, 17, 7, 0, 7); g.fill();
        g.fillStyle = '#0d0f0e'; for (let i = -8; i <= 8; i++) g.fillRect(32 + i, 10 + Math.abs(i) / 2, 1, 16 + rand(14));
        g.fillStyle = '#6f8f9a'; for (let i = 0; i < 14; i++) g.fillRect(18 + rand(30), 30 + rand(32), 1, 1 + rand(2));
      }
      g.fillStyle = '#7f9f90'; g.fillRect(29, 20, 1, 1); g.fillRect(35, 20, 1, 1);
    }),
    shade: sprite((g, em) => {
      if (!em) {
        g.fillStyle = '#040404';
        g.beginPath(); g.arc(32, 12, 7, 0, 7); g.fill();
        g.beginPath(); g.moveTo(26, 16); g.lineTo(38, 16); g.lineTo(48, 64); g.lineTo(16, 64); g.closePath(); g.fill();
        for (let i = 0; i < 26; i++) { const y = 18 + rand(46), w = 4 + y / 4; g.fillRect(32 + (R() < .5 ? -1 : 1) * (w / 2 + rand(8)) - 1, y, 2, 3 + rand(8)); }
        g.strokeStyle = '#040404'; g.lineWidth = 2; g.beginPath(); g.moveTo(27, 20); g.lineTo(12, 40); g.lineTo(9, 52); g.moveTo(37, 20); g.lineTo(52, 40); g.lineTo(55, 52); g.stroke();
      }
      g.fillStyle = '#f4f0e8'; g.fillRect(28, 11, 2, 1); g.fillRect(34, 11, 2, 1);
    })
  };
}

/* ---------- world state ---------- */
let stageIdx = 0, stage = STAGES[0], set = null, seed = 1;
let starts = [], map, floors, door, objs = [], items = [], flares = [], distCache, seen = new Uint8Array(MW * MH), miniT = 0;
let objDone = 0, unlocked = false, blackout = 0, boT = 0, buzzed = false;
let state = 'title', time = 0, runTime = 0, scareT = 0, scareKind = 'stalker', overT = 0, soloDeath = false, menuOpen = false;
let danger = 0, heartT = 0, heartPulse = 0, ambT = 8, breathT = 0, msgT = 0, noteT = 0, flashI = 0, flashFX = 0;
let inv = { flash: 1, flare: 1 }, stageInv = { flash: 1, flare: 1 };
const me = { slot: 0, doorT: 0, x: 1.5, y: 1.5, a: 0, stam: 1, exh: false, bat: 100, light: true, spr: false, mov: false, spd: 0, bob: 0, bobY: 0, step: 0, down: false, rv: 0, beamed: false, turning: false };
const others = []; // remote players: guests on the host; the host and other guests on a guest
const M = { x: 0, y: 0, tx: 0, ty: 0, st: 'wander', wx: 0, wy: 0, lx: 0, ly: 0, lost: 0, linger: 0, wake: 0, gone: 0, stun: 0, frozen: false, stuck: 0, tgt: 0,
  step: 0, sway: 0, cryT: 3, lastSt: 'wander', synced: false };
const keys = {};
const lampOn = p => (p === me ? me.light && me.bat > 0 && !me.down : p.lamp) && blackout <= 0;
const players = () => [me, ...others];
const alive = () => players().filter(p => !p.down);

/* ---------- map ---------- */
function bfs(c) {
  let f = distCache.get(c); if (f) return f;
  f = new Int16Array(MW * MH).fill(-1); const q = [c]; f[c] = 0;
  for (let h = 0; h < q.length; h++) { const k = q[h]; for (const o of [1, -1, MW, -MW]) { const n = k + o; if (map[n] === 0 && f[n] < 0) { f[n] = f[k] + 1; q.push(n); } } }
  distCache.set(c, f); return f;
}
const cellXY = i => [i % MW, (i / MW) | 0];
const centre = i => ({ x: i % MW + .5, y: ((i / MW) | 0) + .5 });
function genMap(sd, st) {
  srand = mulberry32(sd);
  map = new Uint8Array(MW * MH).fill(1); distCache = new Map();
  const stack = [[1, 1]]; map[idx(1, 1)] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]], srand).filter(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; return nx > 0 && ny > 0 && nx < MW - 1 && ny < MH - 1 && map[idx(nx, ny)] === 1; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[0]; map[idx(cx + dx / 2, cy + dy / 2)] = 0; map[idx(cx + dx, cy + dy)] = 0; stack.push([cx + dx, cy + dy]);
  }
  for (let i = 0; i < st.loops; i++) {
    const x = 1 + srandi(MW - 2), y = 1 + srandi(MH - 2); if (map[idx(x, y)] !== 1) continue;
    const h = map[idx(x - 1, y)] === 0 && map[idx(x + 1, y)] === 0 && map[idx(x, y - 1)] && map[idx(x, y + 1)];
    const v = map[idx(x, y - 1)] === 0 && map[idx(x, y + 1)] === 0 && map[idx(x - 1, y)] && map[idx(x + 1, y)];
    if (h || v) map[idx(x, y)] = 0;
  }
  for (let r = 0; r < st.rooms; r++) { const rx = 3 + srandi(MW - 9), ry = 3 + srandi(MH - 9); for (let y = ry; y < ry + 3; y++) for (let x = rx; x < rx + 3; x++) map[idx(x, y)] = 0; }
  const d0 = bfs(idx(1, 1));
  floors = []; for (let i = 0; i < MW * MH; i++) if (map[i] === 0 && d0[i] >= 0) floors.push(i);
  let best = -1, bestD = -1;
  for (let i = 0; i < MW * MH; i++) {
    const [x, y] = cellXY(i); if (!(x === 0 || y === 0 || x === MW - 1 || y === MH - 1)) continue;
    if ((x === 0 || x === MW - 1) && (y === 0 || y === MH - 1)) continue;
    const inner = x === 0 ? i + 1 : x === MW - 1 ? i - 1 : y === 0 ? i + MW : i - MW;
    if (map[inner] === 0 && d0[inner] > bestD) { bestD = d0[inner]; best = i; }
  }
  map[best] = 2; door = centre(best);
  starts = floors.slice().sort((a, b) => d0[a] - d0[b] || a - b).slice(0, MAXP);
  const used = new Set(starts);
  const dead = floors.filter(i => [1, -1, MW, -MW].filter(o => map[i + o] !== 0).length >= 3);
  const cands = shuffle(dead.filter(i => d0[i] > 5), srand).concat(shuffle(floors.filter(i => d0[i] > 5), srand));
  objs = [];
  for (const minSep of [8, 6, 4, 2, 0]) {
    for (const c of cands) {
      if (objs.length >= st.objN) break;
      const p = centre(c);
      if (used.has(c) || objs.some(o => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) < minSep)) continue;
      objs.push({ c, x: p.x, y: p.y, done: false, prog: 0, ph: srand() * 6, sndT: 0, spot: false }); used.add(c);
    }
    if (objs.length >= st.objN) break;
  }
  items = [];
  const pool = shuffle(floors.filter(i => d0[i] >= 4), srand);
  const place = (kind, n) => { for (const c of pool) { if (n <= 0) break; if (used.has(c)) continue; used.add(c); items.push({ kind, ...centre(c), got: false }); n--; } };
  place('cam', st.cams); place('flare', st.flares); place('bat', st.bats);
  const far = floors.filter(i => d0[i] >= 14);
  const mc = far.length ? far[srandi(far.length)] : floors[floors.length - 1];
  Object.assign(M, centre(mc));
  srand = R;
}

/* ---------- audio ---------- */
let AC = null, master, noiseBuf, brownBuf, canPan = false, droneGain, droneOsc = [];
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; return; }
  master = AC.createGain(); master.gain.value = .9;
  const comp = AC.createDynamicsCompressor(); master.connect(comp); comp.connect(AC.destination);
  canPan = typeof AC.createStereoPanner === 'function';
  const sr = AC.sampleRate; noiseBuf = AC.createBuffer(1, sr * 2, sr); brownBuf = AC.createBuffer(1, sr * 4, sr);
  const a = noiseBuf.getChannelData(0), b = brownBuf.getChannelData(0); let l = 0;
  for (let i = 0; i < a.length; i++) a[i] = R() * 2 - 1;
  for (let i = 0; i < b.length; i++) { l = (l + .02 * (R() * 2 - 1)) / 1.02; b[i] = l * 3.5; }
  droneGain = AC.createGain(); droneGain.gain.value = 0; droneGain.connect(master);
  droneOsc = [[1, .05, 'sine'], [1.06, .045, 'sine'], [2, .012, 'triangle']].map(([m, v, tp]) => {
    const o = AC.createOscillator(); o.type = tp; o.frequency.value = stage.drone * m; const g = AC.createGain(); g.gain.value = v; o.connect(g); g.connect(droneGain); o.start(); return [o, m];
  });
  const bn = AC.createBufferSource(); bn.buffer = brownBuf; bn.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350;
  const bg = AC.createGain(); bg.gain.value = .35; bn.connect(lp); lp.connect(bg); bg.connect(droneGain); bn.start();
  droneGain.gain.setTargetAtTime(1, AC.currentTime, 2);
}
function setDrone(f) { if (!AC) return; for (const [o, m] of droneOsc) o.frequency.setTargetAtTime(f * m, AC.currentTime, 1.5); }
function out(pan) { if (canPan && pan) { const p = AC.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(master); return p; } return master; }
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
function noise({ dur = .1, f = 1000, q = 1, type = 'bandpass', vol = .2, pan = 0, at = 0, a = .005 }) {
  if (!AC || vol < .002) return; const t = AC.currentTime + at;
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = AC.createGain(); env(g, t, a, vol, dur);
  s.connect(fl); fl.connect(g); g.connect(out(pan)); s.start(t, R() * 1.5); s.stop(t + dur + .05);
}
function tone({ f = 440, f2 = 0, dur = .3, type = 'sine', vol = .2, pan = 0, at = 0, a = .01 }) {
  if (!AC || vol < .002) return; const t = AC.currentTime + at;
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = AC.createGain(); env(g, t, a, vol, dur); o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + .05);
}
const SFX = {
  step() { noise({ dur: .07, f: 700 + R() * 500, q: .8, vol: .1 }); noise({ dur: .09, f: 140, type: 'lowpass', vol: .16 }); },
  splash() { noise({ dur: .16, f: 1400 + R() * 600, q: .6, vol: .1, a: .02 }); noise({ dur: .18, f: 260, type: 'lowpass', vol: .12 }); },
  heart(v) { tone({ f: 62, f2: 38, dur: .14, vol: v }); tone({ f: 58, f2: 36, dur: .16, vol: v * .7, at: .17 }); },
  mstep(v, pan) { tone({ f: 52, f2: 28, dur: .28, vol: v, pan }); noise({ dur: .12, f: 260, type: 'lowpass', vol: v * .7, pan }); },
  scrape(v, pan) { noise({ dur: .4, f: 150, q: 2, type: 'lowpass', vol: v * .9, pan, a: .04 }); noise({ dur: .3, f: 760, q: 3, vol: v * .25, pan }); },
  slosh(v, pan) { noise({ dur: .35, f: 520, q: .7, vol: v * .6, pan, a: .05 }); noise({ dur: .3, f: 180, type: 'lowpass', vol: v * .5, pan }); },
  growl(v, pan) {
    if (!AC) return; const t = AC.currentTime, o = out(pan);
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 4;
    const g = AC.createGain(); env(g, t, .25, v, 1.6); lp.connect(g); g.connect(o);
    for (const f of [57, 61.5]) {
      const s = AC.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(f, t); s.frequency.linearRampToValueAtTime(f * .72, t + 1.6);
      const lfo = AC.createOscillator(); lfo.frequency.value = 7 + R() * 5; const lg = AC.createGain(); lg.gain.value = 6;
      lfo.connect(lg); lg.connect(s.frequency); s.connect(lp); s.start(t); lfo.start(t); s.stop(t + 1.7); lfo.stop(t + 1.7);
    }
    noise({ dur: 1.4, f: 520, q: 1.5, vol: v * .5, pan, a: .3 });
  },
  gurgle(v, pan) { noise({ dur: 1.3, f: 320, q: 9, vol: v * .7, pan, a: .2 }); tone({ f: 85, f2: 48, dur: 1.1, type: 'triangle', vol: v * .3, pan, a: .1 }); noise({ dur: .6, f: 900, q: 4, vol: v * .2, pan, at: .5 }); },
  whisper(v, pan) { noise({ dur: 1.6, f: 2700, q: 8, vol: v * .12, pan, a: .6 }); noise({ dur: 1.3, f: 3300, q: 10, vol: v * .08, pan: -pan * .4, at: .35, a: .5 }); },
  click() { noise({ dur: .02, f: 2600, q: 2, vol: .16 }); },
  pickup(v = 1, pan = 0) { tone({ f: 311, dur: 1.3, type: 'triangle', vol: .1 * v, pan }); tone({ f: 329.6, dur: 1.3, type: 'triangle', vol: .08 * v, pan, at: .06 }); tone({ f: 622, dur: .9, vol: .04 * v, pan, at: .1 }); },
  item(v = 1, pan = 0) { tone({ f: 880, f2: 1320, dur: .12, type: 'square', vol: .04 * v, pan }); noise({ dur: .05, f: 3000, vol: .08 * v, pan }); },
  power(v = 1) { tone({ f: 40, f2: 62, dur: 2.4, type: 'sawtooth', vol: .07 * v, a: .6 }); tone({ f: 120, dur: 2.2, vol: .05 * v, a: 1 }); },
  ding() { tone({ f: 880, dur: 1.8, vol: .18 }); tone({ f: 659, dur: 2.2, vol: .14, at: .45 }); },
  breath() { noise({ dur: .55, f: 900, q: .9, vol: .06, a: .18 }); },
  scream() { tone({ f: 950, f2: 160, dur: 1.6, type: 'sawtooth', vol: .32 }); tone({ f: 1400, f2: 240, dur: 1.4, type: 'square', vol: .1 }); noise({ dur: 1.6, f: 1500, type: 'highpass', vol: .5, a: .01 }); tone({ f: 60, f2: 30, dur: 1, vol: .5 }); },
  farScream(v, pan) { tone({ f: 700, f2: 200, dur: 1.2, type: 'sawtooth', vol: .12 * v, pan }); noise({ dur: 1.2, f: 1200, q: 1, vol: .15 * v, pan }); },
  flash(v = 1, pan = 0) { tone({ f: 1800, f2: 4200, dur: .22, type: 'sine', vol: .03 * v, pan }); noise({ dur: .09, f: 3500, type: 'highpass', vol: .35 * v, pan, at: .22 }); tone({ f: 140, f2: 60, dur: .15, vol: .2 * v, pan, at: .22 }); },
  flare(v = 1, pan = 0) { noise({ dur: 1.4, f: 2600, type: 'highpass', vol: .25 * v, pan, a: .02 }); noise({ dur: 2, f: 900, q: .8, vol: .1 * v, pan, a: .3 }); },
  crackle(v = 1, pan = 0) { noise({ dur: .05, f: 3000 + R() * 2000, q: 2, vol: .05 * v, pan }); },
  banish(v = 1, pan = 0) { noise({ dur: .9, f: 700, q: 1.2, vol: .35 * v, pan, a: .7 }); tone({ f: 120, f2: 1400, dur: .85, type: 'sawtooth', vol: .07 * v, pan, a: .6 }); },
  valve(v = 1, pan = 0) { tone({ f: 310, dur: .25, type: 'triangle', vol: .14 * v, pan }); tone({ f: 467, dur: .2, type: 'triangle', vol: .08 * v, pan, at: .02 }); noise({ dur: .05, f: 2200, vol: .12 * v, pan }); },
  tick(v = 1, pan = 0) { noise({ dur: .35, f: 400, type: 'lowpass', vol: .1 * v, pan, a: .15 }); },
  buzz(v = 1) { tone({ f: 55, dur: .45, type: 'sawtooth', vol: .1 * v }); tone({ f: 110, dur: .45, type: 'sawtooth', vol: .04 * v }); },
  revive(v = 1, pan = 0) { [523, 659, 784].forEach((f, i) => tone({ f, dur: .5, type: 'triangle', vol: .08 * v, pan, at: i * .12 })); },
  join() { tone({ f: 440, dur: .4, type: 'triangle', vol: .08 }); tone({ f: 660, dur: .5, type: 'triangle', vol: .08, at: .15 }); },
  ambient() {
    const pan = R() * 2 - 1, k = rand(5);
    if (k === 0) for (let i = 0; i < 3; i++) noise({ dur: .14, f: 180, type: 'lowpass', vol: .28, pan, at: i * .34 });
    else if (k === 1) { noise({ dur: 1.5, f: 2400, q: 7, vol: .05, pan, a: .5 }); noise({ dur: 1.2, f: 3100, q: 9, vol: .035, pan: -pan * .5, at: .4, a: .4 }); }
    else if (k === 2) tone({ f: 214, f2: 158, dur: 1.8, type: 'triangle', vol: .03, pan, a: .3 });
    else if (k === 3) { tone({ f: 1500, f2: 500, dur: .08, vol: .05, pan }); tone({ f: 1400, f2: 480, dur: .08, vol: .04, pan, at: .9 }); }
    else { tone({ f: 300, f2: 290, dur: 2.5, vol: .025, pan, a: 1 }); tone({ f: 317, f2: 305, dur: 2.5, vol: .02, pan, a: 1 }); }
  }
};
function panTo(x, y) { const rx = x - me.x, ry = y - me.y, d = Math.hypot(rx, ry) || 1; return (-Math.sin(me.a) * rx + Math.cos(me.a) * ry) / d; }
function sfxAt(n, x, y, range = 16) { const d = Math.hypot(x - me.x, y - me.y), k = clamp(1 - d / range, 0, 1); if (k > .03 && SFX[n]) SFX[n](Math.max(k, .15), panTo(x, y)); }

/* ---------- networking (PeerJS, host-authoritative star: the host plus up to 3 guests) ---------- */
const PREFIX = 'ashgrove-coop-v6-';
const net = { role: null, peer: null, conn: null, open: false, code: '', sendT: 0, gotSnap: false };
const isGuest = () => net.role === 'guest';
const netLive = () => isGuest() ? net.open : others.length > 0;
function rawSend(c, o) { if (c) { try { c.send(o); } catch (e) {} } }
function send(o, skip) { if (isGuest()) { if (net.open) rawSend(net.conn, o); } else for (const q of others) if (q !== skip) rawSend(q.conn, o); }
function sendTo(q, o) { if (q && q.conn) rawSend(q.conn, o); }
function makeOther(slot) { return { slot, conn: null, x: 1.5, y: 1.5, a: 0, rx: 1.5, ry: 1.5, lamp: true, spr: false, mov: false, spd: 0, down: false, rv: 0, beamed: false, turning: false, seen: false, doorT: 0 }; }
const otherBySlot = slot => others.find(o => o.slot === slot);
function freeSlot() { for (let k = 1; k < MAXP; k++) if (!otherBySlot(k)) return k; return -1; }
const rosterSlots = () => [0, ...others.map(o => o.slot)];
function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const el = document.createElement('script'); el.src = 'vendor/peerjs.min.js'; el.onload = () => window.Peer ? res() : rej(new Error('PeerJS missing')); el.onerror = () => rej(new Error(t('errLib'))); document.head.appendChild(el); });
}
function peerOpts() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  const custom = QS.get('peer'); if (custom) { const [host, port] = custom.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: false }); }
  return o;
}
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 4 }, () => CODE_CHARS[rand(CODE_CHARS.length)]).join('');
function lobbyStatus(text) { $('lobbyStatus').textContent = text; }
function closeNet() {
  try { if (net.conn) net.conn.close(); } catch (e) {}
  for (const q of others) { try { if (q.conn) q.conn.close(); } catch (e) {} }
  try { if (net.peer) net.peer.destroy(); } catch (e) {}
  Object.assign(net, { role: null, peer: null, conn: null, open: false, code: '', gotSnap: false });
  others.length = 0; me.slot = 0;
}
function lobbyRefresh() {
  if (state !== 'lobby' || net.role !== 'host') return;
  lobbyStatus(others.length ? t('lobbyCount', { n: others.length + 1, max: MAXP }) : t('waitingJoin'));
  $('lobbyGo').disabled = !others.length;
}
async function hostRoom() {
  closeNet(); net.role = 'host';
  lobbyStatus(t('opening')); $('roomCode').textContent = '····'; $('lobbyGo').disabled = true;
  try { await loadPeerLib(); } catch (e) { lobbyStatus(e.message); return; }
  const tryOpen = attempt => {
    const code = makeCode(); const peer = new Peer(PREFIX + code, peerOpts()); net.peer = peer;
    peer.on('open', () => { net.code = code; $('roomCode').textContent = code; lobbyRefresh(); });
    peer.on('connection', hostAccept);
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
      if (net.role === 'host' && state === 'lobby' && !others.length) lobbyStatus(netError(e));
    });
    peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} });
  };
  tryOpen(0);
}
function hostAccept(c) {
  c.on('data', m => onHostData(c, m));
  c.on('close', () => hostDrop(c));
  c.on('error', () => {});
}
function hostDrop(c) {
  const q = others.find(o => o.conn === c); if (!q) return;
  others.splice(others.indexOf(q), 1);
  send({ t: 'roster', slots: rosterSlots() }); updateHUD(true);
  if (state === 'lobby') lobbyRefresh();
  else if (state === 'play') { say(t('teammateLeft', { n: q.slot + 1 }), 4); if (!alive().length && overT <= 0) overT = 1.8; }
}
function onHostData(c, m) {
  if (!m || typeof m !== 'object') return;
  let q = others.find(o => o.conn === c);
  if (m.t === 'hello') {
    if (q) return;
    if (m.v !== VERSION) { rawSend(c, { t: 'old' }); if (state === 'lobby') lobbyStatus(t('versionGuest')); return; }
    if (state !== 'lobby') { rawSend(c, { t: 'started' }); setTimeout(() => c.close(), 400); return; }
    const slot = freeSlot();
    if (slot < 0) { rawSend(c, { t: 'full' }); setTimeout(() => c.close(), 400); return; }
    q = makeOther(slot); q.conn = c; others.push(q); SFX.join();
    rawSend(c, { t: 'welcome', slot }); send({ t: 'roster', slots: rosterSlots() }); lobbyRefresh(); updateHUD(true);
    return;
  }
  if (!q) return;
  if (m.t === 'me') {
    q.x = m.x; q.y = m.y; q.a = m.a; q.lamp = !!m.l; q.spr = !!m.s; q.spd = m.v || 0; q.mov = q.spd > .1;
    if (!q.seen) { q.seen = true; q.rx = m.x; q.ry = m.y; }
  } else if (m.t === 'use') { if (state === 'play') useWeapon(q, m.w); }
  else if (m.t === 'spot') { const o = objs[m.i]; if (o) o.spot = true; send({ t: 'spot', i: m.i }, q); }
  else if (m.t === 'bye') { try { c.close(); } catch (e) {} hostDrop(c); }
}
async function joinRoom(code) {
  closeNet(); net.role = 'guest'; net.code = code;
  lobbyStatus(t('looking', { c: code })); $('lobbyGo').disabled = true;
  try { await loadPeerLib(); } catch (e) { lobbyStatus(e.message); $('lobbyGo').disabled = false; return; }
  const peer = new Peer(undefined, peerOpts()); net.peer = peer;
  peer.on('open', () => {
    guestAttach(peer.connect(PREFIX + code, { reliable: true }));
    setTimeout(() => { if (net.role === 'guest' && !net.open && state === 'lobby') { lobbyStatus(t('noAnswer', { c: code })); $('lobbyGo').disabled = false; } }, 12000);
  });
  peer.on('error', e => { if (state === 'lobby') { lobbyStatus(e.type === 'peer-unavailable' ? t('noRoom', { c: code }) : netError(e)); $('lobbyGo').disabled = false; } });
}
function netError(e) {
  if (e.type === 'browser-incompatible') return t('errBrowser');
  if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') return t('errServer');
  return t('errOther', { e: e.type || 'unknown' });
}
function guestAttach(c) {
  net.conn = c;
  c.on('open', () => { net.open = true; rawSend(c, { t: 'hello', v: VERSION }); });
  c.on('data', onGuestData);
  c.on('close', guestClosed);
  c.on('error', () => {});
}
function guestClosed() {
  const was = net.open; net.open = false; net.conn = null;
  if (!was) return;
  const st = state; closeNet();
  if (st !== 'title') showEnd(t('lostTitle'), t('lostText'), { dead: true, guestEnd: true });
}
function syncRoster(slots) {
  for (let i = others.length - 1; i >= 0; i--) if (!slots.includes(others[i].slot)) others.splice(i, 1);
  for (const k of slots) if (k !== me.slot && !otherBySlot(k)) others.push(makeOther(k));
  if (state === 'lobby') lobbyStatus(t('joinedAs', { n: me.slot + 1, count: slots.length, max: MAXP }));
  updateHUD(true);
}
function onGuestData(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome': me.slot = m.slot; SFX.join(); break;
    case 'roster': syncRoster(m.slots); break;
    case 'full': lobbyStatus(t('full')); $('lobbyGo').disabled = false; break;
    case 'started': lobbyStatus(t('started')); $('lobbyGo').disabled = false; break;
    case 'old': lobbyStatus(t('versionHost')); break;
    case 'spot': { const o = objs[m.i]; if (o) o.spot = true; break; }
    case 'stage': inv = { ...m.inv }; unlockStage(m.n); if (m.slots) syncRoster(m.slots); loadStage(m.n, m.seed); showCard(); break;
    case 'begin': if (state === 'card') startPlay(); break;
    case 's': applySnap(m); break;
    case 'ev': onEvent(m); break;
    case 'over': { if (m.won) unlockStage(STAGES.length - 1); const c = endCopy(m); showEnd(c.title, c.text, { dead: !m.won, guestEnd: true }); break; }
    case 'bye': closeNet(); showEnd(t('leftTitle'), t('leftText'), { guestEnd: true }); break;
  }
}
const stageMsg = () => ({ t: 'stage', n: stageIdx, seed, inv, slots: rosterSlots() });
function onEvent(m) {
  switch (m.k) {
    case 'say': say(t(m.key, m.p), m.d || 3.5); break;
    case 'note': showWardNote(m.i); break;
    case 'sfx': sfxAt(m.n, m.x, m.y, m.r || 16); break;
    case 'bat': me.bat = Math.min(100, me.bat + 45); break;
    case 'caught': me.down = true; startScare(); break;
    case 'revived': me.down = false; me.rv = 0; say(t('revivedYou')); break;
  }
}
function hostSnapshot() {
  send({ t: 's', m: [r2(M.x), r2(M.y), M.st, M.gone > 0 ? 1 : 0, M.stun > 0 ? 1 : 0, M.frozen ? 1 : 0],
    ps: players().map(q => [q.slot, r2(q.x), r2(q.y), r2(q.a), lampOn(q) ? 1 : 0, q.down ? 1 : 0, q.mov ? 1 : 0, r2(q.rv), q.beamed ? 1 : 0]),
    o: objs.map(o => o.done ? 1 : r2(Math.min(.99, o.prog))), it: items.map(i => i.got ? 1 : 0).join(''),
    fl: flares.map(f => [r2(f.x), r2(f.y), r2(f.t)]), bo: blackout > 0 ? 1 : 0, inv: [inv.flash, inv.flare],
    ul: unlocked ? 1 : 0, od: objDone });
}
function applySnap(s) {
  if (state !== 'play') return;
  const wasGone = M.gone > 0;
  M.tx = s.m[0]; M.ty = s.m[1]; M.st = s.m[2]; M.gone = s.m[3]; M.stun = s.m[4]; M.frozen = !!s.m[5];
  if (!net.gotSnap || (wasGone && !M.gone)) { M.x = M.tx; M.y = M.ty; }
  const present = new Set();
  for (const [slot, x, y, a, l, d, mv, rv, bm] of s.ps) {
    present.add(slot);
    if (slot === me.slot) { me.rv = rv; me.beamed = !!bm; continue; }
    let q = otherBySlot(slot); if (!q) { q = makeOther(slot); others.push(q); }
    Object.assign(q, { x, y, a, lamp: !!l, down: !!d, mov: !!mv, rv });
    if (!q.seen) { q.seen = true; q.rx = x; q.ry = y; }
  }
  for (let i = others.length - 1; i >= 0; i--) if (!present.has(others[i].slot)) others.splice(i, 1);
  net.gotSnap = true;
  objs.forEach((o, i) => { const v = s.o[i]; o.done = v === 1; o.prog = v; });
  items.forEach((it, i) => { it.got = s.it[i] === '1'; });
  flares = s.fl.map(([x, y, tt]) => ({ x, y, t: tt }));
  blackout = s.bo ? 1 : 0; inv.flash = s.inv[0]; inv.flare = s.inv[1];
  unlocked = !!s.ul; objDone = s.od;
}
// host helpers that reach every player
// messages travel as keys so each player reads them in their own language
function tell(p, key, prm, d) { if (p === me) say(t(key, prm), d); else sendTo(p, { t: 'ev', k: 'say', key, p: prm, d }); }
function sayAll(key, prm, d) { say(t(key, prm), d); send({ t: 'ev', k: 'say', key, p: prm, d }); }
function noteAll(i) { showWardNote(i); send({ t: 'ev', k: 'note', i }); }
function showWardNote(i) { const n = L().notes[i]; if (n) showNote(n[0], n[1]); }
function endCopy(m) {
  if (m.won) return { title: t(m.coop ? 'winCoop' : 'winSolo'), text: t('winText', { t: fmt(m.time) }) + (m.best ? t('best', { t: fmt(m.best) }) : '') };
  return { title: t(m.coop ? 'deadCoop' : 'deadSolo'), text: t('deadText', { n: m.n, t: fmt(m.time) }) };
}
function emit(n, x, y, skip, r) { sfxAt(n, x, y, r); send({ t: 'ev', k: 'sfx', n, x: r2(x), y: r2(y), r }, skip || undefined); }

/* ---------- HUD ---------- */
let lastHud = '';
function buildHUD() {
  $('objLbl').textContent = stx().objName;
  const box = $('objIcons'); box.innerHTML = '';
  for (let i = 0; i < stage.objN; i++) box.appendChild(document.createElement('b'));
  updateHUD(true);
}
function updateHUD(force) {
  const up = others.filter(q => !q.down).length, dn = others.length - up;
  const key = [objDone, Math.round(me.bat), Math.round(me.stam * 50), inv.flash, inv.flare, up, dn, net.role, LANG].join('|');
  if (!force && key === lastHud) return; lastHud = key;
  [...$('objIcons').children].forEach((b, i) => b.classList.toggle('on', i < objDone));
  const bb = $('batBar'); bb.style.width = me.bat + '%'; bb.classList.toggle('low', me.bat < 20);
  $('stamBar').style.width = (me.stam * 100) + '%';
  $('kit').textContent = t('kit', { f: inv.flash, r: inv.flare });
  $('tFlash').textContent = t('tFlash', { n: inv.flash }); $('tFlare').textContent = t('tFlare', { n: inv.flare });
  $('tFlash').classList.toggle('empty', !inv.flash); $('tFlare').classList.toggle('empty', !inv.flare);
  $('mateRow').hidden = !net.role;
  const msEl = $('mateState'); msEl.textContent = others.length ? t('teamState', { up, down: dn }) : t('mateGone'); msEl.classList.toggle('down', dn > 0 || !others.length);
}
function say(t, dur = 3.5) { const m = $('msg'); m.textContent = t; m.style.opacity = 1; msgT = dur; }
function showNote(tag, text) { const n = $('note'); n.innerHTML = ''; const s = document.createElement('span'); s.className = 'tag'; s.textContent = tag; n.append(s, text); n.style.opacity = 1; noteT = 7; }
function hideTexts() { $('note').style.opacity = 0; $('msg').style.opacity = 0; $('prog').textContent = ''; msgT = noteT = 0; }

/* ---------- monster (host) ---------- */
function los(x0, y0, x1, y1) { const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.hypot(dx, dy) / .1); for (let i = 1; i < n; i++) { const t = i / n; if (map[idx((x0 + dx * t) | 0, (y0 + dy * t) | 0)]) return false; } return true; }
function inView(p, x, y, half) { let an = Math.atan2(y - p.y, x - p.x) - p.a; an = Math.atan2(Math.sin(an), Math.cos(an)); return Math.abs(an) < half && los(p.x, p.y, x, y); }
function watching(p) { const d = dist(p, M); if (d > 14) return false; return ((lampOn(p) && d < 12) || d < 2.5) && inView(p, M.x, M.y, .62); }
function pickWander() {
  let pool = floors; const ps = alive();
  if (ps.length && R() < .55) {
    const p = ps[rand(ps.length)], x0 = p.x | 0, y0 = p.y | 0;
    const near = floors.filter(i => { const [x, y] = cellXY(i), d = Math.max(Math.abs(x - x0), Math.abs(y - y0)); return d <= 6 && d >= 2; });
    if (near.length) pool = near;
  }
  const c = pool[rand(pool.length)]; M.wx = c % MW + .5; M.wy = ((c / MW) | 0) + .5;
}
function blockedAt(nx, ny) {
  const cur = { x: M.x, y: M.y };
  if (stage.mon !== 'blind') for (const f of flares) { const dn = Math.hypot(f.x - nx, f.y - ny); if (f.t > 0 && dn < 2.4 && dn < dist(f, cur)) return true; }
  if (stage.mon === 'shade') for (const o of objs) { const dn = Math.hypot(o.x - nx, o.y - ny); if (o.done && dn < 1.8 && dn < dist(o, cur)) return true; }
  return false;
}
function moveToward(tx, ty, step) {
  const mc = idx(M.x | 0, M.y | 0), tc = idx(tx | 0, ty | 0);
  let gx = tx, gy = ty;
  if (mc !== tc && map[tc] === 0) {
    const f = bfs(tc); let bn = -1, bd = f[mc] < 0 ? 1e9 : f[mc];
    for (const o of [1, -1, MW, -MW]) { const n = mc + o; if (f[n] >= 0 && f[n] < bd) { bd = f[n]; bn = n; } }
    if (bn >= 0) { gx = bn % MW + .5; gy = ((bn / MW) | 0) + .5; }
  }
  const dx = gx - M.x, dy = gy - M.y, d = Math.hypot(dx, dy);
  if (d < 1e-4) return 0;
  const s = Math.min(step, d), nx = M.x + dx / d * s, ny = M.y + dy / d * s;
  if (blockedAt(nx, ny)) { M.stuck += 1 / 60; return 0; }
  M.stuck = 0; M.x = nx; M.y = ny; return s;
}
function respawnMonster() {
  const ps = alive();
  // come back somewhere random, well away from everyone, and stand still a moment before moving
  const awayFrom = r => floors.filter(i => { const c = centre(i); return ps.every(p => dist(p, c) >= r); });
  let pool = awayFrom(12); if (!pool.length) pool = awayFrom(9); if (!pool.length) pool = floors;
  Object.assign(M, centre(pool[rand(pool.length)]));
  M.st = 'wander'; M.stun = 0; M.gone = 0; M.lost = 0; M.stuck = 0; M.wake = time + 3;
  const c = floors[rand(floors.length)]; M.wx = c % MW + .5; M.wy = ((c / MW) | 0) + .5;
}
const BANISH_FLARE = 35, BANISH_FLASH = 30; // seconds a weapon keeps the monster away
function banish(sec, msg) {
  emit('banish', M.x, M.y, false, 20); M.gone = sec; M.stun = 0;
  if (msg) sayAll(msg);
}
function hearNoise(x, y, r) { if (stage.mon === 'blind' && M.gone <= 0 && Math.hypot(x - M.x, y - M.y) < r) { M.st = 'hunt'; M.lx = x; M.ly = y; M.linger = 0; } }
function hostMonster(dt) {
  for (const q of players()) q.beamed = false;
  if (M.gone > 0) { M.gone -= dt; if (M.gone <= 0) respawnMonster(); return 0; }
  if (time < M.wake) return 0;
  if (M.stun > 0) { M.stun -= dt; return 0; }
  const ps = alive(); if (!ps.length) return 0;
  let near = ps[0]; for (const p of ps) if (dist(p, M) < dist(near, M)) near = p;
  const k = objDone; let tx = M.wx, ty = M.wy, sp = 0;
  if (stage.mon === 'stalker') {
    const seen = ps.find(p => { const d = dist(p, M); return d < 1.5 || (d < (lampOn(p) ? 11 : 3.2) && los(M.x, M.y, p.x, p.y)); });
    if (seen) { M.st = 'hunt'; M.lost = 0; M.tgtP = seen; M.lx = seen.x; M.ly = seen.y; }
    else {
      const heard = ps.find(p => (p.spr && p.mov && dist(p, M) < 9) || (p.mov && dist(p, M) < 2.4));
      if (heard && M.st !== 'hunt') { M.st = 'search'; M.lx = heard.x; M.ly = heard.y; M.linger = 0; }
      else if (M.st === 'hunt') {
        M.lost += dt; const tp = players().includes(M.tgtP) ? M.tgtP : me;
        if (M.lost < 1.6 && !tp.down) { M.lx = tp.x; M.ly = tp.y; }
        if (M.lost > 4.5) { M.st = 'search'; M.linger = 0; }
      }
    }
    if (M.st === 'hunt') { tx = M.lx; ty = M.ly; sp = 2.3 + k * .17; }
    else if (M.st === 'search') { tx = M.lx; ty = M.ly; sp = 1.75 + k * .1; }
    else sp = 1.0 + k * .1;
  } else if (stage.mon === 'statue') {
    M.frozen = ps.some(watching);
    if (M.frozen) M.st = 'still'; else { M.st = 'hunt'; tx = near.x; ty = near.y; sp = 1.9 + k * .15; }
  } else if (stage.mon === 'blind') {
    const lure = flares.find(f => f.t > 0);
    if (lure) { M.st = 'hunt'; M.lx = lure.x; M.ly = lure.y; if (dist(lure, M) < 1.3) { banish(BANISH_FLARE, 'drownedBanish'); return 0; } }
    else {
      let heard = null, hd = 1e9;
      for (const p of ps) {
        const d = dist(p, M), r = p.turning ? 14 : !p.mov ? 0 : p.spr ? 12 : p.spd > 1.3 ? 4.5 : 1.4;
        if ((d < r || d < 1.1) && d < hd) { heard = p; hd = d; }
      }
      if (heard) { M.st = 'hunt'; M.lx = heard.x; M.ly = heard.y; M.linger = 0; }
      else if (M.st === 'hunt') { M.st = 'search'; M.linger = 0; }
    }
    if (M.st === 'hunt') { tx = M.lx; ty = M.ly; sp = 2.4 + k * .12; }
    else if (M.st === 'search') { tx = M.lx; ty = M.ly; sp = 1.6; }
    else sp = 1.05;
  } else {
    const beamers = ps.filter(p => lampOn(p) && dist(p, M) < 8 && inView(p, M.x, M.y, .32));
    for (const p of beamers) p.beamed = true;
    if (beamers.length) M.st = 'held';
    else { M.st = 'hunt'; tx = near.x; ty = near.y; sp = (lampOn(near) ? 1.15 : 1.85) + k * .1; }
  }
  const moved = sp > 0 ? moveToward(tx, ty, sp * dt) : 0;
  const arrived = Math.hypot(tx - M.x, ty - M.y) < .3;
  if (M.st === 'search' && arrived) { M.linger += dt; if (M.linger > 2.5) { M.st = 'wander'; pickWander(); } }
  if (M.st === 'wander' && (arrived || M.stuck > 2)) { pickWander(); M.stuck = 0; }
  if (M.st === 'hunt' && stage.mon === 'stalker' && arrived && M.lost > 1.6) { M.st = 'search'; M.linger = 0; }
  if (M.stuck > 3 && stage.mon !== 'shade') { M.st = 'wander'; pickWander(); M.stuck = 0; }
  if (!(stage.mon === 'statue' && M.frozen)) for (const p of ps) if (dist(p, M) < .55) { caught(p); break; }
  return moved;
}
function caught(p) {
  if (p.down) return;
  p.down = true; p.rv = 0;
  if (p === me) startScare(); else { sendTo(p, { t: 'ev', k: 'caught' }); emit('farScream', p.x, p.y, p, 30); }
  if (others.length) {
    M.gone = 9; M.stun = 0;
    if (!alive().length) overT = 1.8;
    else for (const q of alive()) tell(q, 'partnerDown', null, 5);
  } else soloDeath = true;
}

/* ---------- weapons ---------- */
function useWeapon(p, w) {
  if (!(w === 'flash' || w === 'flare')) return;
  if (inv[w] <= 0) { tell(p, w === 'flash' ? 'noFlash' : 'noFlare', null, 2.5); return; }
  if (p.down) return;
  inv[w]--;
  const d = dist(p, M), here = M.gone <= 0 && time >= 0;
  if (w === 'flash') {
    emit('flash', p.x, p.y, p === me ? null : p);
    if (p === me) flashFX = 1;
    hearNoise(p.x, p.y, 10);
    if (stage.mon === 'blind') { tell(p, 'flashBlind'); return; }
    if (here && d < 9 && inView(p, M.x, M.y, .5)) {
      if (stage.mon === 'shade') banish(BANISH_FLASH, 'flashShade');
      else if (stage.mon === 'statue') { M.stun = 7.5; tell(p, 'flashStatue'); }
      else { M.stun = 5.5; M.st = 'search'; M.lx = p.x; M.ly = p.y; tell(p, 'flashStun'); }
    } else tell(p, 'flashMiss', null, 2);
  } else {
    flares.push({ x: p.x, y: p.y, t: 10, ct: 0 });
    emit('flare', p.x, p.y, false);
    if (stage.mon === 'blind') { if (here) tell(p, 'flareWater'); return; }
    if (here && d < 3.5) banish(BANISH_FLARE, 'flareBanish');
    else tell(p, 'flareLit', null, 2.5);
  }
}
function pressWeapon(w) {
  if (state !== 'play' || menuOpen || me.down || scareT > 0) return;
  if (!isGuest()) { useWeapon(me, w); updateHUD(); return; }
  if (inv[w] <= 0) { say(t(w === 'flash' ? 'noFlash' : 'noFlare'), 2.5); return; }
  if (w === 'flash') { flashFX = 1; SFX.flash(); }
  inv[w]--; updateHUD(); send({ t: 'use', w });
}

/* ---------- host simulation ---------- */
function hostWorld(dt) {
  const ps = alive();
  for (const q of players()) q.turning = false;
  for (const o of objs) {
    if (o.done) continue;
    if (stage.hold) {
      const p = ps.find(q => dist(q, o) < 1.0);
      if (p) {
        o.prog += dt / stage.hold; p.turning = stage.obj === 'valve';
        o.sndT -= dt; if (o.sndT <= 0) { o.sndT = .55; emit(stage.obj === 'valve' ? 'valve' : 'tick', o.x, o.y); }
        if (o.prog >= 1) { o.done = true; o.prog = 1; objComplete(o); }
      } else o.prog = Math.max(0, o.prog - dt * .12);
    } else if (ps.some(q => dist(q, o) < .6)) { o.done = true; objComplete(o); }
  }
  for (const it of items) {
    if (it.got) continue;
    const p = ps.find(q => dist(q, it) < .6); if (!p) continue;
    it.got = true; emit('item', it.x, it.y, false, 8);
    if (it.kind === 'bat') { if (p === me) me.bat = Math.min(100, me.bat + 45); else send({ t: 'ev', k: 'bat' }); tell(p, 'gotBat'); }
    else if (it.kind === 'cam') { inv.flash = Math.min(3, inv.flash + 1); tell(p, 'gotCam', { n: inv.flash }); }
    else { inv.flare = Math.min(3, inv.flare + 1); tell(p, 'gotFlare', { n: inv.flare }); }
  }
  for (const f of flares) { f.t -= dt; f.ct -= dt; if (f.ct <= 0 && f.t > 0) { f.ct = .25 + R() * .3; sfxAt('crackle', f.x, f.y, 8); } }
  flares = flares.filter(f => f.t > 0);
  if (stage.blackout) {
    if (blackout > 0) blackout -= dt;
    else {
      boT -= dt;
      if (boT < .5 && !buzzed) { buzzed = true; emit('buzz', me.x, me.y, false, 1e9); }
      if (boT <= 0) { blackout = 1.3 + R() * 1.1; boT = 11 + R() * 10; buzzed = false; }
    }
  }
  if (others.length) for (const a of players()) {
    if (!a.down) continue;
    const b = alive().find(q => dist(a, q) < 1.2);
    if (b) {
      a.rv += dt / 3;
      if (a.rv >= 1) { a.down = false; a.rv = 0; emit('revive', a.x, a.y); if (a === me) say(t('revivedYou')); else sendTo(a, { t: 'ev', k: 'revived' }); tell(b, 'revivedThem'); }
    } else a.rv = Math.max(0, a.rv - dt * .5);
  }
  for (const q of players()) q.doorT -= dt;
  const everyone = players(), atDoor = everyone.filter(p => dist(p, door) < 1.6);
  if (unlocked && atDoor.length === everyone.length && !everyone.some(p => p.down)) { stageClear(); return; }
  for (const p of atDoor) {
    if (p.doorT > 0) continue;
    p.doorT = 3;
    tell(p, unlocked ? 'waitDoor' : 'doorLocked', { n: objDone }, 2.5);
  }
  if (overT > 0) { overT -= dt; if (overT <= 0) gameOver(); }
}
function objComplete(o) {
  objDone++;
  emit('pickup', o.x, o.y, false, 30);
  if (stage.obj === 'fuse') noteAll(objDone - 1);
  else sayAll('objCount', { n: objDone }, 2.5);
  if (objDone === stage.objN) {
    unlocked = true; emit('power', door.x, door.y, false, 1e9);
    setTimeout(() => { if (state === 'play') sayAll(others.length ? 'exitOpen' : 'exitOpenSolo', null, 4); }, 1200);
    if (stage.mon === 'stalker' || stage.mon === 'blind') { const p = alive()[0]; if (p) { M.st = stage.mon === 'blind' ? 'hunt' : 'search'; M.lx = p.x; M.ly = p.y; M.linger = 0; M.wake = Math.min(M.wake, time); } }
  }
}

/* ---------- local player ---------- */
function solid(x, y) { return map[idx(x | 0, y | 0)] !== 0; }
function tryMove(nx, ny) {
  const r = .22;
  if (!solid(nx + r, me.y + r) && !solid(nx - r, me.y + r) && !solid(nx + r, me.y - r) && !solid(nx - r, me.y - r)) me.x = nx;
  if (!solid(me.x + r, ny + r) && !solid(me.x - r, ny + r) && !solid(me.x + r, ny - r) && !solid(me.x - r, ny - r)) me.y = ny;
}
const touch = { mx: 0, my: 0, moveId: null, lookId: null, ox: 0, oy: 0, lx: 0, run: false, edge: false };
function updateLocal(dt) {
  const canAct = !me.down && scareT <= 0 && !menuOpen;
  let f = 0, s = 0;
  if (canAct) {
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD) s += 1; if (keys.KeyA) s -= 1;
    if (keys.ArrowLeft) me.a -= 2.4 * dt; if (keys.ArrowRight) me.a += 2.4 * dt;
    f += -touch.my; s += touch.mx;
  }
  let len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; len = 1; }
  const sneak = keys.KeyC || keys.ControlLeft;
  me.mov = len > .1;
  const wantRun = keys.ShiftLeft || keys.ShiftRight || touch.run || touch.edge;
  if (touch.run && me.exh) setRun(false);
  me.spr = canAct && wantRun && me.mov && !me.exh && me.stam > 0 && !sneak;
  const base = me.spr ? 3.6 : 2.1 * (sneak ? .5 : 1) * (COARSE ? clamp(len * 1.4, .35, 1) : 1);
  const sp = base * dt, cx = Math.cos(me.a), cy = Math.sin(me.a), ox = me.x, oy = me.y;
  if (me.mov) tryMove(me.x + (cx * f - cy * s) * sp, me.y + (cy * f + cx * s) * sp);
  const moved = Math.hypot(me.x - ox, me.y - oy);
  me.spd = dt > 0 ? moved / dt : 0;
  if (me.spr) { me.stam -= dt * .3; if (me.stam <= 0) { me.stam = 0; me.exh = true; } }
  else { me.stam = Math.min(1, me.stam + dt * (me.mov ? .12 : .2)); if (me.exh && me.stam > .4) me.exh = false; }
  if (me.exh) { breathT -= dt; if (breathT <= 0) { breathT = .8; SFX.breath(); } }
  me.step += moved; me.bob += moved * (me.spr ? 5.2 : 6.5);
  me.bobY = me.down ? 6 : Math.sin(me.bob) * (me.spr ? 2.2 : 1.2);
  if (me.step > (me.spr ? .8 : .62)) { me.step = 0; if (stage.water) SFX.splash(); else SFX.step(); }
  if (me.light && me.bat > 0 && !me.down) {
    me.bat = Math.max(0, me.bat - dt * 1.05 * stage.drain * (me.beamed ? 4 : 1));
    if (me.bat === 0) { me.light = false; SFX.click(); say(t('lampOut')); }
  }
  const on = lampOn(me);
  flashI = on ? (me.bat < 20 && R() < .12 * (1 - me.bat / 20) + .02 ? .15 + R() * .3 : .95 + R() * .05) : 0;
  flashFX = Math.max(0, flashFX - dt * 2.5);
}
function monsterAudio(dt, moved) {
  if (M.gone > 0 || time < M.wake) { M.lastSt = M.st; return; }
  const d = dist(me, M), pan = panTo(M.x, M.y), type = stage.mon;
  M.step += moved; M.sway += moved * 3;
  const stepLen = type === 'statue' ? .55 : .95;
  if (M.step > stepLen) {
    M.step = 0;
    const v = Math.pow(clamp(1 - d / 14, 0, 1), 2) * .6 + .02;
    if (d < 14) { if (type === 'stalker') SFX.mstep(v, pan); else if (type === 'statue') SFX.scrape(v * 1.3, pan); else if (type === 'blind') SFX.slosh(v, pan); }
  }
  const cry = v => { if (type === 'stalker') SFX.growl(v, pan); else if (type === 'blind') SFX.gurgle(v, pan); else if (type === 'shade') SFX.whisper(v * 2, pan); };
  if (M.st !== M.lastSt && M.st === 'hunt' && type !== 'statue' && type !== 'shade') { cry(clamp(.5 - d * .02, .12, .5)); M.cryT = 3 + R() * 2; }
  M.lastSt = M.st;
  M.cryT -= dt;
  if (M.cryT <= 0) {
    M.cryT = 3 + R() * 3;
    if ((type === 'stalker' || type === 'blind') && M.st === 'hunt') cry(clamp(.45 - d * .025, .08, .45));
    if (type === 'shade' && d < 10) cry(clamp(1 - d / 10, .1, 1));
  }
}
function tick(dt) {
  updateLocal(dt);
  if (!me.down) {
    const lim = lampOn(me) ? 7 : 2.5;
    objs.forEach((o, i) => { if (!o.spot && dist(me, o) < lim && inView(me, o.x, o.y, .65)) { o.spot = true; if (netLive()) send({ t: 'spot', i }); } });
  }
  let moved = 0;
  if (!isGuest()) moved = hostMonster(dt);
  else {
    const ox = M.x, oy = M.y, k = Math.min(1, dt * 10);
    if (Math.hypot(M.tx - M.x, M.ty - M.y) > 3) { M.x = M.tx; M.y = M.ty; } else { M.x += (M.tx - M.x) * k; M.y += (M.ty - M.y) * k; }
    moved = Math.hypot(M.x - ox, M.y - oy);
  }
  { const k = Math.min(1, dt * 10); for (const q of others) { q.rx += (q.x - q.rx) * k; q.ry += (q.y - q.ry) * k; } }
  if (state !== 'play') return;
  monsterAudio(dt, moved);
  if (!isGuest()) { hostWorld(dt); if (state !== 'play') return; }
  // network send
  net.sendT -= dt;
  if (netLive() && net.sendT <= 0) {
    net.sendT = 1 / 15;
    if (isGuest()) send({ t: 'me', x: r2(me.x), y: r2(me.y), a: r2(me.a), l: me.light && me.bat > 0 && !me.down ? 1 : 0, s: me.spr ? 1 : 0, v: r2(me.spd) });
    else hostSnapshot();
  }
  // dread, heartbeat, ambience
  const md = M.gone > 0 || time < M.wake ? 99 : dist(me, M);
  let target = 0;
  if (md < 99) target = stage.mon === 'statue' ? (M.frozen ? clamp(1 - md / 8, 0, 1) * .7 : clamp(1 - md / 12, .25, 1)) : M.st === 'hunt' ? clamp(1 - md / 11, .3, 1) : clamp(1 - md / 7, 0, 1) * .6;
  if (me.down) target = Math.max(target, .5);
  danger += (target - danger) * Math.min(1, dt * 2);
  heartT -= dt; heartPulse = Math.max(0, heartPulse - dt * 3);
  if (heartT <= 0 && danger > .05) { heartT = 1.15 - danger * .78; heartPulse = 1; SFX.heart(.12 + danger * .55); }
  ambT -= dt; if (ambT <= 0) { ambT = 11 + R() * 16; SFX.ambient(); }
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
  if (noteT > 0) { noteT -= dt; if (noteT <= 0) $('note').style.opacity = 0; }
  let pt = '';
  if (me.down) pt = me.rv > 0 ? t('progRevive', { p: Math.round(me.rv * 100) }) : t('progDown');
  else if (others.some(q => q.down && dist(me, q) < 1.4)) pt = t('progReviving', { p: Math.round(others.find(q => q.down && dist(me, q) < 1.4).rv * 100) });
  else if (stage.hold) { const o = objs.find(q => !q.done && dist(me, q) < 1.0); if (o) pt = t(stage.obj === 'valve' ? 'progValve' : 'progCandle', { p: Math.round(o.prog * 100) }); }
  if ($('prog').textContent !== pt) $('prog').textContent = pt;
  updateHUD();
}

/* ---------- renderer ---------- */
let LR = 0, LG = 0, LB = 0, AR = 0, AG = 0, AB = 0, GR = 0, GG = 0, GB = 0;
function light(i, d) {
  const a = .045 / (1 + .05 * d * d) + .1 / (1 + .7 * d * d);
  const f = flashI * cone[i] * 2.3 / (1 + .085 * d * d);
  const g = 1 / (1 + .35 * d * d);
  LR = a * AR + f * 1.05 + g * GR; LG = a * AG + f * .95 + g * GG; LB = a * AB + f * .78 + g * GB;
}
function render() {
  const dirX = Math.cos(me.a), dirY = Math.sin(me.a), pl = W / (2 * F), plX = -dirY * pl, plY = dirX * pl, half = H / 2;
  const seeLim = lampOn(me) ? 7 : 2.5;
  const ak = stage.ambK * (blackout > 0 ? .55 : 1); AR = stage.amb[0] * ak; AG = stage.amb[1] * ak; AB = stage.amb[2] * ak;
  GR = GG = GB = 0;
  if (me.down) { GR = .5; GG = .12; GB = .1; }
  for (const f of flares) { const k = clamp(1 - Math.hypot(f.x - me.x, f.y - me.y) / 6, 0, 1) * (.8 + R() * .2) * Math.min(1, f.t); GR += k * 1.1; GG += k * .25; GB += k * .2; }
  if (stage.obj === 'candle') for (const o of objs) if (o.done) { const k = clamp(1 - Math.hypot(o.x - me.x, o.y - me.y) / 4.5, 0, 1) * .6; GR += k; GG += k * .6; GB += k * .25; }
  const fl = set.floor.d, ce = set.ceil.d, wob = stage.water, tt = time * 1.6;
  const r0x = dirX - plX, r0y = dirY - plY;
  for (let y = (half | 0); y < H; y++) {
    const p = y - half + .5, rd = F * .5 / p;
    const stX = rd * 2 * plX / W, stY = rd * 2 * plY / W;
    let fx = me.x + rd * r0x, fy = me.y + rd * r0y;
    const yc = H - 1 - y;
    for (let x = 0; x < W; x++) {
      let tx = (fx - Math.floor(fx)) * T; if (wob) tx += Math.sin(fy * 5 + tt) * 2.5;
      const ti = (((((fy - Math.floor(fy)) * T) & TM) * T) + (tx & TM)) * 4;
      fx += stX; fy += stY;
      let i = y * W + x, o = i * 4; light(i, rd);
      px[o] = fl[ti] * LR; px[o + 1] = fl[ti + 1] * LG; px[o + 2] = fl[ti + 2] * LB;
      i = yc * W + x; o = i * 4; light(i, rd);
      px[o] = ce[ti] * LR * .9; px[o + 1] = ce[ti + 1] * LG * .9; px[o + 2] = ce[ti + 2] * LB * .9;
    }
  }
  const walls = set.walls, doorT = unlocked ? set.doorOn : set.doorOff;
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
    let mx = me.x | 0, my = me.y | 0;
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    let sx, sy, sdx, sdy, side = 0, cell = 0;
    if (rdx < 0) { sx = -1; sdx = (me.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - me.x) * ddx; }
    if (rdy < 0) { sy = -1; sdy = (me.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - me.y) * ddy; }
    seen[idx(mx, my)] = 1;
    for (let n = 0; n < 64; n++) {
      const dIn = sdx < sdy ? sdx : sdy;
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      cell = map[idx(mx, my)]; if (dIn < seeLim) seen[idx(mx, my)] = 1; if (cell) break;
    }
    const perp = Math.max(.05, side === 0 ? sdx - ddx : sdy - ddy);
    zbuf[x] = perp;
    let wx = side === 0 ? me.y + perp * rdy : me.x + perp * rdx; wx -= Math.floor(wx);
    let tX = (wx * T) | 0; if (side === 0 && rdx > 0) tX = TM - tX; if (side === 1 && rdy < 0) tX = TM - tX;
    const k = (mx * 7 + my * 13) % 23;
    const tx = cell === 2 ? doorT : k === 3 ? walls[1] : k === 11 ? walls[2] : walls[0];
    const td = tx.d, te = tx.e, sh = side ? .74 : 1, emK = tx === walls[1] && stage.key === 'chapel' ? .6 : 1;
    const lh = F / perp, ds = half - lh / 2, y0 = Math.max(0, Math.ceil(ds)), y1 = Math.min(H, ds + lh);
    for (let y = y0; y < y1; y++) {
      const tY = (((y - ds) / lh) * T) & TM, t = tY * T + tX, ti = t * 4, i = y * W + x, o = i * 4;
      if (te[t]) { px[o] = td[ti] * emK; px[o + 1] = td[ti + 1] * emK; px[o + 2] = td[ti + 2] * emK; continue; }
      light(i, perp);
      px[o] = td[ti] * LR * sh; px[o + 1] = td[ti + 1] * LG * sh; px[o + 2] = td[ti + 2] * LB * sh;
    }
  }
  // sprites
  const inv2 = 1 / (plX * dirY - dirX * plY), list = [];
  const add = (x, y, t, scale, emis, lift = 0, wob2 = 0, dither = 0) => {
    const rx = x - me.x, ry = y - me.y, ty = inv2 * (-plY * rx + plX * ry);
    if (ty > .12) list.push({ tx: inv2 * (dirY * rx - dirX * ry), ty, t, scale, emis, lift, wob: wob2, dither });
  };
  const pulse = ph => .75 + .25 * Math.sin(time * 3 + ph);
  for (const o of objs) {
    if (stage.obj === 'fuse') { if (!o.done) add(o.x, o.y, SPR.fuse, .34, pulse(o.ph), .02 + Math.sin(time * 2 + o.ph) * .02); }
    else if (stage.obj === 'key') { if (!o.done) add(o.x, o.y, SPR.key, .3, pulse(o.ph), .02 + Math.sin(time * 2 + o.ph) * .02); }
    else if (stage.obj === 'valve') add(o.x, o.y, o.done ? SPR.valveOn : SPR.valveOff, .55, 1);
    else add(o.x, o.y, o.done ? SPR.candleOn : SPR.candleOff, .5, o.done ? .85 + R() * .15 : .6);
  }
  for (const it of items) if (!it.got) add(it.x, it.y, it.kind === 'bat' ? SPR.bat : it.kind === 'cam' ? SPR.cam : SPR.flareItem, .3, .6 + .4 * (Math.sin(time * 5) > 0));
  for (const f of flares) add(f.x, f.y, SPR.flareLit, .4, .8 + R() * .2);
  for (const q of others) add(q.rx, q.ry, (q.down ? SPR.mateDown : SPR.mate)[q.slot % COATS.length], q.down ? 1 : .92, lampOn(q) || q.down ? 1 : .25);
  if (M.gone <= 0) add(M.x, M.y, SPR[stage.mon], stage.mon === 'blind' ? 1 : 1.12, stage.mon === 'shade' ? 1 : .9, 0, M.stun > 0 ? (R() - .5) * .06 : Math.sin(M.sway) * .03, stage.mon === 'shade' ? .3 : 0);
  list.sort((a, b) => b.ty - a.ty);
  const doff = rand(65536);
  for (const s of list) {
    const ty = s.ty, scr = (W / 2) * (1 + s.tx / ty) + s.wob * F / ty;
    const sz = F * s.scale / ty, floorY = half + F * .5 / ty - F * s.lift / ty, top = floorY - sz, left = scr - sz / 2;
    const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(W, left + sz), y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(H, floorY);
    const td = s.t.d, te = s.t.e;
    for (let x = x0; x < x1; x++) {
      if (ty >= zbuf[x]) continue;
      const tX = ((x - left) * T / sz) | 0;
      for (let y = y0; y < y1; y++) {
        const t = (((y - top) * T / sz) | 0) * T + tX, ti = t * 4; if (td[ti + 3] < 128) continue;
        const i = y * W + x, o = i * 4;
        if (s.dither && NOISE[(i + doff) & 65535] > .5 - s.dither) continue;
        if (te[t]) { px[o] = td[ti] * s.emis; px[o + 1] = td[ti + 1] * s.emis; px[o + 2] = td[ti + 2] * s.emis; continue; }
        light(i, ty);
        px[o] = td[ti] * LR; px[o + 1] = td[ti + 1] * LG; px[o + 2] = td[ti + 2] * LB;
      }
    }
  }
  // post: vignette, dread tint, film grain
  const g = 14 + danger * 34 + (flashI < .2 ? 8 : 0), off = rand(65536), squeeze = 1 - heartPulse * danger * .3;
  let tr = 1 + danger * .3, tg = 1 - danger * .18, tb = 1 - danger * .22;
  if (me.down) { tr = 1.25; tg = .45; tb = .4; }
  for (let i = 0, n = W * H; i < n; i++) {
    const o = i * 4, v = Math.pow(vig[i], 1 + (1 - squeeze) * 3), nz = NOISE[(i + off) & 65535] * g;
    px[o] = px[o] * v * tr + nz; px[o + 1] = px[o + 1] * v * tg + nz; px[o + 2] = px[o + 2] * v * tb + nz;
  }
}
function present() {
  lctx.putImageData(img, 0, 0);
  const cw = cvs.width, ch = cvs.height, s = Math.max(cw / W, ch / H) * 1.03, dw = W * s, dh = H * s;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(low, (cw - dw) / 2, (ch - dh) / 2 + me.bobY * s, dw, dh);
  if (flashFX > 0) { ctx.fillStyle = `rgba(255,255,250,${flashFX * .85})`; ctx.fillRect(0, 0, cw, ch); }
}
const MS = 7;
function drawMini() {
  const c = $('mini'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y); if (!seen[i]) continue;
    const v = map[i];
    g.fillStyle = v === 0 ? '#2e2a25' : v === 2 ? (unlocked ? '#5dff7a' : '#c0392b') : '#7d766c';
    g.fillRect(x * MS, y * MS, MS, MS);
  }
  const blink = Math.sin(time * 5) > -.3;
  for (const o of objs) {
    const x = o.x * MS, y = o.y * MS;
    if (o.done) { g.fillStyle = '#e6b34a'; g.fillRect(x - 2.5, y - 2.5, 5, 5); }
    else if (o.spot && blink) { g.strokeStyle = '#e6b34a'; g.lineWidth = 1.5; g.strokeRect(x - 2.5, y - 2.5, 5, 5); }
  }
  for (const q of others) {
    if (!q.down) continue;
    const pl = .5 + .5 * Math.sin(time * 6 + q.slot);
    g.fillStyle = `rgba(255,59,47,${.55 + .45 * pl})`; g.beginPath(); g.arc(q.rx * MS, q.ry * MS, 3 + pl * 2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,59,47,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(q.rx * MS, q.ry * MS, 6 + pl * 4, 0, 7); g.stroke();
  }
  g.save(); g.translate(me.x * MS, me.y * MS); g.rotate(me.a);
  g.fillStyle = me.down ? '#ff3b2f' : '#f2ead9'; g.beginPath(); g.moveTo(4.5, 0); g.lineTo(-3, 3); g.lineTo(-1.5, 0); g.lineTo(-3, -3); g.closePath(); g.fill();
  g.restore();
}
function drawScare(k, kind) {
  const cw = cvs.width, ch = cvs.height;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
  if (k > .82 && R() < .5) return;
  const s = Math.min(cw, ch) * (.95 + k * .7);
  ctx.save(); ctx.translate(cw / 2 + (R() - .5) * 50, ch / 2 + (R() - .5) * 50 + s * .08); ctx.scale(s / 100, s / 100);
  const face = (c0, c1) => { const gr = ctx.createRadialGradient(0, -8, 4, 0, 0, 52); gr.addColorStop(0, c0); gr.addColorStop(.7, c1); gr.addColorStop(1, '#151210'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, 30, 50, 0, 0, 7); ctx.fill(); };
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x + (R() - .5), y, r, 0, 7); ctx.fill(); };
  if (kind === 'statue') {
    face('#ddd0ba', '#9c8f7c');
    ctx.strokeStyle = '#4a4036'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(10, -50); ctx.lineTo(2, -20); ctx.lineTo(9, -2); ctx.lineTo(3, 20); ctx.stroke();
    ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.ellipse(-11, -8, 7, 4, 0, 0, 7); ctx.ellipse(11, -8, 7, 4, 0, 0, 7); ctx.fill();
  } else if (kind === 'blind') {
    face('#7f9488', '#3f4f46');
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 30, 10, 12 + k * 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#070808'; for (let i = -30; i <= 30; i += 2) ctx.fillRect(i, -54, 1.6, 64 + Math.abs(Math.sin(i)) * 18);
  } else if (kind === 'shade') {
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, 40, 56, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f4f0e8'; ctx.fillRect(-16, -12, 8, 2.5); ctx.fillRect(8, -12, 8, 2.5);
  } else {
    face('#d8cfbf', '#8d857a');
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(-12, -12, 8, 11, -.15, 0, 7); ctx.ellipse(12, -12, 8, 11, .15, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 24, 8 + k * 3, 13 + k * 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; dot(-12, -11, 1.4); dot(12, -11, 1.4);
  }
  ctx.restore();
  ctx.fillStyle = `rgba(130,0,0,${.22 + R() * .25})`; ctx.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(255,255,255,${R() * .12})`; ctx.fillRect(0, R() * ch, cw, 1 + R() * 3); }
}

/* ---------- flow ---------- */
const setHidden = (id, h) => { $(id).hidden = h; };
const OVERLAYS = ['title', 'lobby', 'card', 'pause', 'end', 'settings'];
function showOnly(id) { for (const o of OVERLAYS) setHidden(o, o !== id); }
const fsEl = document.documentElement;
const canFS = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function enterFS() {
  if (!canFS || isFS()) return;
  try {
    const p = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' });
    const after = () => { try { const o = screen.orientation; if (COARSE && o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) {} };
    if (p && p.then) p.then(after).catch(() => {}); else after();
  } catch (e) {}
}
function exitFS() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
function playUI(on) {
  setHidden('hud', !on); setHidden('touchUI', !on || !COARSE); setHidden('topBtns', !on); setHidden('mini', !on);
  if (!on) { setHidden('stick', true); setRun(false); touch.moveId = touch.lookId = null; touch.mx = touch.my = 0; touch.edge = false; hideTexts(); }
  else $('tLight').classList.toggle('held', me.light && me.bat > 0);
}
function lock() { if (COARSE) return; try { const p = cvs.requestPointerLock && cvs.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function unlock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {} }
function unlockedStage() { return clamp(parseInt(store.get('ashgrove-stage') || '0', 10) || 0, 0, STAGES.length - 1); }
function unlockStage(n) { if (n > unlockedStage()) store.set('ashgrove-stage', String(clamp(n, 0, STAGES.length - 1))); renderStagePick(); }
let pickedStage = 0;
function renderStagePick() {
  const box = $('stagePick'), max = unlockedStage(); box.innerHTML = '';
  pickedStage = Math.min(pickedStage, max);
  STAGES.forEach((s, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t('stagePick', { i: i + 1, name: stx(i).name });
    b.disabled = i > max; b.setAttribute('aria-pressed', String(i === pickedStage));
    b.addEventListener('click', () => { pickedStage = i; renderStagePick(); });
    box.appendChild(b);
  });
}
const newSeed = () => (R() * 2147483647) | 0;
function loadStage(n, sd) {
  stageIdx = n; stage = STAGES[n]; seed = sd; set = getSet(stage.key);
  genMap(sd, stage);
  const spawn = k => { const c = starts[k % starts.length]; let a = 0; for (const [o, an] of [[1, 0], [MW, Math.PI / 2], [-1, Math.PI], [-MW, -Math.PI / 2]]) if (map[c + o] === 0) { a = an; break; } return { ...centre(c), a }; };
  const mine = spawn(me.slot);
  Object.assign(me, { x: mine.x, y: mine.y, a: mine.a, doorT: 0, stam: 1, exh: false, bat: 100, light: true, down: false, rv: 0, beamed: false, bob: 0, bobY: 0, step: 0, spd: 0, mov: false, spr: false });
  for (const q of others) { const c = spawn(q.slot); Object.assign(q, { x: c.x, y: c.y, rx: c.x, ry: c.y, a: c.a, lamp: true, down: false, rv: 0, beamed: false, seen: false, mov: false, spr: false, spd: 0, doorT: 0 }); }
  Object.assign(M, { st: 'wander', gone: 0, stun: 0, frozen: false, lost: 0, linger: 0, wake: stage.mon === 'statue' ? 10 : 8, stuck: 0, lastSt: 'wander', cryT: 3, step: 0, tx: M.x, ty: M.y });
  pickWander();
  seen = new Uint8Array(MW * MH); objDone = 0; unlocked = false; flares = []; blackout = 0; boT = 12 + R() * 8; buzzed = false;
  time = 0; danger = 0; scareT = 0; overT = 0; soloDeath = false; flashFX = 0; net.gotSnap = false;
  setDrone(stage.drone); buildHUD();
}
function fillCard() {
  const s = stx();
  $('cardPlace').textContent = s.place; $('cardName').textContent = s.name; $('cardMon').textContent = s.mname;
  $('cardObj').textContent = t(net.role ? 'cardObjCoop' : 'cardObj');
  $('cardIntro').textContent = s.intro; $('cardTip').textContent = s.tip;
}
function showCard() {
  state = 'card'; menuOpen = false; showOnly('card'); playUI(false); unlock(); fillCard();
  setHidden('cardGo', isGuest()); setHidden('cardWait', !isGuest());
}
function startPlay() {
  state = 'play'; menuOpen = false; showOnly(null); playUI(true); stageInv = { ...inv };
  say(t('find'), 4.5); lock();
}
function beginStage() { if (isGuest()) return; initAudio(); if (COARSE) enterFS(); send({ t: 'begin' }); startPlay(); }
function newRun(n) { runTime = 0; inv = { flash: 1, flare: 1 }; loadStage(n, newSeed()); if (net.role === 'host') send(stageMsg()); showCard(); }
function retryStage() {
  if (isGuest()) return;
  inv = { flash: Math.max(1, stageInv.flash), flare: Math.max(1, stageInv.flare) };
  loadStage(stageIdx, newSeed()); if (net.role === 'host') send(stageMsg()); showCard();
}
function stageClear() {
  emit('ding', door.x, door.y, false, 1e9);
  inv = { flash: Math.max(inv.flash, 1), flare: Math.max(inv.flare, 1) };
  if (stageIdx === STAGES.length - 1) {
    unlockStage(stageIdx);
    const m = { t: 'over', won: true, coop: !!net.role, time: runTime };
    if (!net.role) { const b = parseFloat(store.get('ashgrove-best')); if (!b || runTime < b) store.set('ashgrove-best', String(runTime)); else m.best = b; }
    send(m); const c = endCopy(m); showEnd(c.title, c.text, {});
    return;
  }
  unlockStage(stageIdx + 1);
  loadStage(stageIdx + 1, newSeed());
  send(stageMsg());
  showCard();
}
function gameOver() {
  const m = { t: 'over', won: false, coop: others.length > 0, n: objDone, time };
  send(m); const c = endCopy(m); showEnd(c.title, c.text, { dead: true });
}
function showEnd(title, text, { dead = false, guestEnd = false } = {}) {
  state = 'end'; menuOpen = false; showOnly('end'); playUI(false); unlock();
  $('endTitle').textContent = title; $('endTitle').className = dead ? 'dead' : ''; $('endText').textContent = text;
  const won = !dead && !guestEnd;
  const canRetry = !isGuest() && dead && !guestEnd;
  setHidden('again', !canRetry && !won);
  againMode = won ? 'replay' : 'retry';
  $('again').textContent = t(won ? 'playAgain' : 'tryAgain');
  setHidden('endWait', !(isGuest() && net.open));
}
function startScare() { scareT = 1.4; scareKind = stage.mon; SFX.scream(); hideTexts(); unlock(); setHidden('stick', true); touch.moveId = null; touch.mx = touch.my = 0; }
function afterScare() { if (soloDeath && !net.role) { soloDeath = false; gameOver(); } else lock(); }
function pause() {
  if (state !== 'play' || menuOpen) return;
  menuOpen = true; setHidden('pause', false); playUI(false); unlock();
  $('pauseText').textContent = t(net.role ? 'pauseCoop' : 'pauseSolo');
  setHidden('pRestart', isGuest());
}
function resume() { if (!menuOpen) return; initAudio(); menuOpen = false; setHidden('pause', true); playUI(true); lock(); }
function toTitle() {
  if (netLive()) send({ t: 'bye' });
  closeNet(); state = 'title'; menuOpen = false; showOnly('title'); playUI(false); unlock(); renderStagePick();
  inv = { flash: 1, flare: 1 }; loadStage(pickedStage, newSeed()); M.wake = 1e9;
}
function openLobby(role) {
  initAudio(); if (COARSE) enterFS();
  state = 'lobby'; showOnly('lobby');
  setHidden('hostBox', role !== 'host'); setHidden('joinBox', role !== 'guest');
  $('lobbyEyebrow').textContent = role === 'host' ? t('lobbyHost', { n: pickedStage + 1 }) : t('lobbyJoin');
  $('lobbyGo').textContent = t(role === 'host' ? 'start' : 'join');
  if (role === 'host') hostRoom();
  else { closeNet(); lobbyStatus(''); $('codeIn').value = ''; $('lobbyGo').disabled = false; setTimeout(() => $('codeIn').focus(), 50); }
}
function lobbyGo() {
  if (net.role === 'host') { if (others.length) newRun(pickedStage); return; }
  const code = $('codeIn').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { lobbyStatus(t('badCode')); return; }
  joinRoom(code);
}

let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
  if (state === 'play') {
    const run = !(menuOpen && !net.role);
    if (run) { time += dt; runTime += dt; tick(dt); }
    if (state !== 'play') return;
    if (scareT > 0) { if (run) scareT -= dt; drawScare(1 - scareT / 1.4, scareKind); if (scareT <= 0) afterScare(); }
    else { render(); present(); if (++miniT % 3 === 0) drawMini(); }
  } else if (state === 'title' || state === 'card' || state === 'lobby') {
    time += dt; me.a += dt * .12; flashI = .85 + R() * .05; danger = 0; me.bobY = 0; blackout = 0; render(); present();
  }
}

/* ---------- input ---------- */
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter') lobbyGo(); return; }
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (state === 'play' && !menuOpen) {
    if (e.code === 'KeyF') toggleLight();
    if (e.code === 'KeyQ') pressWeapon('flash');
    if (e.code === 'KeyE') pressWeapon('flare');
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
  } else if (menuOpen && (e.code === 'KeyP' || e.code === 'Enter')) resume();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pause(); });
function toggleLight() {
  if (me.down) return;
  if (me.bat <= 0) { SFX.click(); say(t('lampDead'), 2.5); return; }
  me.light = !me.light; SFX.click(); $('tLight').classList.toggle('held', me.light);
}
let drag = null, everLocked = false;
cvs.addEventListener('mousedown', e => {
  if (state !== 'play' || menuOpen) return;
  if (e.button === 2) { toggleLight(); return; }
  if (document.pointerLockElement === cvs) { if (e.button === 0) pressWeapon('flash'); return; }
  lock(); drag = e.clientX;
});
addEventListener('mouseup', () => { drag = null; });
addEventListener('mousemove', e => {
  if (state !== 'play' || menuOpen || me.down || scareT > 0) return;
  if (document.pointerLockElement === cvs) me.a += e.movementX * .0024;
  else if (drag !== null) { me.a += (e.clientX - drag) * .006; drag = e.clientX; }
});
cvs.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === cvs) everLocked = true;
  else if (everLocked && state === 'play' && scareT <= 0 && !menuOpen) pause();
});
function moveKnob(dx, dy) { $('knob').style.transform = `translate(${dx}px, ${dy}px)`; $('stick').classList.toggle('run', touch.edge); }
cvs.addEventListener('touchstart', e => {
  if (state !== 'play') return; e.preventDefault();
  if (menuOpen || me.down || scareT > 0) return;
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2 && touch.moveId === null) {
      touch.moveId = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY;
      const st = $('stick'); st.style.left = t.clientX + 'px'; st.style.top = t.clientY + 'px'; st.hidden = false; moveKnob(0, 0);
    } else if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; }
  }
}, { passive: false });
cvs.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) {
      let dx = t.clientX - touch.ox, dy = t.clientY - touch.oy; const r = Math.hypot(dx, dy);
      touch.edge = r > 80;
      if (r > 50) { dx *= 50 / r; dy *= 50 / r; }
      touch.mx = dx / 50; touch.my = dy / 50; moveKnob(dx, dy);
    } else if (t.identifier === touch.lookId && !me.down) { me.a += (t.clientX - touch.lx) * .0075; touch.lx = t.clientX; }
  }
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) { if (t.identifier === touch.moveId) { touch.moveId = null; touch.mx = touch.my = 0; touch.edge = false; $('stick').hidden = true; } if (t.identifier === touch.lookId) touch.lookId = null; } };
cvs.addEventListener('touchend', endTouch); cvs.addEventListener('touchcancel', endTouch);
const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
function setRun(on) { touch.run = on; $('tRun').classList.toggle('held', on); }
tap('tLight', toggleLight);
tap('tRun', () => setRun(!touch.run));
tap('tFlash', () => pressWeapon('flash'));
tap('tFlare', () => pressWeapon('flare'));
tap('bPause', pause);
tap('bFull', () => { if (isFS()) exitFS(); else enterFS(); });
if (!canFS) $('bFull').hidden = true;
$('bSolo').addEventListener('click', () => { initAudio(); if (COARSE) enterFS(); closeNet(); newRun(pickedStage); });
$('bHost').addEventListener('click', () => openLobby('host'));
$('bJoin').addEventListener('click', () => openLobby('guest'));
$('lobbyGo').addEventListener('click', lobbyGo);
$('lobbyBack').addEventListener('click', toTitle);
$('cardGo').addEventListener('click', beginStage);
$('resume').addEventListener('click', resume);
$('pRestart').addEventListener('click', () => { menuOpen = false; setHidden('pause', true); retryStage(); });
$('pLeave').addEventListener('click', toTitle);
$('again').addEventListener('click', () => { initAudio(); if (againMode === 'replay') { if (net.role === 'host' && others.length) newRun(0); else if (!isGuest()) { closeNet(); newRun(0); } } else retryStage(); });
$('toTitle').addEventListener('click', toTitle);
$('codeIn').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });

if (window.top !== window) {
  for (const id of ['bHost', 'bJoin']) $(id).disabled = true;
  $('onlineNote').hidden = false;
}
/* ---------- language & settings ---------- */
let againMode = 'retry', settingsBack = 'title';
function applyLang() {
  document.documentElement.lang = LANG;
  document.title = t('h1');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
  $('controlsList').innerHTML = L()[COARSE ? 'controlsTouch' : 'controlsDesk'];
  $('hint').textContent = t(COARSE ? 'hintTouch' : 'hintDesk');
  $('onlineNote').textContent = t('onlineNote');
  $('pauseText').textContent = t(net.role ? 'pauseCoop' : 'pauseSolo');
  renderStagePick(); buildHUD();
  if (state === 'card') fillCard();
}
function setLang(l) { if (!I18N[l]) return; LANG = l; store.set('ashgrove-lang', l); applyLang(); }
function openSettings(from) {
  settingsBack = from;
  if (from === 'pause') setHidden('pause', true); else showOnly('settings');
  setHidden('settings', false);
  const cur = document.querySelector(`[data-lang="${LANG}"]`); if (cur) cur.focus();
}
function closeSettings() { setHidden('settings', true); if (settingsBack === 'pause') setHidden('pause', false); else showOnly('title'); }
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
$('bSettings').addEventListener('click', () => openSettings('title'));
$('pSettings').addEventListener('click', () => openSettings('pause'));
$('setClose').addEventListener('click', closeSettings);
// installable app (only where the service worker is available, e.g. GitHub Pages)
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('install').hidden = false; });
addEventListener('appinstalled', () => { $('install').hidden = true; installEvt = null; });
$('install').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; $('install').hidden = true; });
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if ('serviceWorker' in navigator && window.isSecureContext && window.top === window) {
  navigator.serviceWorker.register('sw.js').then(() => { if (iOS && !standalone) $('iosHint').hidden = false; }).catch(() => {});
}
addEventListener('beforeunload', () => { if (netLive()) send({ t: 'bye' }); });

if (QS.has('debug')) window.__g = { me, others, get mate() { return others[0]; }, M, net, get objs() { return objs; }, get items() { return items; }, get map() { return map; }, get door() { return door; }, seenCount: () => seen.reduce((a, v) => a + v, 0), get state() { return state; }, get stage() { return stageIdx; }, get inv() { return inv; }, get menuOpen() { return menuOpen; }, loadStage, stageClear, newRun, MW };

addEventListener('resize', resize);
resize(); buildSprites(); loadStage(0, newSeed()); M.wake = 1e9; applyLang();
requestAnimationFrame(frame);
})();
