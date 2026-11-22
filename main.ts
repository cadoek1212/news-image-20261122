// news-image-20261122: one-day world news poster for Sunday 22 November 2026.
// Draws a 1024x1024 PNG with a standard-library-only rasterizer: a 5x7 bitmap
// font, filled polygons for a stylised world map, numbered pins and a story
// index. No network, no dates, no randomness: the same input always yields
// the same bytes.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER = [248, 244, 236];
const INK = [26, 26, 26];
const NAVY = [20, 33, 61];
const RED = [180, 35, 24];
const GOLD = [201, 162, 39];
const GREY = [90, 90, 90];
const OCEAN = [220, 233, 242];
const LAND = [107, 143, 94];
const LAND_EDGE = [74, 107, 66];
const WHITE = [255, 255, 255];
const LIGHT_LINE = [210, 204, 190];

// ------------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 3);
function setPixel(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPixel(xx, yy, c);
  }
}
function fillCircle(cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) setPixel(cx + x, cy + y, c);
    }
  }
}
function drawLine(x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    setPixel(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function fillPolygon(pts, c) {
  // Scanline fill of a simple polygon given as [x, y] screen points.
  let minY = H, maxY = 0;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(Math.round(a[0] + t * (b[0] - a[0])));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = xs[k]; x <= xs[k + 1]; x++) setPixel(x, y, c);
    }
  }
}

