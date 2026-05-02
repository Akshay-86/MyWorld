export const WORLD_SIZE = 600;
export const NUM_HOUSES = 50;
export const NUM_TREES = 1500;

export const PONDS = [
  { x: 0, z: 0, radius: 30, depth: 9 },
  { x: 150, z: 100, radius: 20, depth: 7 },
  { x: -130, z: -90, radius: 25, depth: 8 },
  { x: 90, z: -160, radius: 18, depth: 6 },
  { x: -180, z: 130, radius: 22, depth: 7 },
  { x: 145, z: -20, radius: 35, depth: 10 },
];

export const ASSET_NAMES = {
  tree1: 'BirchTree_1.gltf',
  tree2: 'MapleTree_1.gltf',
  tree3: 'BirchTree_4.gltf',
  tree4: 'MapleTree_4.gltf',
  bush: 'Bush_Large.gltf',
  bush2: 'Bush_Small_Flowers.gltf',
  flowerR: 'Flower_1_Clump.gltf',
  flowerY: 'Flower_2_Clump.gltf',
  flowerP: 'Flower_4_Clump.gltf',
  grass: 'Grass_Large.gltf',
  deadTree: 'DeadTree_1.gltf',
};

export const FLORA_CONFIG = [
  { key: 'bush', count: 500, scaleMin: 1.5, scaleMax: 3.0 },
  { key: 'bush2', count: 400, scaleMin: 1.5, scaleMax: 3.0 },
  { key: 'grass', count: 4000, scaleMin: 1.0, scaleMax: 2.5 },
  { key: 'flowerR', count: 250, scaleMin: 1.0, scaleMax: 2.0 },
  { key: 'flowerY', count: 250, scaleMin: 1.0, scaleMax: 2.0 },
  { key: 'flowerP', count: 250, scaleMin: 1.0, scaleMax: 2.0 },
];

export const SKY_COLOR_DAY = 0x87CEEB;
export const SKY_COLOR_SUNSET = 0xFF7043;
export const SKY_COLOR_NIGHT = 0x0a1128;
export const FOG_COLOR_DAY = 0x87CEEB;
