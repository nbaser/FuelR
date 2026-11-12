// Erzeugt die PWA-Icons (PNG) ohne externe Abhängigkeiten.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#3b7e9b'), TOP = hex('#7dd8c3'), BOTTOM = hex('#fbd7a7');

function shade(u, v) {
  // u,v in 0..64 (Koordinaten wie favicon.svg)
  const r = 14, inRect = (() => {
    const cx = Math.min(Math.max(u, r), 64 - r), cy = Math.min(Math.max(v, r), 64 - r);
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
  })();
  if (!inRect) return null;
  const inCircle = (u - 32) ** 2 + (v - 40) ** 2 <= 17 * 17;
  const inTip = v >= 10 && v <= 40 && Math.abs(u - 32) <= 17 * Math.pow((v - 10) / 30, 0.75);
  if (inCircle || inTip) return v >= 38 ? BOTTOM : TOP;
  return BG;
}

function png(size) {
  const ss = 4, rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = shade(((x + (sx + 0.5) / ss) / size) * 64, ((y + (sy + 0.5) / ss) / size) * 64);
        if (c) { acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255; }
      }
      const n = ss * ss, a = acc[3] / n;
      const k = acc[3] ? n / (acc[3] / 255) : 1;
      row.push(Math.round((acc[0] / n) * k), Math.round((acc[1] / n) * k), Math.round((acc[2] / n) * k), Math.round(a));
    }
    rows.push(Buffer.from(row));
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
console.log('Icons erzeugt');
