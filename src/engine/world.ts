import { BLOCK_DEFS, BlockType } from './blocks';
import { SeededNoise } from './noise';

export const CHUNK_SIZE = 16;
export const WORLD_CHUNKS_X = 8;
export const WORLD_CHUNKS_Z = 8;
export const WORLD_SIZE_X = CHUNK_SIZE * WORLD_CHUNKS_X; // 128
export const WORLD_SIZE_Y = 64;
export const WORLD_SIZE_Z = CHUNK_SIZE * WORLD_CHUNKS_Z; // 128
export const WATER_LEVEL = 18;

export interface RaycastHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  blockType: BlockType;
  distance: number;
}

export class VoxelWorld {
  public data: Uint8Array;
  public dirtyChunks: Set<string> = new Set();
  private noise: SeededNoise;

  constructor(seed = 202611) {
    this.data = new Uint8Array(WORLD_SIZE_X * WORLD_SIZE_Y * WORLD_SIZE_Z);
    this.noise = new SeededNoise(seed);
    this.generate(seed);
  }

  public regenerate(seed = Math.floor(Math.random() * 999999)) {
    this.noise = new SeededNoise(seed);
    this.data.fill(BlockType.Air);
    this.generate(seed);
    for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
        this.dirtyChunks.add(`${cx},${cz}`);
      }
    }
  }

  public inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_SIZE_X && y >= 0 && y < WORLD_SIZE_Y && z >= 0 && z < WORLD_SIZE_Z;
  }

  private idx(x: number, y: number, z: number): number {
    return (y * WORLD_SIZE_Z + z) * WORLD_SIZE_X + x;
  }

  public getBlock(x: number, y: number, z: number): BlockType {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    if (!this.inBounds(ix, iy, iz)) {
      return BlockType.Air;
    }
    return this.data[this.idx(ix, iy, iz)] as BlockType;
  }

  public setBlock(x: number, y: number, z: number, type: BlockType, markDirty = true): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    if (!this.inBounds(ix, iy, iz)) return false;
    if (iy === 0 && type === BlockType.Air) return false; // Bedrock floor

    this.data[this.idx(ix, iy, iz)] = type;

    if (markDirty) {
      const cx = Math.floor(ix / CHUNK_SIZE);
      const cz = Math.floor(iz / CHUNK_SIZE);
      this.dirtyChunks.add(`${cx},${cz}`);

      const lx = ix % CHUNK_SIZE;
      const lz = iz % CHUNK_SIZE;
      if (lx === 0 && cx > 0) this.dirtyChunks.add(`${cx - 1},${cz}`);
      if (lx === CHUNK_SIZE - 1 && cx < WORLD_CHUNKS_X - 1) this.dirtyChunks.add(`${cx + 1},${cz}`);
      if (lz === 0 && cz > 0) this.dirtyChunks.add(`${cx},${cz - 1}`);
      if (lz === CHUNK_SIZE - 1 && cz < WORLD_CHUNKS_Z - 1) this.dirtyChunks.add(`${cx},${cz + 1}`);
    }
    return true;
  }

  public isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return BLOCK_DEFS[b]?.solid ?? false;
  }

  public getSurfaceY(x: number, z: number): number {
    const ix = Math.max(0, Math.min(WORLD_SIZE_X - 1, Math.floor(x)));
    const iz = Math.max(0, Math.min(WORLD_SIZE_Z - 1, Math.floor(z)));
    for (let y = WORLD_SIZE_Y - 1; y >= 0; y--) {
      const b = this.getBlock(ix, y, iz);
      if (b !== BlockType.Air && b !== BlockType.Water) {
        return y;
      }
    }
    return WATER_LEVEL;
  }

  private generate(seed: number) {
    const n = this.noise;

    // 1. Base procedural terrain + lagoon basin around (64, 48) + mountain ridge north/west
    for (let z = 0; z < WORLD_SIZE_Z; z++) {
      for (let x = 0; x < WORLD_SIZE_X; x++) {
        const nx = x / 48;
        const nz = z / 48;

        const base = n.fbm2(nx, nz, 4, 2.0, 0.5);
        const detail = n.fbm2(nx * 2.3 + 11.4, nz * 2.3 - 7.1, 3, 2.0, 0.48);
        const ridge = n.ridged2(nx * 0.75 + 4.2, nz * 0.75 + 2.8, 4);

        // Distance from center lagoon (64, 48) and spawn plateau (64, 72)
        const distLagoon = Math.hypot((x - 64) * 0.9, (z - 46) * 1.15);
        const distPlateau = Math.hypot(x - 64, z - 70);
        const edgeDist = Math.max(Math.abs(x - 64), Math.abs(z - 64)) / 64;

        let height = 21 + base * 12 + detail * 4;

        // Dramatic peripheral mountain peaks for horizon framing
        if (edgeDist > 0.55) {
          const mWeight = Math.min(1, (edgeDist - 0.55) / 0.42);
          height += ridge * 24 * mWeight * mWeight;
        }

        // Carve scenic turquoise lagoon
        if (distLagoon < 18) {
          const t = Math.cos((distLagoon / 18) * (Math.PI * 0.5));
          height = height * (1 - t) + (WATER_LEVEL - 5.5) * t;
        }

        // Gentle scenic terrace for the shrine & spawn overlook
        if (distPlateau < 14) {
          const t = Math.cos((distPlateau / 14) * (Math.PI * 0.5));
          height = height * (1 - t * 0.85) + 23.2 * (t * 0.85);
        }

        // Dramatic cliffside waterfall ridge behind the lagoon at z ~ 22..28
        const distCliff = Math.hypot((x - 64) * 0.65, z - 24);
        if (distCliff < 15) {
          const t = Math.cos((distCliff / 15) * (Math.PI * 0.5));
          height = Math.max(height, 22 + t * 18);
        }

        const topY = Math.max(4, Math.min(WORLD_SIZE_Y - 6, Math.round(height)));

        for (let y = 0; y <= Math.max(topY, WATER_LEVEL); y++) {
          if (y === 0) {
            this.setBlock(x, y, z, BlockType.Obsidian, false);
            continue;
          }

          if (y <= topY) {
            // Cave pockets & glowing crystal caverns below surface
            const cave = n.noise3(x * 0.085, y * 0.11, z * 0.085);
            if (y < topY - 3 && y > 3 && cave > 0.34) {
              this.setBlock(x, y, z, BlockType.Air, false);
              continue;
            }

            if (y === topY) {
              if (topY <= WATER_LEVEL + 1) {
                this.setBlock(x, y, z, BlockType.Sand, false);
              } else if (topY > 34) {
                this.setBlock(x, y, z, y > 40 ? BlockType.Cobblestone : BlockType.Stone, false);
              } else {
                this.setBlock(x, y, z, BlockType.Grass, false);
              }
            } else if (y >= topY - 3) {
              if (topY <= WATER_LEVEL + 1) {
                this.setBlock(x, y, z, BlockType.Sand, false);
              } else if (topY > 34) {
                this.setBlock(x, y, z, BlockType.Stone, false);
              } else {
                this.setBlock(x, y, z, BlockType.Dirt, false);
              }
            } else {
              // Deep stone + glowing ores & magma pockets
              const oreNoise = n.noise3(x * 0.24 + 5, y * 0.24, z * 0.24 - 3);
              if (y < 9 && oreNoise > 0.28) {
                this.setBlock(x, y, z, BlockType.Magma, false);
              } else if (oreNoise > 0.31) {
                this.setBlock(x, y, z, BlockType.DiamondOre, false);
              } else {
                this.setBlock(x, y, z, BlockType.Stone, false);
              }
            }
          } else if (y <= WATER_LEVEL) {
            this.setBlock(x, y, z, BlockType.Water, false);
          }
        }
      }
    }

    // 2. Build the Hero Landmark: Ancient Prism Shrine, Bridge, Underwater Sea Lanterns & Crystal Arch
    this.buildPrismShrine();

    // 3. Scatter Oak Trees & Crystal Outcrops across meadows
    let s = (seed ^ 0x9e3779b9) >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    for (let i = 0; i < 150; i++) {
      const tx = 8 + Math.floor(rand() * (WORLD_SIZE_X - 16));
      const tz = 8 + Math.floor(rand() * (WORLD_SIZE_Z - 16));
      // Keep clear of central shrine & spawn vista
      if (Math.hypot(tx - 64, tz - 58) < 22) continue;

      const ty = this.getSurfaceY(tx, tz);
      if (ty <= WATER_LEVEL + 1 || ty > 33) continue;
      if (this.getBlock(tx, ty, tz) !== BlockType.Grass) continue;

      this.placeOakTree(tx, ty + 1, tz, 4 + Math.floor(rand() * 2));
    }

    // Scenic glowing crystal clusters along cliff edges & shores
    for (let i = 0; i < 24; i++) {
      const cx = 12 + Math.floor(rand() * (WORLD_SIZE_X - 24));
      const cz = 12 + Math.floor(rand() * (WORLD_SIZE_Z - 24));
      if (Math.hypot(cx - 64, cz - 64) < 12) continue;
      const cy = this.getSurfaceY(cx, cz);
      if (cy >= WATER_LEVEL && cy <= 36) {
        const h = 2 + Math.floor(rand() * 3);
        for (let k = 1; k <= h; k++) {
          this.setBlock(cx, cy + k, cz, k === h ? BlockType.Crystal : BlockType.Obsidian, false);
        }
      }
    }
  }

  private placeOakTree(x: number, y: number, z: number, trunkHeight: number) {
    for (let dy = 0; dy < trunkHeight; dy++) {
      this.setBlock(x, y + dy, z, BlockType.OakLog, false);
    }
    const top = y + trunkHeight;
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy === 1 ? 1 : dy === 0 ? 2 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && (dy === 0 || dy === -2)) continue;
          if (dx === 0 && dz === 0 && dy < 0) continue;
          if (this.getBlock(x + dx, top + dy, z + dz) === BlockType.Air) {
            this.setBlock(x + dx, top + dy, z + dz, BlockType.OakLeaves, false);
          }
        }
      }
    }
  }

  private buildPrismShrine() {
    // 1. Floating/Island Shrine Platform in the lagoon at (64, WATER_LEVEL + 1, 46)
    const sx = 64;
    const sz = 46;
    const baseY = WATER_LEVEL + 1;

    // Underwater Sea Lanterns illuminating the lagoon floor for dramatic caustic glow
    const lanternOffsets = [
      [-6, -4],
      [6, -4],
      [-6, 4],
      [6, 4],
      [0, -8],
      [0, 8],
    ];
    for (const [ox, oz] of lanternOffsets) {
      const lx = sx + ox;
      const lz = sz + oz;
      for (let y = WATER_LEVEL - 4; y <= WATER_LEVEL - 1; y++) {
        if (this.getBlock(lx, y, lz) !== BlockType.Water) {
          this.setBlock(lx, y, lz, BlockType.Prismarine, false);
          break;
        }
      }
    }

    // Stone & Obsidian shrine island platform (9x9)
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4;
        for (let y = WATER_LEVEL - 5; y <= baseY; y++) {
          if (y === baseY) {
            const isGoldTrim = Math.abs(dx) === 3 && Math.abs(dz) === 3;
            const isCenter = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
            const block = edge
              ? BlockType.Cobblestone
              : isGoldTrim
                ? BlockType.Gold
                : isCenter
                  ? BlockType.Prismarine
                  : BlockType.Obsidian;
            this.setBlock(sx + dx, y, sz + dz, block, false);
          } else {
            this.setBlock(sx + dx, y, sz + dz, BlockType.Cobblestone, false);
          }
        }
        // Clear space above platform
        for (let y = baseY + 1; y <= baseY + 12; y++) {
          this.setBlock(sx + dx, y, sz + dz, BlockType.Air, false);
        }
      }
    }

    // 4 Corner Pillars with Glowstone capitals + Obsidian shafts
    const corners = [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ];
    for (const [cx, cz] of corners) {
      for (let h = 1; h <= 5; h++) {
        const block = h === 5 ? BlockType.Glowstone : h === 4 ? BlockType.Gold : BlockType.Obsidian;
        this.setBlock(sx + cx, baseY + h, sz + cz, block, false);
      }
    }

    // Stepped Temple Canopy & Suspended Aether Crystal Core
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const outer = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        const inner = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
        if (outer) {
          this.setBlock(sx + dx, baseY + 6, sz + dz, BlockType.Cobblestone, false);
        } else if (!inner) {
          this.setBlock(sx + dx, baseY + 7, sz + dz, BlockType.Glass, false);
        }
      }
    }
    // Roof crown
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.setBlock(
          sx + dx,
          baseY + 8,
          sz + dz,
          dx === 0 && dz === 0 ? BlockType.Crystal : BlockType.Gold,
          false
        );
      }
    }
    // Levitating Crystal Beacon in the center of the shrine
    this.setBlock(sx, baseY + 3, sz, BlockType.Crystal, false);
    this.setBlock(sx, baseY + 4, sz, BlockType.Crystal, false);
    this.setBlock(sx, baseY + 9, sz, BlockType.Crystal, false);

    // 2. Oak Plank Bridge connecting South Shore (spawn side z=59) to Shrine (z=50)
    for (let z = 51; z <= 61; z++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.setBlock(sx + dx, baseY, z, BlockType.OakPlanks, false);
        // Clear headroom
        for (let y = baseY + 1; y <= baseY + 4; y++) {
          this.setBlock(sx + dx, y, z, BlockType.Air, false);
        }
      }
      // Bridge lantern posts
      if (z === 54 || z === 59) {
        this.setBlock(sx - 2, baseY + 1, z, BlockType.OakLog, false);
        this.setBlock(sx - 2, baseY + 2, z, BlockType.Glowstone, false);
        this.setBlock(sx + 2, baseY + 1, z, BlockType.OakLog, false);
        this.setBlock(sx + 2, baseY + 2, z, BlockType.Glowstone, false);
      }
    }

    // 3. Cascading Waterfall down the northern cliff (x=64, z=28..34)
    const wfTop = this.getSurfaceY(64, 25);
    for (let y = WATER_LEVEL + 1; y <= Math.max(WATER_LEVEL + 6, wfTop); y++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.setBlock(64 + dx, y, 29, BlockType.Water, false);
        if (y <= WATER_LEVEL + 3) {
          this.setBlock(64 + dx, y, 30, BlockType.Water, false);
        }
      }
    }
    // Flanking magma fissure veins on cliff sides for warm/cool contrast
    this.setBlock(58, WATER_LEVEL + 3, 28, BlockType.Magma, false);
    this.setBlock(58, WATER_LEVEL + 4, 28, BlockType.Magma, false);
    this.setBlock(70, WATER_LEVEL + 4, 28, BlockType.Magma, false);
    this.setBlock(70, WATER_LEVEL + 5, 28, BlockType.Magma, false);
  }

  /**
   * Amanatides & Woo fast 3D DDA voxel traversal.
   */
  public raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist = 8
  ): RaycastHit | null {
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    dx /= len;
    dy /= len;
    dz /= len;

    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);

    const stepX = dx >= 0 ? 1 : -1;
    const stepY = dy >= 0 ? 1 : -1;
    const stepZ = dz >= 0 ? 1 : -1;

    const tDeltaX = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const tDeltaY = dy === 0 ? 1e30 : Math.abs(1 / dy);
    const tDeltaZ = dz === 0 ? 1e30 : Math.abs(1 / dz);

    let tMaxX = dx === 0 ? 1e30 : ((dx > 0 ? x + 1 - ox : ox - x) * tDeltaX);
    let tMaxY = dy === 0 ? 1e30 : ((dy > 0 ? y + 1 - oy : oy - y) * tDeltaY);
    let tMaxZ = dz === 0 ? 1e30 : ((dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ);

    let dist = 0;
    let nx = 0;
    let ny = 0;
    let nz = 0;

    for (let i = 0; i < 64; i++) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          dist = tMaxX;
          tMaxX += tDeltaX;
          nx = -stepX;
          ny = 0;
          nz = 0;
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          dist = tMaxY;
          tMaxY += tDeltaY;
          nx = 0;
          ny = -stepY;
          nz = 0;
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      }

      if (dist > maxDist) break;
      if (!this.inBounds(x, y, z)) continue;

      const block = this.getBlock(x, y, z);
      if (block !== BlockType.Air && block !== BlockType.Water) {
        return { x, y, z, nx, ny, nz, blockType: block, distance: dist };
      }
    }

    return null;
  }
}
