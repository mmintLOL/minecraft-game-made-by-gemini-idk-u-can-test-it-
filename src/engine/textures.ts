import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, BLOCK_DEFS, BlockType } from './blocks';

const TILE_PX = 16;

export interface BlockAtlasTextures {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  metalness: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
  tileCanvas: HTMLCanvasElement;
}

function hash2(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface TileBuffers {
  albedo: Uint8ClampedArray;
  height: Float32Array;
  roughness: Float32Array;
  metalness: Float32Array;
  emissive: Uint8ClampedArray;
}

function createTileBuffers(): TileBuffers {
  const count = TILE_PX * TILE_PX;
  return {
    albedo: new Uint8ClampedArray(count * 4),
    height: new Float32Array(count),
    roughness: new Float32Array(count).fill(0.85),
    metalness: new Float32Array(count).fill(0.0),
    emissive: new Uint8ClampedArray(count * 4),
  };
}

function setPx(
  buf: TileBuffers,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
  h = 0.5,
  rough = 0.85,
  metal = 0.0,
  er = 0,
  eg = 0,
  eb = 0
) {
  const i = y * TILE_PX + x;
  const i4 = i * 4;
  buf.albedo[i4] = clampByte(r);
  buf.albedo[i4 + 1] = clampByte(g);
  buf.albedo[i4 + 2] = clampByte(b);
  buf.albedo[i4 + 3] = clampByte(a);
  buf.height[i] = h;
  buf.roughness[i] = rough;
  buf.metalness[i] = metal;
  buf.emissive[i4] = clampByte(er);
  buf.emissive[i4 + 1] = clampByte(eg);
  buf.emissive[i4 + 2] = clampByte(eb);
  buf.emissive[i4 + 3] = 255;
}

function buildTile(tileId: number): TileBuffers {
  const buf = createTileBuffers();

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = hash2(x, y, tileId * 97 + 13);
      const n2 = hash2(x >> 1, y >> 1, tileId * 53 + 7);

      switch (tileId) {
        case 0: {
          // Grass Top: lush varied emerald/moss pixels
          const shade = (n - 0.5) * 32 + (n2 - 0.5) * 18;
          setPx(buf, x, y, 88 + shade, 158 + shade * 1.1, 56 + shade * 0.6, 255, 0.45 + n * 0.35, 0.88);
          break;
        }
        case 1: {
          // Grass Side: dirt with organic overhanging grass fringe
          const edge = 3 + Math.floor(hash2(x, 0, 41) * 3);
          if (y < edge) {
            const shade = (n - 0.5) * 26;
            setPx(buf, x, y, 86 + shade, 156 + shade, 54 + shade * 0.5, 255, 0.65 + n * 0.2, 0.85);
          } else {
            const dShade = (n - 0.5) * 28;
            const pebble = n > 0.88 ? -20 : 0;
            setPx(
              buf,
              x,
              y,
              130 + dShade + pebble,
              90 + dShade * 0.8 + pebble,
              60 + dShade * 0.6 + pebble,
              255,
              0.35 + n * 0.25,
              0.92
            );
          }
          break;
        }
        case 2: {
          // Dirt
          const dShade = (n - 0.5) * 30 + (n2 - 0.5) * 16;
          const pebble = n > 0.9 ? -22 : n < 0.08 ? 16 : 0;
          setPx(
            buf,
            x,
            y,
            132 + dShade + pebble,
            92 + dShade * 0.8 + pebble,
            62 + dShade * 0.6 + pebble,
            255,
            0.3 + n * 0.35,
            0.94
          );
          break;
        }
        case 3: {
          // Stone: stratified mineral grain
          const band = hash2(x >> 1, y, 301) * 16;
          const shade = (n - 0.5) * 22 + band - 8;
          const crack = (x + y * 2) % 11 === 0 && n > 0.55 ? -18 : 0;
          setPx(
            buf,
            x,
            y,
            124 + shade + crack,
            129 + shade + crack,
            135 + shade + crack,
            255,
            0.4 + (shade + crack) * 0.01,
            0.78
          );
          break;
        }
        case 4: {
          // Cobblestone: distinct bevelled stone bricks with mortar grooves
          const bx = (x + (y >= 8 ? 4 : 0)) % 8;
          const by = y % 8;
          const isMortar = bx === 0 || by === 0;
          const cellSeed = hash2(Math.floor((x + (y >= 8 ? 4 : 0)) / 8), Math.floor(y / 8), 88);
          const base = 108 + (cellSeed - 0.5) * 34 + (n - 0.5) * 16;
          if (isMortar) {
            setPx(buf, x, y, 64, 68, 74, 255, 0.15, 0.92);
          } else {
            const bevel = bx === 1 || by === 1 ? 14 : bx === 7 || by === 7 ? -12 : 0;
            setPx(buf, x, y, base + bevel, base + bevel + 2, base + bevel + 6, 255, 0.65 + bevel * 0.015, 0.72);
          }
          break;
        }
        case 5: {
          // Sand: warm wind-rippled quartz grains
          const ripple = Math.sin(y * 0.8 + x * 0.3) * 6;
          const shade = (n - 0.5) * 18 + ripple;
          const sparkle = n > 0.94 ? 0.35 : 0.78;
          setPx(buf, x, y, 224 + shade, 206 + shade, 150 + shade * 0.8, 255, 0.45 + ripple * 0.02 + n * 0.1, sparkle);
          break;
        }
        case 6: {
          // Oak Log Top: concentric tree rings + bark rim
          const dx = x - 7.5;
          const dy = y - 7.5;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 6.8) {
            const b = (n - 0.5) * 20;
            setPx(buf, x, y, 92 + b, 66 + b, 42 + b, 255, 0.7, 0.9);
          } else {
            const ring = Math.sin(dist * 2.4) * 14 + (n - 0.5) * 10;
            setPx(buf, x, y, 178 + ring, 142 + ring * 0.8, 94 + ring * 0.6, 255, 0.45 + ring * 0.01, 0.84);
          }
          break;
        }
        case 7: {
          // Oak Log Side: vertical ridged bark
          const ridge = hash2(x, y >> 2, 709) * 26 - 13;
          const furrow = x % 3 === 0 ? -16 : 6;
          const shade = ridge + furrow + (n - 0.5) * 12;
          setPx(buf, x, y, 102 + shade, 74 + shade * 0.8, 46 + shade * 0.5, 255, 0.5 + furrow * 0.018, 0.92);
          break;
        }
        case 8: {
          // Oak Leaves: rich layered foliage clusters
          const cluster = hash2(x >> 1, y >> 1, 511);
          const shade = (cluster - 0.5) * 40 + (n - 0.5) * 22;
          const darkGap = n < 0.18 ? -34 : 0;
          setPx(
            buf,
            x,
            y,
            58 + shade + darkGap,
            124 + shade * 1.1 + darkGap,
            42 + shade * 0.5 + darkGap,
            255,
            0.35 + cluster * 0.5,
            0.82
          );
          break;
        }
        case 9: {
          // Oak Planks: horizontal wood boards with nail/seam lines
          const plankRow = Math.floor(y / 4);
          const isSeam = y % 4 === 0 || (x + plankRow * 6) % 16 === 0;
          const grain = hash2(x >> 2, y, 901) * 16 - 8;
          const boardTone = (hash2(plankRow, 0, 33) - 0.5) * 16;
          if (isSeam) {
            setPx(buf, x, y, 118, 86, 50, 255, 0.2, 0.86);
          } else {
            const s = grain + boardTone + (n - 0.5) * 8;
            setPx(buf, x, y, 174 + s, 132 + s * 0.8, 82 + s * 0.5, 255, 0.58 + grain * 0.01, 0.72);
          }
          break;
        }
        case 10: {
          // Optical Glass: sleek metallic frame + faint diagonal specular streaks
          const isFrame = x === 0 || y === 0 || x === 15 || y === 15;
          const streak = (x + y >= 6 && x + y <= 8) || (x + y >= 21 && x + y <= 22);
          if (isFrame) {
            setPx(buf, x, y, 188, 232, 248, 230, 0.8, 0.15, 0.4);
          } else if (streak) {
            setPx(buf, x, y, 230, 248, 255, 130, 0.5, 0.05, 0.1);
          } else {
            setPx(buf, x, y, 165, 222, 242, 48, 0.5, 0.06, 0.1);
          }
          break;
        }
        case 11: {
          // Glowstone: warm amber crystalline cells with dark gold veins
          const cell = hash2(x >> 1, y >> 1, 111);
          const border = x === 0 || y === 0 || x === 15 || y === 15 || cell < 0.22;
          if (border) {
            setPx(buf, x, y, 148, 96, 36, 255, 0.3, 0.65, 0.15, 90, 48, 10);
          } else {
            const bright = 215 + cell * 40;
            setPx(buf, x, y, bright, bright * 0.82, 110, 255, 0.75, 0.35, 0.1, bright, bright * 0.72, 65);
          }
          break;
        }
        case 12: {
          // Diamond Ore: stone matrix embedded with glowing cyan diamond crystals
          const band = hash2(x >> 1, y, 301) * 16;
          const shade = (n - 0.5) * 20 + band - 8;
          const isGem =
            (x >= 3 && x <= 5 && y >= 3 && y <= 5) ||
            (x >= 10 && x <= 12 && y >= 5 && y <= 8) ||
            (x >= 5 && x <= 8 && y >= 10 && y <= 13) ||
            (x === 12 && y === 12);
          if (isGem) {
            const facet = (x + y) % 2 === 0 ? 30 : 0;
            setPx(buf, x, y, 62 + facet, 235, 255, 255, 0.9, 0.12, 0.25, 35, 215, 255);
          } else {
            setPx(buf, x, y, 120 + shade, 125 + shade, 132 + shade, 255, 0.4, 0.8);
          }
          break;
        }
        case 13: {
          // Aether Crystal Block: faceted luminescent teal-cyan prism
          const dx = Math.abs(x - 7.5);
          const dy = Math.abs(y - 7.5);
          const core = Math.max(dx, dy) < 3.5;
          const frame = x === 0 || y === 0 || x === 15 || y === 15;
          const diag = Math.abs(x - y) <= 1 || Math.abs(x + y - 15) <= 1;
          if (frame) {
            setPx(buf, x, y, 22, 110, 128, 255, 0.7, 0.22, 0.5, 16, 100, 120);
          } else if (core) {
            setPx(buf, x, y, 170, 255, 248, 255, 0.95, 0.08, 0.15, 110, 255, 240);
          } else if (diag) {
            setPx(buf, x, y, 72, 238, 225, 255, 0.8, 0.15, 0.2, 48, 210, 200);
          } else {
            const s = (n - 0.5) * 20;
            setPx(buf, x, y, 36 + s, 178 + s, 192 + s, 255, 0.55, 0.18, 0.3, 18, 130, 145);
          }
          break;
        }
        case 14: {
          // Molten Magma: dark basalt crust with glowing incandescent lava fissures
          const vein = Math.sin(x * 0.65 + Math.cos(y * 0.7) * 2.0) + Math.cos(y * 0.6 - x * 0.3);
          if (vein > 0.65) {
            const heat = Math.min(1, (vein - 0.65) * 1.4);
            const r = 255;
            const g = 110 + heat * 125;
            const b = 20 + heat * 60;
            setPx(buf, x, y, r, g, b, 255, 0.25, 0.3, 0.0, r, g * 0.9, b * 0.7);
          } else {
            const s = (n - 0.5) * 18;
            setPx(buf, x, y, 48 + s, 32 + s * 0.6, 32 + s * 0.5, 255, 0.75 + n * 0.2, 0.88);
          }
          break;
        }
        case 15: {
          // Obsidian: glassy volcanic purple-black stone
          const s = (n - 0.5) * 18 + (n2 - 0.5) * 14;
          const glint = n > 0.85 ? 28 : 0;
          setPx(buf, x, y, 28 + s + glint, 20 + s + glint * 0.6, 46 + s + glint * 1.2, 255, 0.5 + n * 0.3, 0.28, 0.2);
          break;
        }
        case 16: {
          // Gilded Gold Block: brushed metallic gold with bevelled border
          const border = x === 0 || y === 0 || x === 15 || y === 15;
          const inner = x === 2 || y === 2 || x === 13 || y === 13;
          const brush = (hash2(x >> 2, y, 616) - 0.5) * 14;
          if (border) {
            setPx(buf, x, y, 205, 148, 28, 255, 0.35, 0.26, 0.94);
          } else if (inner) {
            setPx(buf, x, y, 255, 224, 96, 255, 0.82, 0.14, 0.98);
          } else {
            setPx(buf, x, y, 246 + brush, 196 + brush, 58 + brush * 0.5, 255, 0.65, 0.18, 0.96);
          }
          break;
        }
        case 17: {
          // Sea Lantern / Prismarine: clean architectural glowing core with teal frame
          const border = x <= 1 || y <= 1 || x >= 14 || y >= 14;
          if (border) {
            const s = (n - 0.5) * 18;
            setPx(buf, x, y, 56 + s, 140 + s, 134 + s, 255, 0.75, 0.42, 0.2, 10, 40, 42);
          } else {
            const dist = Math.hypot(x - 7.5, y - 7.5) / 8.0;
            const glow = Math.max(0, 1 - dist * 0.65);
            const r = 175 + glow * 75;
            const g = 238 + glow * 17;
            const b = 228 + glow * 27;
            setPx(buf, x, y, r, g, b, 255, 0.5, 0.2, 0.05, r * 0.85, g * 0.95, b * 0.95);
          }
          break;
        }
        default: {
          setPx(buf, x, y, 255, 0, 255, 255, 0.5, 0.5);
        }
      }
    }
  }

  return buf;
}

