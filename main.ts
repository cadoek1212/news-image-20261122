// news-image-20261122 v2 — "The World in One Picture: Sunday 22 November 2026"
// Node 22+, standard library only, no network. Deterministic: two runs write
// identical bytes. Renders a 1024x1024 front page: masthead with the date, a
// lead story (COP31 collapses with no deal), a stylised world map, 40 numbered
// stories from 7 regions, and a DATE CHECK footer of big stories left out
// because they happened or were first reported before 22 November 2026.
// Every story was verified against reporting dated 22 November 2026.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---- palette: newsprint front page ---------------------------------------
const PAPER = [247, 243, 234];
const INK = [20, 20, 20];
const MUTED = [90, 86, 78];
const RED = [156, 43, 46];
const OCEAN = [207, 227, 238];
const LAND = [230, 217, 184];
const LANDLINE = [176, 155, 106];
const RULE = [180, 172, 156];
const WHITE = [255, 255, 255];

const REGION_COLORS: Record<string, [number, number, number]> = {
  "MIDDLE EAST": [156, 43, 46],
  EUROPE: [31, 78, 121],
  AFRICA: [138, 109, 27],
  "ASIA-PACIFIC": [46, 107, 52],
  AMERICAS: [91, 45, 138],
  GLOBAL: [68, 68, 68],
  SPORT: [15, 118, 110],
};

// ---- pixel buffer ---------------------------------------------------------
const px = new Uint8Array(W * H * 3);
function fill(c: [number, number, number]): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0];
    px[i * 3 + 1] = c[1];
    px[i * 3 + 2] = c[2];
  }
}
function setPix(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPix(xx, yy, c);
  }
}
function hline(x: number, y: number, w: number, c: [number, number, number]): void {
  fillRect(x, y, w, 1, c);
}
function vline(x: number, y: number, h: number, c: [number, number, number]): void {
  fillRect(x, y, 1, h, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: [number, number, number]): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPix(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
function fillCircle(cx: number, cy: number, r: number, c: [number, number, number]): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) setPix(cx + x, cy + y, c);
    }
  }
}
// Scanline polygon fill (even-odd), vertices as [x, y] pairs.
function fillPoly(pts: Array<[number, number]>, c: [number, number, number]): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = xs[k]; x <= xs[k + 1]; x++) setPix(x, y, c);
    }
  }
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    line(x0, y0, x1, y1, LANDLINE);
  }
}

