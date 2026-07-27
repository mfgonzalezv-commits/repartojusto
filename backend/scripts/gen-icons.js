/**
 * Genera íconos PNG para la PWA del rider.
 * Usa solo módulos built-in de Node.js (sin dependencias externas).
 * Genera fondo negro #1C1C1C, 192x192 y 512x512.
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 (necesario para chunks PNG) ─────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const tBuf = Buffer.from(type, 'ascii');
  const len  = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc  = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tBuf, data])), 0);
  return Buffer.concat([len, tBuf, data, crc]);
}

// ── Generar PNG solid-color ────────────────────────────────────────────────────
function makePNG(size, r, g, b) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  // Filas: [filtro=0] + [R,G,B] × size
  const rowLen = 1 + size * 3;
  const raw    = Buffer.alloc(size * rowLen);
  for (let y = 0; y < size; y++) {
    const o = y * rowLen;
    raw[o] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      raw[o + 1 + x*3]     = r;
      raw[o + 1 + x*3 + 1] = g;
      raw[o + 1 + x*3 + 2] = b;
    }
  }

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Escribir archivos ──────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'public');

// Fondo #1C1C1C = rgb(28, 28, 28)
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makePNG(192, 28, 28, 28));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makePNG(512, 28, 28, 28));

console.log('✓ icon-192.png y icon-512.png generados en backend/public/');