export function createBlockTextureAtlas(maxAnisotropy = 4): BlockAtlasTextures {
  const width = ATLAS_COLS * TILE_PX;
  const height = ATLAS_ROWS * TILE_PX;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const albedoCtx = albedoCanvas.getContext('2d')!;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = width;
  normalCanvas.height = height;
  const normalCtx = normalCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const roughCtx = roughCanvas.getContext('2d')!;

  const metalCanvas = document.createElement('canvas');
  metalCanvas.width = width;
  metalCanvas.height = height;
  const metalCtx = metalCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = width;
  emissiveCanvas.height = height;
  const emissiveCtx = emissiveCanvas.getContext('2d')!;

  const totalTiles = 18;
  for (let tileId = 0; tileId < totalTiles; tileId++) {
    const col = tileId % ATLAS_COLS;
    const row = Math.floor(tileId / ATLAS_COLS);
    const ox = col * TILE_PX;
    const oy = row * TILE_PX;

    const buf = buildTile(tileId);

    // Albedo
    const aImg = albedoCtx.createImageData(TILE_PX, TILE_PX);
    aImg.data.set(buf.albedo);
    albedoCtx.putImageData(aImg, ox, oy);

    // Emissive
    const eImg = emissiveCtx.createImageData(TILE_PX, TILE_PX);
    eImg.data.set(buf.emissive);
    emissiveCtx.putImageData(eImg, ox, oy);

    // Roughness, Metalness, Normal from heightfield
    const rImg = roughCtx.createImageData(TILE_PX, TILE_PX);
    const mImg = metalCtx.createImageData(TILE_PX, TILE_PX);
    const nImg = normalCtx.createImageData(TILE_PX, TILE_PX);

    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const idx = y * TILE_PX + x;
        const i4 = idx * 4;

        const rv = clampByte(buf.roughness[idx] * 255);
        rImg.data[i4] = rv;
        rImg.data[i4 + 1] = rv;
        rImg.data[i4 + 2] = rv;
        rImg.data[i4 + 3] = 255;

        const mv = clampByte(buf.metalness[idx] * 255);
        mImg.data[i4] = mv;
        mImg.data[i4 + 1] = mv;
        mImg.data[i4 + 2] = mv;
        mImg.data[i4 + 3] = 255;

        // Wrap-safe Sobel gradient for tangent-space normal map
        const xm = (x - 1 + TILE_PX) % TILE_PX;
        const xp = (x + 1) % TILE_PX;
        const ym = (y - 1 + TILE_PX) % TILE_PX;
        const yp = (y + 1) % TILE_PX;

        const hL = buf.height[y * TILE_PX + xm];
        const hR = buf.height[y * TILE_PX + xp];
        const hU = buf.height[ym * TILE_PX + x];
        const hD = buf.height[yp * TILE_PX + x];

        const strength = 2.4;
        let nx = (hL - hR) * strength;
        let ny = (hU - hD) * strength;
        let nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;

        nImg.data[i4] = clampByte((nx * 0.5 + 0.5) * 255);
        nImg.data[i4 + 1] = clampByte((ny * 0.5 + 0.5) * 255);
        nImg.data[i4 + 2] = clampByte((nz * 0.5 + 0.5) * 255);
        nImg.data[i4 + 3] = 255;
      }
    }

    roughCtx.putImageData(rImg, ox, oy);
    metalCtx.putImageData(mImg, ox, oy);
    normalCtx.putImageData(nImg, ox, oy);
  }

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.anisotropy = Math.min(maxAnisotropy, 4);
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  return {
    albedo: configureTex(albedoCanvas, true),
    normal: configureTex(normalCanvas, false),
    roughness: configureTex(roughCanvas, false),
    metalness: configureTex(metalCanvas, false),
    emissive: configureTex(emissiveCanvas, true),
    tileCanvas: albedoCanvas,
  };
}