// ---- PNG encoder (stdlib zlib, filter 0) ----------------------------------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font ------------------------------------------------------
// Each glyph: 7 rows, 5 bits each (bit 4 = leftmost pixel). ASCII only.
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x11, 0x0e],
  d: [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x08, 0x08, 0x1e, 0x08, 0x08, 0x08],
  g: [0x00, 0x00, 0x0f, 0x11, 0x11, 0x0f, 0x0e],
  h: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x15, 0x15],
  n: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x1e, 0x10],
  q: [0x00, 0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1e, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x15, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x06, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "-": [0, 0, 0, 0x1f, 0, 0, 0],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  "*": [0, 0x04, 0x15, 0x0e, 0x15, 0x04, 0],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  "@": [0x0e, 0x11, 0x17, 0x15, 0x16, 0x10, 0x0e],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  _: [0, 0, 0, 0, 0, 0, 0x1f],
  "[": [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  "]": [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  "|": [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  "\\": [0x10, 0x10, 0x08, 0x04, 0x02, 0x01, 0x01],
  "^": [0x04, 0x0a, 0x11, 0, 0, 0, 0],
  "~": [0, 0, 0x0e, 0x15, 0, 0, 0],
  "\u2022": [0, 0, 0x0e, 0x0e, 0x0e, 0, 0],
};
const BLANK = [0, 0, 0, 0, 0, 0, 0];

function drawChar(ch: string, x: number, y: number, s: number, c: [number, number, number]): void {
  const g = FONT[ch] ?? BLANK;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if ((g[r] >> (4 - col)) & 1) fillRect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function adv(scale: number): number {
  return scale === 2 ? 11 : 6 * scale;
}
function textWidth(s: string, scale: number): number {
  return s.length * adv(scale) - (adv(scale) - 5 * scale);
}
function drawText(s: string, x: number, y: number, scale: number, c: [number, number, number]): void {
  for (let i = 0; i < s.length; i++) drawChar(s[i], x + i * adv(scale), y, scale, c);
}
// Greedy word wrap; returns lines that fit maxChars per line.
function wrap(s: string, maxChars: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawWrapped(lines: string[], x: number, y: number, scale: number, c: [number, number, number], lh: number): number {
  let yy = y;
  for (const ln of lines) {
    drawText(ln, x, yy, scale, c);
    yy += lh;
  }
  return yy;
}

// ---- content: 40 numbered stories + lead, all first reported 22 Nov 2026 ---
interface Story {
  region: string;
  text: string;
}
const LEAD =
  "COP31 COLLAPSES: climate talks in Antalya end with NO deal after two days " +
  "of overtime. The EU and 130+ nations reject a text with no fossil fuels; " +
  "the first COP to fail since 2009. Next stop: COP32 in Addis Ababa.";
const STORIES: Story[] = [
  // MIDDLE EAST
  { region: "MIDDLE EAST", text: "Iran navy claims two supertankers hit mines east of Hormuz; unproven." },
  { region: "MIDDLE EAST", text: "Houthis claim a hit on Saudi's Rabigh refinery; coalition stops a missile." },
  { region: "MIDDLE EAST", text: "Gaza: six killed in the past day; two die of wounds from an al-Mawasi strike." },
  { region: "MIDDLE EAST", text: "Israel kills Hamas Rafah commander Samir Abu Younis in an al-Mawasi strike." },
  { region: "MIDDLE EAST", text: "Trump says he leans to striking Iran again after the new year if talks fail." },
  // EUROPE
  { region: "EUROPE", text: "Russia fires 186 drones at Ukraine overnight; a block in Dymer collapses." },
  { region: "EUROPE", text: "Dymer toll: at least four killed, ten missing; three dead in Vyshneve." },
  { region: "EUROPE", text: "Russia claims 792 Ukrainian drones downed; Kyiv claims 1,392 Russian." },
  { region: "EUROPE", text: "Zelenskyy: 2,700 drones, 1,460 bombs, 165 missiles hit Ukraine in a week." },
  { region: "EUROPE", text: "France splits over five EU states' Rwanda deportation plan; Macron opposed." },
  // AFRICA
  { region: "AFRICA", text: "Sea drones sink Russia's corvette Merkury at Benghazi; ten people hurt." },
  { region: "AFRICA", text: "A second cargo vessel is hit off Benghazi; Malta denies its flag." },
  { region: "AFRICA", text: "Sudan: RSF drones hit Khartoum, Omdurman; four dead, UN site hit." },
  // ASIA-PACIFIC
  { region: "ASIA-PACIFIC", text: "A 5.7 quake shakes central Japan; 22 hurt, windows smashed, trains halted." },
  { region: "ASIA-PACIFIC", text: "South Korea's KEPCO says hackers stole data from 650,000 customers." },
  { region: "ASIA-PACIFIC", text: "Tower Records Japan breach exposes 10.2 million online login records." },
  { region: "ASIA-PACIFIC", text: "India's Sarvam releases Sarvam-105B, a 105-billion-parameter open AI model." },
  { region: "ASIA-PACIFIC", text: "India passes Japan and Russia to rank third in the Lowy Asia Power Index." },
  // AMERICAS
  { region: "AMERICAS", text: "Delta tech outage delays 1,600+ flights; Atlanta ground stop in holiday rush." },
  { region: "AMERICAS", text: "Amtrak's Sunset Limited derails near Broussard; 96 aboard, four hurt." },
  { region: "AMERICAS", text: "Trump backs a 10% credit-card interest cap and vows to work with Democrats." },
  { region: "AMERICAS", text: "Cleverbridge breach: hackers copied card numbers, expiry dates and CVVs." },
  { region: "AMERICAS", text: "Trump names Kirsten Davies national cyber director after a wave of outages." },
  { region: "AMERICAS", text: "Army says it will detonate Iowa lead azide by Tuesday despite a court pause." },
  { region: "AMERICAS", text: "Jeffries vows an early push to ban stock trading by members of Congress." },
  { region: "AMERICAS", text: "Thanksgiving storms forecast for both US coasts: rain, snow and high winds." },
  { region: "AMERICAS", text: "Trump orders contractors to clear Congress requests with the White House." },
  // GLOBAL
  { region: "GLOBAL", text: "'Hunger Games: Sunrise on the Reaping' opens to $225 million worldwide." },
  { region: "GLOBAL", text: "OpenAI publishes its pretraining loss curve, proposes a cross-lab AI brake." },
  { region: "GLOBAL", text: "TikTok launches a deepfake-detection tool for public figures worldwide." },
  { region: "GLOBAL", text: "US governors unveil a bipartisan AI federalism plan for frontier models." },
  { region: "GLOBAL", text: "75 nations back a voluntary 35-by-35 global electrification pledge at COP31." },
  // SPORT
  { region: "SPORT", text: "Barcelona roar back from 2-0 down to beat Villarreal 3-2 in La Liga." },
  { region: "SPORT", text: "Liverpool thrash Manchester United 4-0 at Anfield in Pochettino's first game." },
  { region: "SPORT", text: "NFL: Cowboys rout Titans 51-30; Chiefs beat Cardinals 34-7; Eagles end skid." },
  { region: "SPORT", text: "49ers beat Vikings 35-10 in Mexico City; Bills, Lions and Panthers also win." },
];
// Stories left OUT because they happened or were first reported BEFORE 22 Nov.
const DATE_CHECK: string[] = [
  "Iran hits Bahrain industrial site, Sat 21 Nov; two hurt.",
  "Kryvyi Rih missile strike, 21 Nov; two killed, incl. a 7-year-old.",
  "Two Russian missiles and a drone down in Poland, night of 20 Nov.",
  "Trump-Xi-Putin trilateral summit, Shenzhen, 19-20 Nov.",
  "S&P 500 -3.7%, Nasdaq -5.3% in AI sell-off, Fri 20 Nov.",
  "GTA VI: $3.79bn first-day sales, reported Sat 21 Nov.",
  "Bayer $7.25bn Roundup deal approved by a Missouri judge, Fri 20 Nov.",
  "FBI probes apparent hack of its NCIC crime database, reported 21 Nov.",
  "'El Chapo Isidro' captured Fri night 20 Nov; announced Sat 21 Nov.",
  "EU-Indonesia trade deal signed Sat 21 Nov after a decade of talks.",
  "Cikande candy-factory fire began Sat evening 21 Nov; toll later 24.",
  "Lewis Pugh's 15km Hormuz swim announced 21 Nov.",
  "Paolo Bulgari dies at 89, announced Sat 21 Nov; Tom Jackson dies at 75.",
  "'90 Day Fiance' star Sheila Mangubat dies at 35, Sat 21 Nov.",
  "Waymo double robotaxi recall announced Fri 20 Nov; CA ban since 11 Nov.",
  "Russian cargo ship Sparta II hit by a drone in the Baltic, 21 Nov.",
  "Five EU states announce Rwanda deportation-hub plan, 16 Nov.",
  "Japan and India agree deeper defence cooperation, Thu 19 Nov.",
  "Trump and Xi agree humans stay in the loop on military AI, 20 Nov.",
  "BepiColombo starts orbiting Mercury 23 Nov - after this day, not 22 Nov.",
];

// ---- stylised world map (lon/lat polygons, equirectangular) ---------------
const MAP_X = 648;
const MAP_Y = 14;
const MAP_W = 360;
const MAP_H = 96;
function ll(lon: number, lat: number): [number, number] {
  return [
    Math.round(MAP_X + ((lon + 180) / 360) * MAP_W),
    Math.round(MAP_Y + ((75 - lat) / 130) * MAP_H),
  ];
}
function polyLL(coords: Array<[number, number]>): Array<[number, number]> {
  return coords.map(([lo, la]) => ll(lo, la));
}
const CONTINENTS: Array<Array<[number, number]>> = [
  [[-168, 66], [-140, 70], [-120, 72], [-95, 80], [-80, 73], [-60, 60], [-55, 47], [-70, 42], [-75, 35], [-80, 26], [-90, 21], [-97, 16], [-105, 20], [-115, 28], [-125, 40], [-125, 49], [-145, 60]],
  [[-58, 64], [-45, 60], [-30, 68], [-40, 76], [-58, 74]],
  [[-80, 10], [-70, 12], [-60, 5], [-50, 0], [-35, -8], [-40, -20], [-50, -30], [-60, -38], [-70, -50], [-75, -40], [-75, -20], [-80, -5]],
  [[-10, 36], [-5, 44], [0, 48], [5, 58], [10, 58], [18, 56], [21, 55], [28, 60], [30, 70], [40, 68], [45, 60], [40, 50], [30, 45], [23, 40], [19, 42], [12, 44], [3, 42], [-2, 37], [-9, 38]],
  [[-17, 15], [-10, 30], [0, 35], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [48, 11], [40, 0], [35, -18], [30, -28], [20, -35], [15, -28], [12, -18], [9, 4], [-8, 5], [-13, 8]],
  [[45, 68], [60, 70], [75, 73], [100, 76], [120, 73], [140, 72], [160, 70], [178, 66], [170, 60], [160, 55], [145, 50], [140, 40], [130, 35], [127, 33], [120, 30], [110, 20], [105, 10], [100, 8], [95, 15], [90, 22], [85, 20], [80, 8], [75, 10], [70, 22], [60, 25], [55, 28], [50, 30], [45, 40], [40, 45]],
  [[113, -22], [114, -30], [120, -34], [130, -32], [140, -38], [150, -37], [153, -27], [146, -19], [142, -11], [135, -12], [130, -13], [122, -14]],
  [[-5, 50], [-3, 53], [-5, 56], [-2, 58], [0, 53]],
  [[130, 31], [133, 34], [137, 35], [140, 38], [142, 42], [145, 44], [143, 42], [140, 36], [136, 33], [131, 31]],
  [[95, 5], [100, 0], [105, -5], [110, -7], [115, -8], [120, -10], [125, -8], [130, -3], [135, -4], [140, -8]],
  [[167, -45], [170, -42], [174, -38], [177, -38], [175, -41], [170, -44]],
];
const PINS: Array<{ lon: number; lat: number; label: string; color: [number, number, number] }> = [
  { lon: 45, lat: 30, label: "ME", color: REGION_COLORS["MIDDLE EAST"] },
  { lon: 15, lat: 54, label: "EU", color: REGION_COLORS.EUROPE },
  { lon: 20, lat: 6, label: "AF", color: REGION_COLORS.AFRICA },
  { lon: 95, lat: 48, label: "AS", color: REGION_COLORS["ASIA-PACIFIC"] },
  { lon: -100, lat: 42, label: "AM", color: REGION_COLORS.AMERICAS },
  { lon: 135, lat: -25, label: "OC", color: REGION_COLORS["ASIA-PACIFIC"] },
];

// ---- layout ----------------------------------------------------------------
const MARGIN = 16;
const COL_W = 488;
const COL_X = [MARGIN, MARGIN + COL_W + 16];
const BODY_SCALE = 2;
const BODY_ADV = 11; // 5px glyph at scale 2 + 1px gap
const BODY_LH = 14;
const BODY_CHARS = Math.floor((COL_W - 40) / BODY_ADV); // text width after number gutter
const STORY_GAP = 3;
const HEAD_H = 20;

function drawRegionHead(x: number, y: number, region: string): void {
  const c = REGION_COLORS[region];
  fillRect(x, y, 4, 16, c);
  drawText(region, x + 10, y + 1, 2, c);
  hline(x, y + 18, COL_W, RULE);
}

function drawStory(x: number, y: number, n: number, s: Story): number {
  const c = REGION_COLORS[s.region];
  const num = String(n);
  drawText(num, x + 34 - textWidth(num, 2), y, 2, c);
  const lines = wrap(s.text, BODY_CHARS);
  drawWrapped(lines, x + 40, y, BODY_SCALE, INK, BODY_LH);
  return y + lines.length * BODY_LH + STORY_GAP;
}

function render(): void {
  fill(PAPER);

  // ---- masthead -----------------------------------------------------------
  drawText("THE WORLD IN ONE PICTURE", MARGIN, 18, 3, RED);
  drawText("SUNDAY 22 NOVEMBER 2026", MARGIN, 44, 4, INK);
  drawText("37 STORIES - 7 REGIONS - ALL FIRST REPORTED ON 22 NOVEMBER 2026", MARGIN, 78, 1, MUTED);

  // ---- mini world map, top right ------------------------------------------
  fillRect(MAP_X, MAP_Y, MAP_W, MAP_H, OCEAN);
  for (const cont of CONTINENTS) fillPoly(polyLL(cont), LAND);
  for (const p of PINS) {
    const [pxx, pyy] = ll(p.lon, p.lat);
    fillCircle(pxx, pyy, 5, p.color);
    drawText(p.label, pxx + 7, pyy - 3, 1, INK);
  }
  drawText("WHERE IT HAPPENED", MAP_X, MAP_Y + MAP_H + 4, 1, MUTED);

  // ---- lead story -----------------------------------------------------------
  const leadY = 122;
  hline(MARGIN, leadY, W - 2 * MARGIN, RULE);
  hline(MARGIN, leadY + 2, W - 2 * MARGIN, RULE);
  drawText("LEAD", MARGIN, leadY + 10, 2, RED);
  const leadLines = wrap(LEAD, Math.floor((W - 2 * MARGIN - 70) / BODY_ADV));
  drawWrapped(leadLines, MARGIN + 66, leadY + 10, BODY_SCALE, INK, BODY_LH);
  const afterLead = leadY + 10 + leadLines.length * BODY_LH + 8;
  hline(MARGIN, afterLead, W - 2 * MARGIN, RULE);

  // ---- story columns --------------------------------------------------------
  const leftRegions = ["MIDDLE EAST", "EUROPE", "AFRICA", "ASIA-PACIFIC"];
  const rightRegions = ["AMERICAS", "GLOBAL", "SPORT"];
  let n = 1;
  let maxY = afterLead;
  for (let col = 0; col < 2; col++) {
    let y = afterLead + 10;
    const regions = col === 0 ? leftRegions : rightRegions;
    for (const region of regions) {
      drawRegionHead(COL_X[col], y, region);
      y += HEAD_H + 4;
      for (const s of STORIES) {
        if (s.region !== region) continue;
        y = drawStory(COL_X[col], y, n, s);
        n++;
      }
      y += 6;
    }
    if (y > maxY) maxY = y;
  }

  // ---- DATE CHECK footer ------------------------------------------------------
  const footY = maxY + 2;
  fillRect(MARGIN, footY, W - 2 * MARGIN, 2, RED);
  drawText("DATE CHECK: LEFT OUT - HAPPENED OR FIRST REPORTED BEFORE 22 NOV 2026", MARGIN, footY + 8, 1, RED);
  const dcChars = 78;
  const dcColW = Math.floor((W - 2 * MARGIN) / 2);
  const half = Math.ceil(DATE_CHECK.length / 2);
  let dcEndY = footY + 26;
  for (let col = 0; col < 2; col++) {
    let y = footY + 26;
    const items = DATE_CHECK.slice(col * half, (col + 1) * half);
    for (const item of items) {
      const lines = wrap("- " + item, dcChars);
      for (const ln of lines) {
        drawText(ln, MARGIN + col * dcColW, y, 1, MUTED);
        y += 9;
      }
    }
    if (y > dcEndY) dcEndY = y;
  }
  const srcY = dcEndY + 6;
  drawText("Sources: BBC - Reuters - AP - AFP - Al Jazeera - Variety - FlightAware - UKMTO. CLAIM = asserted, not independently confirmed.", MARGIN, srcY, 1, MUTED);
}

function main(): void {
  render();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "entry.png");
  writeFileSync(out, encodePNG());
  console.log(`WROTE ${out} ${W}x${H} stories=${STORIES.length + 1} regions=7 datecheck=${DATE_CHECK.length}`);
}

main();