// --------------------------------------------------------------------- font
// 5x7 bitmap font, one row per number, bit 4 = leftmost pixel.
const GLYPHS = {
  "A": [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  "B": [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
  "C": [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  "D": [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
  "E": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
  "F": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
  "G": [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
  "H": [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  "I": [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  "J": [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  "K": [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  "L": [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  "M": [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
  "N": [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  "O": [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  "Q": [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
  "R": [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  "S": [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
  "T": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  "U": [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  "V": [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
  "W": [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
  "X": [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
  "Y": [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
  "Z": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
  "0": [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
  "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  "2": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
  "3": [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
  "4": [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  "5": [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
  "6": [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
  "7": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
  "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0C, 0x0C],
  ",": [0, 0, 0, 0, 0x0C, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "-": [0, 0, 0, 0x0E, 0, 0, 0],
  ":": [0, 0x0C, 0x0C, 0, 0x0C, 0x0C, 0],
  ";": [0, 0x0C, 0x0C, 0, 0x0C, 0x04, 0x08],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  "$": [0x04, 0x0F, 0x14, 0x0E, 0x05, 0x1E, 0x04],
  "&": [0x0C, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0D],
  "+": [0, 0x04, 0x04, 0x1F, 0x04, 0x04, 0],
  "=": [0, 0, 0x1F, 0, 0x1F, 0, 0],
  "?": [0x0E, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '"': [0x0A, 0x0A, 0x0A, 0, 0, 0, 0],
  "*": [0, 0x04, 0x15, 0x0E, 0x15, 0x04, 0],
};
function charWidth(scale) { return 6 * scale; }
function textWidth(text, scale) {
  const t = String(text).toUpperCase();
  return t.length * 6 * scale - scale;
}
function drawText(x, y, scale, color, text, bold) {
  const t = String(text).toUpperCase();
  let cx = x;
  for (const ch of t) {
    const g = GLYPHS[ch] || GLYPHS[" "];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r] & (1 << (4 - c))) {
          fillRect(cx + c * scale, y + r * scale, scale, scale, color);
          if (bold) fillRect(cx + c * scale + 1, y + r * scale, scale, scale, color);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}
function drawTextCentered(cx, y, scale, color, text, bold) {
  drawText(cx - Math.floor(textWidth(text, scale) / 2), y, scale, color, text, bold);
}
function wrapText(text, maxChars) {
  const words = String(text).toUpperCase().split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ png out
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------- map
// Stylised continents as [lon, lat] outlines (equirectangular projection).
const MAP = { x0: 28, y0: 228, x1: 996, y1: 418, latTop: 80, latBot: -60 };
function project(lon, lat) {
  const x = MAP.x0 + ((lon + 180) / 360) * (MAP.x1 - MAP.x0);
  const y = MAP.y0 + ((MAP.latTop - lat) / (MAP.latTop - MAP.latBot)) * (MAP.y1 - MAP.y0);
  return [Math.round(x), Math.round(y)];
}
const CONTINENTS = [
  [[-168, 66], [-156, 71], [-140, 70], [-128, 71], [-115, 73], [-105, 68], [-95, 69], [-88, 68], [-82, 66], [-78, 62], [-72, 62], [-65, 60], [-60, 55], [-55, 47], [-60, 44], [-66, 44], [-70, 42], [-74, 39], [-76, 35], [-80, 32], [-81, 26], [-84, 30], [-89, 30], [-94, 29], [-97, 26], [-97, 16], [-94, 15], [-90, 14], [-86, 12], [-83, 9], [-79, 8], [-84, 12], [-90, 14], [-95, 16], [-100, 18], [-105, 20], [-110, 23], [-114, 29], [-117, 33], [-122, 37], [-124, 42], [-124, 48], [-128, 50], [-132, 56], [-140, 60], [-150, 61], [-158, 58], [-165, 60]],
  [[-79, 9], [-77, 8], [-72, 11], [-64, 11], [-60, 8], [-54, 6], [-51, 4], [-50, 0], [-44, -3], [-38, -5], [-35, -8], [-38, -15], [-40, -22], [-46, -24], [-48, -28], [-54, -33], [-58, -35], [-62, -39], [-65, -41], [-67, -46], [-68, -50], [-69, -54], [-71, -54], [-73, -50], [-73, -44], [-73, -37], [-71, -30], [-70, -22], [-75, -15], [-79, -8], [-81, -4], [-80, 1]],
  [[-10, 36], [-9, 38], [-9, 43], [-2, 44], [-2, 48], [-4, 48], [-1, 50], [2, 51], [4, 53], [7, 54], [8, 57], [10, 59], [12, 56], [18, 56], [21, 55], [24, 58], [27, 59], [30, 60], [30, 63], [28, 66], [32, 70], [36, 68], [40, 67], [44, 66], [42, 62], [38, 58], [35, 55], [32, 52], [30, 48], [28, 45], [26, 42], [23, 40], [22, 37], [21, 38], [19, 42], [15, 44], [12, 44], [8, 44], [6, 43], [3, 42], [0, 39], [-2, 37], [-6, 36], [-9, 37]],
  [[-6, 35], [-9, 32], [-13, 28], [-16, 25], [-17, 21], [-17, 16], [-16, 12], [-12, 8], [-8, 5], [-4, 5], [0, 6], [6, 4], [9, 4], [9, 0], [12, -2], [13, -6], [12, -12], [13, -17], [15, -22], [16, -28], [19, -34], [25, -34], [28, -33], [32, -29], [33, -26], [35, -22], [36, -18], [40, -15], [40, -10], [42, -4], [46, -1], [51, 2], [51, 10], [48, 11], [44, 11], [41, 12], [39, 16], [38, 18], [36, 22], [34, 27], [33, 31], [30, 32], [25, 32], [20, 33], [15, 33], [11, 34], [10, 37], [5, 37], [0, 36]],
  [[28, 36], [36, 36], [44, 38], [48, 30], [54, 27], [60, 25], [67, 25], [73, 20], [77, 8], [80, 13], [87, 22], [92, 20], [97, 12], [101, 3], [105, 9], [109, 14], [106, 21], [110, 20], [116, 23], [121, 30], [125, 38], [130, 36], [135, 34], [140, 40], [141, 45], [142, 52], [140, 59], [135, 60], [125, 62], [115, 68], [105, 72], [95, 75], [85, 74], [75, 72], [65, 69], [55, 68], [45, 66], [38, 62], [32, 58], [30, 50], [28, 45]],
  [[113, -22], [114, -28], [115, -34], [118, -35], [122, -34], [126, -32], [129, -32], [132, -32], [135, -35], [137, -35], [140, -38], [145, -38], [148, -38], [150, -37], [152, -33], [153, -29], [153, -26], [151, -24], [148, -20], [146, -19], [143, -15], [142, -11], [141, -13], [137, -12], [135, -15], [132, -12], [130, -13], [127, -14], [124, -15], [122, -17], [119, -20], [116, -21]],
  [[167, -45], [170, -43], [173, -41], [175, -39], [177, -38], [178, -37], [176, -39], [174, -41], [171, -43], [168, -46]],
  [[130, 31], [132, 33], [134, 34], [136, 35], [138, 35], [140, 36], [141, 39], [141, 42], [142, 44], [143, 43], [141, 41], [140, 38], [138, 35], [136, 34], [133, 34], [131, 33]],
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-2, 50]],
  [[95, 5], [98, 3], [101, 0], [104, -3], [106, -6], [104, -6], [101, -2], [98, 2]],
  [[109, 1], [111, 3], [113, 5], [116, 6], [118, 2], [117, -2], [114, -4], [111, -3], [109, 0]],
  [[105, -6], [108, -7], [111, -7], [114, -8], [114, -9], [110, -8], [106, -8]],
  [[131, -1], [134, -2], [137, -3], [140, -4], [143, -5], [146, -6], [148, -8], [147, -9], [144, -8], [141, -8], [138, -8], [135, -5], [132, -3]],
  [[44, -16], [47, -15], [50, -16], [49, -20], [47, -24], [45, -25], [44, -22], [43, -18]],
];
const MAP_LABELS = [
  ["NORTH AMERICA", -100, 55], ["SOUTH AMERICA", -60, -16], ["EUROPE", 12, 54],
  ["AFRICA", 16, 4], ["ASIA", 92, 56], ["OCEANIA", 138, -32],
];

// ------------------------------------------------------------------ stories
// [region, lon, lat, dx, dy, headline] — researched from BBC, Reuters, AP,
// Times of India and USGS reporting dated Sunday 22 November 2026.
const SECTIONS = [
  ["MIDDLE EAST", [
    [50.55, 26.23, 0, 0, "IRAN STRIKES US MILITARY ASSETS IN BAHRAIN; TANKERS HIT OFF OMAN AS GULF TENSIONS SPIKE"],
    [50.55, 26.23, 14, -10, "BAHRAIN PROBES PATRIOT INTERCEPTOR CRASH AMID REPORTS OF IRANIAN DRONE ATTACKS"],
    [56.27, 26.95, 0, 0, "IRAN: QESHM ISLAND BLASTS WERE US MUNITIONS DISPOSAL, NOT A FRESH ATTACK"],
    [34.47, 31.50, 0, 0, "GAZA: 4 KILLED, 14 HURT IN ISRAELI CEASEFIRE VIOLATIONS, MEDICS SAY"],
    [46.68, 24.71, 0, 0, "SAUDI-LED COALITION SHOOTS DOWN 3 HOUTHI MISSILES HEADED FOR RIYADH"],
  ]],
  ["EUROPE", [
    [30.71, 36.90, 0, 0, "COP31 IN ANTALYA RUNS INTO OVERTIME AS FOSSIL-FUEL FIGHT DEADLOCKS NEARLY 200 NATIONS"],
    [30.52, 50.45, 14, -8, "ZELENSKY SUGGESTS NEW PEACE TALKS COULD HAPPEN AT THE G20 MEETING"],
    [30.71, 36.90, -16, 10, "DRAFT COP31 DEAL DROPS FOSSIL-FUEL PHASE-OUT AND 120BN DOLLAR ADAPTATION FINANCE"],
    [24.03, 49.84, 0, 0, "RUSSIA HITS LVIV: 2 KILLED, 10 HURT; KYIV BRIDGES AND RAIL STATIONS STRUCK"],
    [24.90, 60.20, 0, 0, "DRONES HIT RUSSIAN CARGO SHIP IN GULF OF FINLAND; FINLAND TIGHTENS SECURITY"],
    [21.01, 52.23, 0, 0, "RUSSIAN MISSILE AND DRONE CRASH IN POLAND; WARSAW FLAGS PROVOCATION"],
    [30.52, 50.45, 0, 0, "ZELENSKY: CRIMEAN BRIDGE STRIKES A FAIR RESPONSE; MEETS UK MINISTER STREETING"],
    [12.57, 55.68, 0, 0, "DENMARK ACCUSES RUSSIA OF PLOTTING TO ASSASSINATE US-UKRAINIAN RAPPER"],
    [9.99, 53.55, 0, 0, "GERMAN UNION IG METALL CALLS 24-HOUR STRIKE FOR MONDAY: 23,000 WORKERS, 19 FIRMS"],
    [2.35, 48.86, 0, 0, "FRANCE SEEKS UN SECURITY COUNCIL ACTION AFTER MYANMAR REJECTS ICJ RULING"],
    [4.35, 50.85, 0, 0, "EU CHIEF COSTA PROPOSES 3% BIG-TECH LEVY IN SLIMMER BUDGET; FRANCE REJECTS IT"],
    [15.98, 45.81, 0, 0, "THOUSANDS PROTEST IN ZAGREB OVER DEATH OF KRISTIAN PERIS IN PSYCHIATRIC HOSPITAL"],
    [18.07, 59.33, 0, 0, "SWEDEN SUMMONS RUSSIA'S AMBASSADOR AS TENSIONS GROW"],
  ]],
  ["ASIA-PACIFIC", [
    [114.17, 22.32, -12, 0, "HONG KONG VOTES FOR ELECTION COMMITTEE: 723 SEATS, 856 CANDIDATES, 5,700 VOTERS"],
    [114.06, 22.55, 12, 0, "TRUMP AFTER XI MEETING: CHINA'S NUCLEAR BUILDUP RAPID AND CONCERNING"],
    [126.98, -8.53, 0, 0, "M6.8 QUAKE STRIKES NEAR LOSPALOS, TIMOR-LESTE"],
    [77.21, 28.61, 0, 0, "PAKISTAN CLIMATE MINISTER TO ATTEND SCO DIALOGUE IN NEW DELHI"],
    [77.21, 28.61, 14, -8, "INDIA AND BULGARIA DISCUSS TIES, IMEC CORRIDOR AND BLACK SEA"],
  ]],
  ["AMERICAS", [
    [-108.00, 25.50, 0, 0, "MEXICO CAPTURES EL CHAPO ISIDRO, ON FBI 10 MOST WANTED, WITH 5M DOLLAR REWARD"],
    [-107.39, 24.81, 0, 0, "ARREST SPARKS DEADLY VIOLENCE IN SINALOA; 11 KILLED"],
    [-77.04, 38.90, 0, 0, "TRUMP SEEKS PERMANENT IRAN NUCLEAR DEAL TO LAST 20 YEARS"],
    [-77.04, 38.90, 16, -8, "FBI PROBES APPARENT HACK OF ITS CRIMINAL DATABASE"],
    [-77.04, 38.90, -16, 8, "TRUMP ORDERS FEDERAL CONTRACTORS TO CLEAR CONGRESS REQUESTS WITH WHITE HOUSE"],
    [-77.04, 38.90, 14, 10, "TRUMP SIGNS COMMON CENTS ACT"],
    [-87.63, 41.88, 0, 0, "FEWER AMERICANS TO TRAVEL FOR THANKSGIVING, ENDING 3-YEAR RECORD RUN, AAA SAYS"],
    [-80.19, 25.76, 0, 0, "SOUTH FLORIDA FLOODING FORCES EVACUATIONS AND SCHOOL CLOSURES"],
    [-90.20, 38.63, 0, 0, "JUDGE APPROVES 7.25BN DOLLAR ROUNDUP SETTLEMENT FOR CANCER CLAIMS"],
    [-122.33, 47.61, 0, 0, "MACKLEMORE GIVES NEW SINGLE PROFITS IN FULL TO GAZA RECOVERY"],
    [-95.37, 29.76, 0, 0, "US GAS PRICES KEEP FALLING: 3.69 DOLLARS A GALLON, SAYS AAA"],
  ]],
  ["AFRICA", [
    [28.05, -26.20, 0, 0, "ANC FIGHTS TO KEEP CONTROL OF SOUTH AFRICAN KEY CITIES AFTER ELECTION SETBACK"],
    [7.49, 9.06, 0, 0, "NIGERIAN YOUTH HAVE SHOWN THEIR POWER, SO WHY AREN'T THEY SHAPING THIS ELECTION"],
    [-0.19, 5.60, 0, 0, "AFRICAN GROUP AT COP31 DEMANDS ADAPTATION FINANCE: WE CAME TO CLAIM WHAT IS OURS"],
  ]],
  ["GLOBAL", [
    [-74.01, 40.71, 0, 0, "TECH STOCKS SLIDE AS ANTHROPIC SHARES FALL"],
    [6.14, 46.20, 0, 0, "UN REPORT: 1 IN 4 PARTNERED WOMEN CANNOT REFUSE SEX; 1 IN 3 IN ARAB STATES"],
    [2.35, 48.86, 14, 8, "FRANCE PROBING DEPARDIEU AND AUTHOR OVER GANG RAPE CLAIM"],
    [-74.01, 40.71, 14, -8, "LOCK OF GEORGE WASHINGTON'S HAIR SELLS FOR 4,000 DOLLARS"],
  ]],
  ["SPORT", [
    [-1.61, 54.98, 0, 0, "NEWCASTLE 2-2 ARSENAL: MADUEKE RESCUES POINT; RAYA HURT; GUNNERS 6 PTS CLEAR"],
    [-0.19, 51.48, 0, 0, "LEEDS STUN CHELSEA 4-1 AT STAMFORD BRIDGE, FIRST WIN THERE SINCE 1999"],
    [-2.24, 53.48, 0, 0, "MAN CITY 1-1 FULHAM AS WINLESS RUN STRETCHES TO FOUR GAMES"],
    [-6.26, 53.35, 0, 0, "IRELAND 20-17 SOUTH AFRICA IN NATIONS CHAMPIONSHIP THRILLER"],
    [-0.19, 51.50, 14, -8, "ENGLAND 37-12 NEW ZEALAND: RECORD WIN OVER THE ALL BLACKS"],
    [2.35, 48.86, -14, 10, "FRANCE 45-17 ARGENTINA TO REACH NATIONS FINAL AGAINST SOUTH AFRICA"],
    [-3.18, 51.48, 0, 0, "AUSTRALIA 29-26 WALES; BOURNEMOUTH WIN NINTH IN A ROW, 2-0 AT FOREST"],
  ]],
];
const DATE_CHECK =
  "DATE CHECK - LEFT OUT: THEY HAPPENED OR WERE FIRST REPORTED BEFORE 22 NOV - " +
  "EU-INDONESIA TRADE PACT SIGNED 21 NOV - BOLSONARO TO ICU 21 NOV - PALISADES FIRE " +
  "VERDICT 20 NOV - TRUMP-XI SHENZHEN SUMMIT 20 NOV - PERU M6.7 QUAKE 21 NOV - " +
  "BRAZIL STORM 21 NOV - PETER FLUCK DIED 21 NOV - NADAL JOINS REAL MADRID BOARD 21 NOV";

// ------------------------------------------------------------------- render
function drawPin(n, lon, lat, dx, dy, big) {
  const [tx, ty] = project(lon, lat);
  const x = tx + dx, y = ty + dy;
  if (dx !== 0 || dy !== 0) drawLine(tx, ty, x, y, RED);
  fillCircle(x, y, big ? 11 : 8, RED);
  fillCircle(x, y, big ? 9 : 6, WHITE);
  fillCircle(x, y, big ? 8 : 6, RED);
  const label = String(n);
  drawText(x - Math.floor(textWidth(label, 1) / 2), y - 3, 1, WHITE, label, false);
}

function main() {
  fillRect(0, 0, W, H, PAPER);

  // ---- masthead
  fillRect(0, 0, W, 100, NAVY);
  fillRect(0, 100, W, 3, GOLD);
  drawTextCentered(512, 16, 4, WHITE, "THE WORLD IN ONE PICTURE", true);
  drawTextCentered(512, 58, 3, GOLD, "SUNDAY 22 NOVEMBER 2026", true);

  // ---- sub-strip
  const total = SECTIONS.reduce((a, s) => a + s[1].length, 0);
  drawTextCentered(512, 110, 1, INK,
    total + " STORIES FROM 7 REGIONS - MIDDLE EAST - EUROPE - ASIA-PACIFIC - AMERICAS - AFRICA - GLOBAL - SPORT", true);

  // ---- lead story
  fillRect(28, 128, W - 56, 78, WHITE);
  fillRect(28, 128, 6, 78, RED);
  drawText(48, 136, 1, RED, "LEAD", true);
  drawText(48, 152, 2, INK, "IRAN STRIKES US BASES IN BAHRAIN", true);
  drawText(48, 178, 1, GREY, "TANKERS HIT OFF OMAN - GULF TENSIONS SPIKE AS COP31 TALKS STALL IN OVERTIME", false);
  drawText(48, 192, 1, GREY, "HONG KONG VOTES - LVIV HIT - CARGO SHIP ATTACKED IN THE GULF OF FINLAND", false);

  // ---- map title + map
  drawText(28, 212, 1, INK, "THE WORLD AT A GLANCE - NUMBERED PINS MARK EACH STORY", true);
  drawText(996 - textWidth("EACH NUMBER = ONE STORY BELOW", 1), 212, 1, GREY, "EACH NUMBER = ONE STORY BELOW", false);
  fillRect(MAP.x0, MAP.y0, MAP.x1 - MAP.x0, MAP.y1 - MAP.y0, OCEAN);
  // graticule
  for (const lat of [60, 30, 0, -30]) {
    const [, y] = project(0, lat);
    drawLine(MAP.x0, y, MAP.x1, y, [200, 214, 226]);
  }
  for (const poly of CONTINENTS) {
    fillPolygon(poly.map(([lo, la]) => project(lo, la)), LAND);
  }
  for (const [label, lon, lat] of MAP_LABELS) {
    const [x, y] = project(lon, lat);
    drawText(x - Math.floor(textWidth(label, 1) / 2), y - 3, 1, [52, 74, 48], label, true);
  }
  // frame
  drawLine(MAP.x0, MAP.y0, MAP.x1, MAP.y0, NAVY);
  drawLine(MAP.x0, MAP.y1, MAP.x1, MAP.y1, NAVY);
  drawLine(MAP.x0, MAP.y0, MAP.x0, MAP.y1, NAVY);
  drawLine(MAP.x1, MAP.y0, MAP.x1, MAP.y1, NAVY);

  // ---- pins (numbered in story order)
  let n = 0;
  for (const [, items] of SECTIONS) {
    for (const [lon, lat, dx, dy] of items) {
      n++;
      drawPin(n, lon, lat, dx, dy, n === 1);
    }
  }

  // ---- story index: three columns, fixed section assignment
  const colX = [28, 360, 692];
  const colW = 312;
  const top = 436, bottom = 946;
  const colSections = [
    ["MIDDLE EAST", "EUROPE"],
    ["ASIA-PACIFIC", "AMERICAS"],
    ["AFRICA", "GLOBAL", "SPORT"],
  ];
  const maxChars = 46;
  for (let c = 0; c < 3; c++) {
    let y = top;
    for (const secName of colSections[c]) {
      const sec = SECTIONS.find((s) => s[0] === secName);
      drawText(colX[c], y, 1, NAVY, secName, true);
      drawLine(colX[c], y + 10, colX[c] + colW, y + 10, RED);
      y += 16;
      for (const item of sec[1]) {
        n = SECTIONS.flatMap((s) => s[1]).indexOf(item) + 1;
        const lines = wrapText(item[4], maxChars);
        fillRect(colX[c], y, 16, 16, RED);
        drawText(colX[c] + 8 - Math.floor(textWidth(String(n), 1) / 2), y + 5, 1, WHITE, String(n), false);
        let ly = y + 1;
        for (const line of lines) {
          drawText(colX[c] + 22, ly, 1, INK, line, false);
          ly += 9;
        }
        y = Math.max(y + 22, ly + 5);
        if (y > bottom) break;
      }
      y += 4;
    }
    console.log("column " + (c + 1) + " ends at y=" + y);
  }
  drawLine(344, top, 344, bottom, LIGHT_LINE);
  drawLine(676, top, 676, bottom, LIGHT_LINE);

  // ---- footer: date check
  fillRect(0, 950, W, 3, RED);
  drawText(28, 960, 1, RED, "DATE CHECK", true);
  const dcLines = wrapText(DATE_CHECK, 150);
  let fy = 960;
  for (const line of dcLines) {
    drawText(28, fy, 1, INK, line, false);
    fy += 10;
  }
  drawText(28, 1004, 1, GREY, "SOURCES: BBC, REUTERS, AP, TIMES OF INDIA, USGS - ALL EVENTS DATED 22 NOVEMBER 2026", false);

  // ---- write
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG();
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  console.log("wrote " + outPath + " " + png.length + " bytes, " + total + " stories");
}

main();
