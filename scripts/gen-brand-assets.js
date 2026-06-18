// 字垣 — 品牌资产 PNG 生成器（图标 / 自适应图标前景·背景·单色 / favicon）
//
// 纯 Node、零第三方依赖：移植 src/game/fingerprint.ts 的 buildFingerprint/rotateMatrix/cellHash
// （逐字一致、确定性），用内置 zlib(deflate) + 手写 CRC32 编码 PNG。
// 启动页 splash.png 含中文（字垣 + 标语）需字体渲染 → 见 brand-assets.html（浏览器下载）。
//
// 用法： node scripts/gen-brand-assets.js   → 产出 assets/ 下 5 个 PNG

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── 移植自 src/game/fingerprint.ts（逐字一致） ─────────────────────────
function rotateMatrix(m, rotation) {
  const times = (((Math.floor(rotation / 90) % 4) + 4) % 4);
  let out = m;
  for (let t = 0; t < times; t++) {
    const rows = out.length; if (rows === 0) break;
    const cols = out[0].length;
    const next = [];
    for (let c = 0; c < cols; c++) {
      const row = [];
      for (let r = 0; r < rows; r++) row.push(out[rows - 1 - r][c]);
      next.push(row);
    }
    out = next;
  }
  return out;
}
function cellHash(seed, r, c) {
  const x = (Math.imul(seed | 0, 374761393)
    ^ Math.imul(r + 1, 2654435761)
    ^ Math.imul(c + 1, 2246822519)) >>> 0;
  return x % 1000;
}
function buildFingerprint(input) {
  const cardHoles = input.cardHoles;
  const cardSize = Math.max(3, input.cardSize);
  const half = Math.floor(cardSize / 2);
  const seed = input.seed | 0;
  const timeRatio = Math.max(0, Math.min(1, input.timeRatio));
  const holeSet = new Set(cardHoles.map(h => `${h.offsetX},${h.offsetY}`));
  const local = [];
  for (let r = 0; r < cardSize; r++) {
    const row = [];
    for (let c = 0; c < cardSize; c++) {
      const dx = c - half, dy = r - half;
      const isCorner = Math.abs(dx) === half && Math.abs(dy) === half;
      const isEdge = Math.abs(dx) === half || Math.abs(dy) === half;
      const h = cellHash(seed, r, c) / 1000;
      if (holeSet.has(`${dx},${dy}`)) row.push('hole');
      else if (isCorner) row.push(h > 0.5 ? 'body' : 'empty');
      else if (isEdge) row.push(h > 0.15 ? 'body' : 'empty');
      else row.push('body');
    }
    local.push(row);
  }
  const rotated = rotateMatrix(local, input.solutionRotation);
  const N = cardSize + 2;
  const grid = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) {
      if (r >= 1 && r <= cardSize && c >= 1 && c <= cardSize) {
        const v = rotated[r - 1][c - 1];
        row.push(v === 'hole' ? 'hole' : v === 'body' ? 'body' : 'bg');
      } else row.push('bg');
    }
    grid.push(row);
  }
  const place2x2 = (r0, c0, type) => {
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) grid[r0 + dr][c0 + dc] = type;
  };
  const corners = [[0, 0], [0, N - 2], [N - 2, N - 2], [N - 2, 0]];
  const badgeIdx = (((Math.floor(input.solutionRotation / 90) % 4) + 4) % 4);
  const badgeType = input.pureSolve ? 'badgePure' : 'badgeUsed';
  for (let i = 0; i < 4; i++) {
    const [r0, c0] = corners[i];
    place2x2(r0, c0, i === badgeIdx ? badgeType : 'finder');
  }
  const ring = [];
  for (let c = 2; c <= N - 3; c++) ring.push([0, c]);
  for (let r = 2; r <= N - 3; r++) ring.push([r, N - 1]);
  for (let c = N - 3; c >= 2; c--) ring.push([N - 1, c]);
  for (let r = N - 3; r >= 2; r--) ring.push([r, 0]);
  const lit = Math.round(timeRatio * ring.length);
  for (let i = 0; i < lit && i < ring.length; i++) {
    const [r, c] = ring[i];
    grid[r][c] = 'frame';
  }
  return { size: N, grid };
}

// ── PNG 编码（内置 zlib + 手写 CRC32） ────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter = None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// 校验 PNG：签名 / IHDR 尺寸 / 每块 CRC / IDAT 解压后长度，全过才算合法。
function verifyPNG(file, expectW, expectH) {
  const buf = fs.readFileSync(file);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error(`${file}: PNG 签名错`);
  let p = 8, w = 0, h = 0, idatLen = 0;
  const idatChunks = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    const crc = buf.readUInt32BE(p + 8 + len);
    if (crc32(Buffer.concat([buf.slice(p + 4, p + 8), data])) !== crc) throw new Error(`${file}: 块 ${type} CRC 错`);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idatChunks.push(data);
    if (type === 'IEND') break;
    p += 8 + len + 4;
  }
  if (w !== expectW || h !== expectH) throw new Error(`${file}: 尺寸 ${w}x${h} ≠ 期望 ${expectW}x${expectH}`);
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  if (raw.length !== (expectW * 4 + 1) * expectH) throw new Error(`${file}: IDAT 解压长度 ${raw.length} ≠ 期望 ${(expectW * 4 + 1) * expectH}`);
  return true;
}