/**
 * Generates crisp isometric 2D voxel icons for the Minecraft hotbar & block palette.
 */
export function renderBlockIconDataUrl(blockType: BlockType, tileCanvas: HTMLCanvasElement): string {
  const def = BLOCK_DEFS[blockType];
  if (!def || blockType === BlockType.Air) return '';

  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const drawTileFace = (tileId: number) => {
    const col = tileId % ATLAS_COLS;
    const row = Math.floor(tileId / ATLAS_COLS);
    return { sx: col * TILE_PX, sy: row * TILE_PX };
  };

  const [topTile, sideTile] = def.tiles;
  const topSrc = drawTileFace(topTile);
  const sideSrc = drawTileFace(sideTile);

  // Isometric projection helpers centered at (32, 32)
  const cx = 32;
  const cy = 32;
  const rx = 20;
  const ry = 10;
  const h = 22;

  // Helper to draw textured affine quad
  const drawQuad = (
    srcX: number,
    srcY: number,
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    shade: number
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p1[0] + p2[0] - p0[0], p1[1] + p2[1] - p0[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.clip();

    const m11 = (p1[0] - p0[0]) / TILE_PX;
    const m12 = (p1[1] - p0[1]) / TILE_PX;
    const m21 = (p2[0] - p0[0]) / TILE_PX;
    const m22 = (p2[1] - p0[1]) / TILE_PX;
    ctx.transform(m11, m12, m21, m22, p0[0], p0[1]);
    ctx.drawImage(tileCanvas, srcX, srcY, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);

    if (shade < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - shade})`;
      ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    }
    ctx.restore();
  };

  // Top face
  drawQuad(
    topSrc.sx,
    topSrc.sy,
    [cx, cy - h],
    [cx + rx, cy - h + ry],
    [cx - rx, cy - h + ry],
    1.0
  );

  // Left face
  drawQuad(
    sideSrc.sx,
    sideSrc.sy,
    [cx - rx, cy - h + ry],
    [cx, cy - h + ry * 2],
    [cx - rx, cy + ry],
    0.82
  );

  // Right face
  drawQuad(
    sideSrc.sx,
    sideSrc.sy,
    [cx, cy - h + ry * 2],
    [cx + rx, cy - h + ry],
    [cx, cy + ry * 2],
    0.66
  );

  // Subtle glow aura for emissive blocks
  if (def.emissive && def.emissiveColor) {
    const [er, eg, eb] = hexToRgb(def.emissiveColor);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 28);
    grad.addColorStop(0, `rgba(${er},${eg},${eb},0.28)`);
    grad.addColorStop(1, `rgba(${er},${eg},${eb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  return c.toDataURL();
}
