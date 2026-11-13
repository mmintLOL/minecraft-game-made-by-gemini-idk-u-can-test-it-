import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, BLOCK_DEFS, BlockType } from './blocks';
import { CHUNK_SIZE, VoxelWorld, WORLD_SIZE_Y } from './world';

export interface ChunkGeometrySet {
  solid: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
}

interface FaceSpec {
  dir: [number, number, number];
  normal: [number, number, number];
  /** 4 corner offsets in CCW order */
  corners: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  /** UV corners */
  uvs: [[number, number], [number, number], [number, number], [number, number]];
  tileSlot: 0 | 1 | 2; // 0 = top, 1 = side, 2 = bottom
  shade: number;
}

const FACES: FaceSpec[] = [
  // +Y Top
  {
    dir: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    tileSlot: 0,
    shade: 1.0,
  },
  // -Y Bottom
  {
    dir: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    tileSlot: 2,
    shade: 0.56,
  },
  // +X East
  {
    dir: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    tileSlot: 1,
    shade: 0.84,
  },
  // -X West
  {
    dir: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    tileSlot: 1,
    shade: 0.78,
  },
  // +Z South
  {
    dir: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    tileSlot: 1,
    shade: 0.9,
  },
  // -Z North
  {
    dir: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    tileSlot: 1,
    shade: 0.72,
  },
];

interface MeshBuilder {
  pos: number[];
  norm: number[];
  uv: number[];
  ao: number[];
  flags: number[];
  idx: number[];
}

function createBuilder(): MeshBuilder {
  return { pos: [], norm: [], uv: [], ao: [], flags: [], idx: [] };
}

function toBufferGeometry(b: MeshBuilder): THREE.BufferGeometry | null {
  if (b.idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  geo.setAttribute('aAo', new THREE.Float32BufferAttribute(b.ao, 1));
  geo.setAttribute('aFlags', new THREE.Float32BufferAttribute(b.flags, 1));
  geo.setIndex(b.idx);
  geo.computeBoundingSphere();
  return geo;
}

function isOccluding(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const b = world.getBlock(x, y, z);
  return BLOCK_DEFS[b]?.occludesFace ?? false;
}

/**
 * Computes Minecraft-style smooth corner Ambient Occlusion (0.38..1.0) for a face vertex.
 */
function vertexAO(
  world: VoxelWorld,
  bx: number,
  by: number,
  bz: number,
  normal: [number, number, number],
  corner: [number, number, number]
): number {
  const nx = normal[0];
  const ny = normal[1];
  const nz = normal[2];

  const cx = corner[0] === 1 ? 1 : -1;
  const cy = corner[1] === 1 ? 1 : -1;
  const cz = corner[2] === 1 ? 1 : -1;

  const px = bx + nx;
  const py = by + ny;
  const pz = bz + nz;

  let s1 = false;
  let s2 = false;
  let c = false;

  if (ny !== 0) {
    s1 = isOccluding(world, px + cx, py, pz);
    s2 = isOccluding(world, px, py, pz + cz);
    c = isOccluding(world, px + cx, py, pz + cz);
  } else if (nx !== 0) {
    s1 = isOccluding(world, px, py + cy, pz);
    s2 = isOccluding(world, px, py, pz + cz);
    c = isOccluding(world, px, py + cy, pz + cz);
  } else {
    s1 = isOccluding(world, px + cx, py, pz);
    s2 = isOccluding(world, px, py + cy, pz);
    c = isOccluding(world, px + cx, py + cy, pz);
  }

  const occ = s1 && s2 ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0);
  return 1.0 - occ * 0.21;
}

export function buildChunkGeometry(world: VoxelWorld, chunkX: number, chunkZ: number): ChunkGeometrySet {
  const solid = createBuilder();
  const water = createBuilder();
  const glass = createBuilder();

  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  const tileW = 1 / ATLAS_COLS;
  const tileH = 1 / ATLAS_ROWS;
  const eps = 0.0015;

  for (let y = 0; y < WORLD_SIZE_Y; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = startZ + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = startX + lx;
        const block = world.getBlock(wx, y, wz);
        if (block === BlockType.Air) continue;

        const def = BLOCK_DEFS[block];

        if (block === BlockType.Water) {
          // Render water top & side faces against Air or non-water transparent blocks
          const above = world.getBlock(wx, y + 1, wz);
          const topDrop = above === BlockType.Water ? 0.0 : 0.12;

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            const nb = world.getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
            if (nb === BlockType.Water || BLOCK_DEFS[nb].occludesFace) continue;

            const baseVert = water.pos.length / 3;
            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              const cy = corner[1] === 1 ? 1 - topDrop : 0;
              water.pos.push(wx + corner[0], y + cy, wz + corner[2]);
              water.norm.push(face.normal[0], face.normal[1], face.normal[2]);
              water.uv.push(face.uvs[c][0], face.uvs[c][1]);
              water.ao.push(1.0);
              water.flags.push(above === BlockType.Air ? 1.0 : 0.0);
            }
            water.idx.push(baseVert, baseVert + 1, baseVert + 2, baseVert, baseVert + 2, baseVert + 3);
          }
          continue;
        }

        const builder = block === BlockType.Glass ? glass : solid;

        // Encode shader flags:
        // 1.0 = wind-sway foliage
        // 2.0 = pulsating crystal/magma emissive
        // 0.0 = standard
        const blockFlag = def.windSway ? 1.0 : block === BlockType.Crystal || block === BlockType.Magma ? 2.0 : 0.0;

        for (let f = 0; f < FACES.length; f++) {
          const face = FACES[f];
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];

          const neighbor = world.getBlock(nx, ny, nz);
          if (block === BlockType.Glass) {
            if (neighbor === BlockType.Glass || BLOCK_DEFS[neighbor].occludesFace) continue;
          } else if (BLOCK_DEFS[neighbor].occludesFace) {
            continue;
          }

          const tileId = def.tiles[face.tileSlot];
          const col = tileId % ATLAS_COLS;
          const row = Math.floor(tileId / ATLAS_COLS);
          const u0 = col * tileW + eps;
          const u1 = (col + 1) * tileW - eps;
          const v0 = row * tileH + eps;
          const v1 = (row + 1) * tileH - eps;

          const baseVert = builder.pos.length / 3;
          const aos: number[] = [];

          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            builder.pos.push(wx + corner[0], y + corner[1], wz + corner[2]);
            builder.norm.push(face.normal[0], face.normal[1], face.normal[2]);
            const u = face.uvs[c][0] === 0 ? u0 : u1;
            const v = face.uvs[c][1] === 0 ? v0 : v1;
            builder.uv.push(u, v);

            const aoVal = block === BlockType.Glass ? 1.0 : vertexAO(world, wx, y, wz, face.normal, corner) * face.shade;
            aos.push(aoVal);
            builder.ao.push(aoVal);
            builder.flags.push(blockFlag);
          }

          // Flip quad diagonal to avoid AO interpolation anisotropy
          if (aos[0] + aos[2] < aos[1] + aos[3]) {
            builder.idx.push(baseVert + 1, baseVert + 2, baseVert + 3, baseVert + 1, baseVert + 3, baseVert);
          } else {
            builder.idx.push(baseVert, baseVert + 1, baseVert + 2, baseVert, baseVert + 2, baseVert + 3);
          }
        }
      }
    }
  }

  return {
    solid: toBufferGeometry(solid),
    water: toBufferGeometry(water),
    glass: toBufferGeometry(glass),
  };
}