// ── 调色板（移植自 BookmarkCard / config.ts） ─────────────────────────
const PAL = {
  bgOpaque: [0x14, 0x11, 0x0A], // #14110A 卡片底
  body: [0x2E, 0x25, 0x17],     // 卡身
  hole: [0x4C, 0xAF, 0x50],     // 绿（正解透字位）
  finder: [0xC8, 0xA9, 0x6E],   // 金（定位符）
  frame: [0xC8, 0xA9, 0x6E],    // 金（计时框）
  badgePure: [0x4C, 0xAF, 0x50],// 绿徽章
  badgeUsed: [0xC8, 0x82, 0x4E],// 琥珀徽章
  mono: [0xFF, 0xFF, 0xFF],     // 单色剪影（Android 取 alpha 着色）
};
function colorFor(type, transparentBg, mono) {
  if (type === 'bg') return transparentBg ? [0, 0, 0, 0] : [...PAL.bgOpaque, 255];
  if (mono) return [...PAL.mono, 255];
  if (type === 'body') return [...PAL.body, 255];
  if (type === 'hole') return [...PAL.hole, 255];
  if (type === 'finder') return [...PAL.finder, 255];
  if (type === 'frame') return [...PAL.frame, 255];
  if (type === 'badgePure') return [...PAL.badgePure, 255];
  if (type === 'badgeUsed') return [...PAL.badgeUsed, 255];
  return transparentBg ? [0, 0, 0, 0] : [...PAL.bgOpaque, 255];
}
function fillRect(rgba, W, H, x0, y0, x1, y1, c) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const i = (y * W + x) * 4;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3];
    }
}
// 把指纹 grid 画进 W×H 画布，block 居中占 (W-2*margin)；Σ span===block 无缝无溢出
function renderFingerprint(fp, W, H, margin, opts) {
  const { transparentBg, mono } = opts;
  const N = fp.size;
  const block = W - 2 * margin;
  const base = Math.max(1, Math.floor(block / N));
  const extra = block - base * N;
  const span = (i) => base + (i < extra ? 1 : 0);
  const off = []; let acc = 0;
  for (let i = 0; i < N; i++) { off.push(acc); acc += span(i); }
  const rgba = Buffer.alloc(W * H * 4);
  fillRect(rgba, W, H, 0, 0, W, H, transparentBg ? [0, 0, 0, 0] : [...PAL.bgOpaque, 255]);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const col = colorFor(fp.grid[r][c], transparentBg, mono);
      const x0 = margin + off[c], y0 = margin + off[r];
      fillRect(rgba, W, H, x0, y0, x0 + span(c), y0 + span(r), col);
    }
  }
  return rgba;
}

// ── 图标指纹输入（确定性，精心挑选的镂空图案） ─────────────────────────
const ICON_INPUT = {
  cardSize: 9, // → N=11
  cardHoles: [
    { offsetX: -3, offsetY: -2 }, { offsetX: -2, offsetY: 2 },
    { offsetX: 0, offsetY: -3 }, { offsetX: 3, offsetY: -1 },
    { offsetX: 2, offsetY: 3 }, { offsetX: -1, offsetY: 3 },
    { offsetX: -3, offsetY: 1 }, { offsetX: 1, offsetY: -1 },
  ],
  solutionRotation: 90, // 徽章落 TR
  timeRatio: 0.62,      // 外环 ~62% 点亮
  pureSolve: true,      // 绿徽章
  seed: 7,
};

function main() {
  const fp = buildFingerprint(ICON_INPUT);
  const outDir = path.resolve(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });

  // ASCII 预览（sanity check 镂空布局）
  const G = { bg: '·', body: '█', hole: '◆', finder: '▓', frame: '▓', badgePure: '●', badgeUsed: '●' };
  console.log(`指纹预览 (${fp.size}×${fp.size}):`);
  for (const row of fp.grid) console.log('  ' + row.map(t => G[t]).join(''));

  const jobs = [
    { name: 'icon.png', W: 1024, H: 1024, margin: 70, opts: { transparentBg: false, mono: false } },
    { name: 'adaptive-icon-foreground.png', W: 1024, H: 1024, margin: 175, opts: { transparentBg: true, mono: false } },
    { name: 'adaptive-icon-background.png', W: 1024, H: 1024, margin: 0, opts: { solid: true } },
    { name: 'adaptive-icon-monochrome.png', W: 1024, H: 1024, margin: 175, opts: { transparentBg: true, mono: true } },
    { name: 'favicon.png', W: 48, H: 48, margin: 3, opts: { transparentBg: false, mono: false } },
  ];
  for (const j of jobs) {
    let rgba;
    if (j.opts.solid) {
      rgba = Buffer.alloc(j.W * j.H * 4);
      fillRect(rgba, j.W, j.H, 0, 0, j.W, j.H, [...PAL.bgOpaque, 255]);
    } else {
      rgba = renderFingerprint(fp, j.W, j.H, j.margin, j.opts);
    }
    const png = encodePNG(j.W, j.H, rgba);
    const file = path.join(outDir, j.name);
    fs.writeFileSync(file, png);
    verifyPNG(file, j.W, j.H); // 结构/CRC/尺寸/解压全过才继续
    console.log(`✓ ${j.name}  ${j.W}×${j.H}  ${(png.length / 1024).toFixed(1)} KB  (PNG 校验通过)`);
  }
  console.log('完成 → assets/  （splash.png 含中文，请用 brand-assets.html 下载）');
}
main();
