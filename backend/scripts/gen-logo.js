/**
 * Genera icon-192.png e icon-512.png con el logo de Reparto Justo.
 * Fondo navy #0F172A, fondo badge amarillo #FFCC00, letras RJ en navy.
 * Sin dependencias externas — solo módulos built-in de Node.js.
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const NAVY   = [15, 23, 42];
const YELLOW = [255, 204, 0];
const WHITE  = [255, 255, 255];

// ── Bitmap font 5×7 ──────────────────────────────────────────────────────────
const FONT = {
  R: [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,1,0,0],
    [1,0,0,1,0],
    [1,0,0,0,1],
  ],
  J: [
    [0,0,1,1,1],
    [0,0,0,1,0],
    [0,0,0,1,0],
    [0,0,0,1,0],
    [1,0,0,1,0],
    [1,0,0,1,0],
    [0,1,1,0,0],
  ],
};

// ── CRC32 ────────────────────────────────────────────────────────────────────
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

function pngChunk(type, data) {
  const tBuf = Buffer.from(type, 'ascii');
  const len  = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc  = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tBuf, data])), 0);
  return Buffer.concat([len, tBuf, data, crc]);
}

// ── Generar PNG desde buffer de píxeles RGB ───────────────────────────────────
function pixelsToPNG(size, pixels) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const rowLen = 1 + size * 3;
  const raw    = Buffer.alloc(size * rowLen);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels[y * size + x];
      raw[y * rowLen + 1 + x * 3]     = r;
      raw[y * rowLen + 1 + x * 3 + 1] = g;
      raw[y * rowLen + 1 + x * 3 + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Dibujar el logo ───────────────────────────────────────────────────────────
function makeLogo(size) {
  const pixels = Array.from({ length: size * size }, () => [...NAVY]);

  function setPixel(x, y, color) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    pixels[y * size + x] = [...color];
  }

  function fillRect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x + dx, y + dy, color);
  }

  // Fondo badge amarillo con bordes redondeados
  const pad    = Math.round(size * 0.07);
  const inner  = size - pad * 2;
  const radius = Math.round(size * 0.22);

  for (let y = pad; y < size - pad; y++) {
    for (let x = pad; x < size - pad; x++) {
      const rx = x - pad, ry = y - pad;
      let inside = true;
      if (rx < radius && ry < radius) {
        const dx = rx - radius, dy = ry - radius;
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (rx >= inner - radius && ry < radius) {
        const dx = rx - (inner - radius - 1), dy = ry - radius;
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (rx < radius && ry >= inner - radius) {
        const dx = rx - radius, dy = ry - (inner - radius - 1);
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (rx >= inner - radius && ry >= inner - radius) {
        const dx = rx - (inner - radius - 1), dy = ry - (inner - radius - 1);
        inside = dx * dx + dy * dy <= radius * radius;
      }
      if (inside) setPixel(x, y, YELLOW);
    }
  }

  // Letras RJ en navy
  const scale  = Math.round(size / 13);
  const letterW = 5 * scale;
  const gap    = Math.round(scale * 1.5);
  const totalW = letterW * 2 + gap;
  const totalH = 7 * scale;
  const startX = Math.round((size - totalW) / 2);
  const startY = Math.round((size - totalH) / 2);

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (FONT.R[row][col]) fillRect(startX + col * scale, startY + row * scale, scale, scale, NAVY);
      if (FONT.J[row][col]) fillRect(startX + letterW + gap + col * scale, startY + row * scale, scale, scale, NAVY);
    }
  }

  return pixelsToPNG(size, pixels);
}

// ── Escribir archivos ─────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'public');

fs.writeFileSync(path.join(outDir, 'icon-192.png'), makeLogo(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makeLogo(512));

console.log('✓ icon-192.png e icon-512.png generados en backend/public/');
