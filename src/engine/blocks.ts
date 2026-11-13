export enum BlockType {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  Sand = 5,
  Water = 6,
  OakLog = 7,
  OakLeaves = 8,
  OakPlanks = 9,
  Glass = 10,
  Glowstone = 11,
  DiamondOre = 12,
  Crystal = 13,
  Magma = 14,
  Obsidian = 15,
  Gold = 16,
  Prismarine = 17,
}

export type SoundCategory = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'glass' | 'crystal';

export interface BlockDefinition {
  id: BlockType;
  name: string;
  solid: boolean;
  transparent: boolean;
  liquid: boolean;
  occludesFace: boolean;
  windSway: boolean;
  emissive: boolean;
  emissiveColor?: string;
  /** Tile index in the 8x4 texture atlas for [top, side, bottom] */
  tiles: [number, number, number];
  sound: SoundCategory;
  /** Base UI color for debris particles */
  particleColor: string;
  /** Light emission strength when held or placed */
  glowRadius?: number;
}

/**
 * Atlas layout (8 columns x 4 rows = 32 tiles, each 16x16px):
 * 0: Grass Top
 * 1: Grass Side
 * 2: Dirt
 * 3: Stone
 * 4: Cobblestone
 * 5: Sand
 * 6: Oak Log Top
 * 7: Oak Log Side
 * 8: Oak Leaves
 * 9: Oak Planks
 * 10: Glass
 * 11: Glowstone
 * 12: Diamond Ore
 * 13: Crystal Block
 * 14: Magma
 * 15: Obsidian
 * 16: Gold Block
 * 17: Prismarine Lantern
 */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

export const BLOCK_DEFS: Record<BlockType, BlockDefinition> = {
  [BlockType.Air]: {
    id: BlockType.Air,
    name: 'Air',
    solid: false,
    transparent: true,
    liquid: false,
    occludesFace: false,
    windSway: false,
    emissive: false,
    tiles: [0, 0, 0],
    sound: 'stone',
    particleColor: '#000000',
  },
  [BlockType.Grass]: {
    id: BlockType.Grass,
    name: 'Grass Block',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [0, 1, 2],
    sound: 'grass',
    particleColor: '#5da135',
  },
  [BlockType.Dirt]: {
    id: BlockType.Dirt,
    name: 'Dirt',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [2, 2, 2],
    sound: 'dirt',
    particleColor: '#865b3c',
  },
  [BlockType.Stone]: {
    id: BlockType.Stone,
    name: 'Stone',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [3, 3, 3],
    sound: 'stone',
    particleColor: '#7d8287',
  },
  [BlockType.Cobblestone]: {
    id: BlockType.Cobblestone,
    name: 'Cobblestone',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [4, 4, 4],
    sound: 'stone',
    particleColor: '#696e73',
  },
  [BlockType.Sand]: {
    id: BlockType.Sand,
    name: 'Sand',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [5, 5, 5],
    sound: 'sand',
    particleColor: '#dbc98e',
  },
  [BlockType.Water]: {
    id: BlockType.Water,
    name: 'Water',
    solid: false,
    transparent: true,
    liquid: true,
    occludesFace: false,
    windSway: false,
    emissive: false,
    tiles: [0, 0, 0],
    sound: 'sand',
    particleColor: '#2596be',
  },
  [BlockType.OakLog]: {
    id: BlockType.OakLog,
    name: 'Oak Log',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [6, 7, 6],
    sound: 'wood',
    particleColor: '#6e5033',
  },
  [BlockType.OakLeaves]: {
    id: BlockType.OakLeaves,
    name: 'Oak Leaves',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: true,
    emissive: false,
    tiles: [8, 8, 8],
    sound: 'grass',
    particleColor: '#3f7e2b',
  },
  [BlockType.OakPlanks]: {
    id: BlockType.OakPlanks,
    name: 'Oak Planks',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [9, 9, 9],
    sound: 'wood',
    particleColor: '#a87d4c',
  },
  [BlockType.Glass]: {
    id: BlockType.Glass,
    name: 'Optical Glass',
    solid: true,
    transparent: true,
    liquid: false,
    occludesFace: false,
    windSway: false,
    emissive: false,
    tiles: [10, 10, 10],
    sound: 'glass',
    particleColor: '#b7e7f7',
  },
  [BlockType.Glowstone]: {
    id: BlockType.Glowstone,
    name: 'Glowstone',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: true,
    emissiveColor: '#ffbe55',
    tiles: [11, 11, 11],
    sound: 'glass',
    particleColor: '#ffcc66',
    glowRadius: 14,
  },
  [BlockType.DiamondOre]: {
    id: BlockType.DiamondOre,
    name: 'Diamond Ore',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: true,
    emissiveColor: '#3be8ff',
    tiles: [12, 12, 12],
    sound: 'stone',
    particleColor: '#4be8ff',
    glowRadius: 8,
  },
  [BlockType.Crystal]: {
    id: BlockType.Crystal,
    name: 'Aether Crystal',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: true,
    emissiveColor: '#38f8e2',
    tiles: [13, 13, 13],
    sound: 'crystal',
    particleColor: '#4af7e0',
    glowRadius: 16,
  },
  [BlockType.Magma]: {
    id: BlockType.Magma,
    name: 'Molten Magma',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: true,
    emissiveColor: '#ff5d1a',
    tiles: [14, 14, 14],
    sound: 'stone',
    particleColor: '#ff6622',
    glowRadius: 13,
  },
  [BlockType.Obsidian]: {
    id: BlockType.Obsidian,
    name: 'Obsidian',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [15, 15, 15],
    sound: 'stone',
    particleColor: '#251a36',
  },
  [BlockType.Gold]: {
    id: BlockType.Gold,
    name: 'Gilded Gold',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: false,
    tiles: [16, 16, 16],
    sound: 'stone',
    particleColor: '#f5c23d',
  },
  [BlockType.Prismarine]: {
    id: BlockType.Prismarine,
    name: 'Sea Lantern',
    solid: true,
    transparent: false,
    liquid: false,
    occludesFace: true,
    windSway: false,
    emissive: true,
    emissiveColor: '#7cf7e4',
    tiles: [17, 17, 17],
    sound: 'glass',
    particleColor: '#88f5e5',
    glowRadius: 15,
  },
};

export const PLACEABLE_BLOCKS: BlockType[] = [
  BlockType.Grass,
  BlockType.Dirt,
  BlockType.Stone,
  BlockType.Cobblestone,
  BlockType.OakPlanks,
  BlockType.OakLog,
  BlockType.OakLeaves,
  BlockType.Sand,
  BlockType.Glass,
  BlockType.Glowstone,
  BlockType.Crystal,
  BlockType.Magma,
  BlockType.DiamondOre,
  BlockType.Obsidian,
  BlockType.Gold,
  BlockType.Prismarine,
];

export const DEFAULT_HOTBAR: BlockType[] = [
  BlockType.Grass,
  BlockType.Stone,
  BlockType.OakPlanks,
  BlockType.OakLog,
  BlockType.Glass,
  BlockType.Glowstone,
  BlockType.Crystal,
  BlockType.Magma,
  BlockType.Gold,
];
