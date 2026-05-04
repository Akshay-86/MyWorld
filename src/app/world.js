import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ASSET_NAMES, FLORA_CONFIG, NUM_HOUSES, NUM_TREES, WORLD_SIZE } from './config.js';
import { getTerrainHeight, getYOnTerrain, isInsideAnyPond, isOnCliff } from './terrain.js';

function createInstancedFromGeometry(env, geometry, material, transforms, castShadow = true, offset = new THREE.Vector3()) {
  const count = transforms.length;
  if (count === 0) return null;
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
  instancedMesh.castShadow = castShadow;
  instancedMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const t = transforms[i];
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(0, t.rotY || 0, 0);
    dummy.scale.set(t.scale || 1, t.scale || 1, t.scale || 1);
    dummy.translateX(offset.x);
    dummy.translateY(offset.y);
    dummy.translateZ(offset.z);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  env.scene.add(instancedMesh);
  return instancedMesh;
}

function checkCollision(env, x, z, radius) {
  for (const object of env.placedObjects) {
    const dx = object.x - x;
    const dz = object.z - z;
    if (dx * dx + dz * dz < (object.radius + radius) ** 2) return true;
  }
  return false;
}

function createInstancedFromModel(env, modelScene, transforms, castShadow = true) {
  const sourceMeshes = [];
  modelScene.traverse((child) => {
    if (child.isMesh) sourceMeshes.push(child);
  });
  if (sourceMeshes.length === 0) return [];

  const count = transforms.length;
  const dummy = new THREE.Object3D();
  const instancedMeshes = [];

  for (const sourceMesh of sourceMeshes) {
    const instancedMesh = new THREE.InstancedMesh(sourceMesh.geometry, sourceMesh.material, count);
    instancedMesh.castShadow = castShadow;
    instancedMesh.receiveShadow = true;

    // Calculate a bounding sphere or box for the instanced mesh so Frustum Culling works optimally!
    instancedMesh.frustumCulled = true;

    for (let i = 0; i < count; i++) {
      const transform = transforms[i];
      dummy.position.set(transform.x, transform.y, transform.z);
      dummy.scale.set(transform.scale, transform.scale, transform.scale);
      dummy.rotation.set(0, transform.rotY, 0);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.computeBoundingSphere(); // Highly important for chunk culling
    env.scene.add(instancedMesh);
    instancedMeshes.push(instancedMesh);
  }

  return instancedMeshes;
}

function chunkAndInstantiate(env, modelScene, transforms, castShadow = true) {
  const CHUNK_SIZE = 300;
  const chunks = {};
  
  for (const t of transforms) {
    const cx = Math.floor(t.x / CHUNK_SIZE);
    const cz = Math.floor(t.z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    if (!chunks[key]) chunks[key] = [];
    chunks[key].push(t);
  }
  
  for (const key in chunks) {
    createInstancedFromModel(env, modelScene, chunks[key], castShadow);
  }
}


function createPathBetween(env, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const segments = Math.max(4, Math.floor(dist / 3));
  const roadWidth = 1.8;
  const centerPoints = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const noiseX = Math.sin(t * Math.PI) * (Math.random() - 0.5) * 3;
    const noiseZ = Math.sin(t * Math.PI) * (Math.random() - 0.5) * 3;
    centerPoints.push({ x: p1.x + dx * t + noiseX, z: p1.z + dz * t + noiseZ });
  }

  const vertices = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const cp = centerPoints[i];
    let ddx;
    let ddz;
    if (i < segments) {
      ddx = centerPoints[i + 1].x - cp.x;
      ddz = centerPoints[i + 1].z - cp.z;
    } else {
      ddx = cp.x - centerPoints[i - 1].x;
      ddz = cp.z - centerPoints[i - 1].z;
    }

    const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
    const perpX = (-ddz / len) * roadWidth;
    const perpZ = (ddx / len) * roadWidth;
    const lx = cp.x + perpX;
    const lz = cp.z + perpZ;
    const rx = cp.x - perpX;
    const rz = cp.z - perpZ;
    vertices.push(lx, getYOnTerrain(lx, lz) + 0.12, lz);
    vertices.push(rx, getYOnTerrain(rx, rz) + 0.12, rz);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  env.roadGeometries.push(geo);

  centerPoints.forEach((point) => {
    env.placedObjects.push({ x: point.x, z: point.z, radius: roadWidth + 1 });
  });

  for (let i = 0; i < dist / 6; i++) {
    const cp = centerPoints[Math.floor(Math.random() * centerPoints.length)];
    const side = Math.random() > 0.5 ? 1 : -1;
    const rockX = cp.x + side * (roadWidth + 0.5 + Math.random() * 2);
    const rockZ = cp.z + side * (roadWidth + 0.5 + Math.random() * 2);
    env.roadRockTransforms.push({ x: rockX, y: getYOnTerrain(rockX, rockZ) - 0.2, z: rockZ, scale: 0.5 + Math.random(), rotY: Math.random() * Math.PI * 2 });
  }
}

function generateScatterTransforms(env, count, scaleMin, scaleMax, pondMargin = 5) {
  const transforms = [];
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE;
    const z = (Math.random() - 0.5) * WORLD_SIZE;
    if (!isInsideAnyPond(x, z, pondMargin)) {
      transforms.push({ x, y: getTerrainHeight(x, z) - 0.1, z, scale: scaleMin + Math.random() * (scaleMax - scaleMin), rotY: Math.random() * Math.PI * 2 });
    }
  }
  return transforms;
}

function generateTreeTransforms(env) {
  const transforms = { tree1: [], tree2: [], tree3: [], tree4: [], deadTree: [] };
  const keys = ['tree1', 'tree1', 'tree1', 'tree2', 'tree2', 'tree2', 'tree3', 'tree3', 'tree3', 'tree4', 'tree4', 'tree4', 'deadTree'];

  for (let i = 0; i < NUM_TREES; i++) {
    let x;
    let z;
    let attempts = 0;
    do {
      x = (Math.random() - 0.5) * WORLD_SIZE;
      z = (Math.random() - 0.5) * WORLD_SIZE;
      attempts++;
    } while (attempts < 30 && (isInsideAnyPond(x, z, 5) || isOnCliff(x, z) || checkCollision(env, x, z, 2)));

    if (attempts < 30) {
      env.placedObjects.push({ x, z, radius: 2 });
      const key = keys[Math.floor(Math.random() * keys.length)];
      transforms[key].push({ x, y: getTerrainHeight(x, z) - 0.1, z, scale: 2 + Math.random() * 3, rotY: Math.random() * Math.PI * 2 });
    }
  }

  return transforms;
}

async function loadModels(env) {
  const loader = new GLTFLoader();
  const basePath = '/models/Ultimate Stylized Nature - May 2022/glTF/';
  const totalSteps = Object.keys(ASSET_NAMES).length + 2;
  const progressBar = document.getElementById('load-progress');
  let loaded = 0;

  const updateProgress = () => {
    loaded++;
    if (progressBar) progressBar.style.width = `${Math.round((loaded / totalSteps) * 100)}%`;
  };

  const foliageKeys = new Set(['tree1', 'tree2', 'tree3', 'tree4', 'deadTree', 'bush', 'bush2', 'grass', 'flowerR', 'flowerY', 'flowerP']);
  const tuneMaterial = (material, isFoliage) => {
    if (!material) return;

    if (material.map) {
      material.alphaTest = 0.5;
      material.transparent = false;
      material.depthWrite = true;
      material.side = THREE.DoubleSide;
    }

    if (isFoliage) {
      // Keep vegetation matte so sunlight does not create harsh white sheen.
      material.metalness = 0;
      material.roughness = Math.max(material.roughness ?? 0, 0.95);
      material.envMapIntensity = 0.15;
    }

    material.needsUpdate = true;
  };

  try {
    const promises = Object.entries(ASSET_NAMES).map(async ([key, filename]) => {
      const gltf = await loader.loadAsync(basePath + filename);
      const isFoliage = foliageKeys.has(key);
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => tuneMaterial(material, isFoliage));
          } else {
            tuneMaterial(child.material, isFoliage);
          }
        }
      });
      env.loadedModels[key] = gltf.scene;
      updateProgress();
    });
    await Promise.all(promises);

    const fenceGltf = await loader.loadAsync('/models/kenney_nature-kit/Models/GLTF format/fence_simple.glb');
    fenceGltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material.map && child.material.transparent) child.material.alphaTest = 0.5;
      }
    });
    env.loadedModels.fence = fenceGltf.scene;
    updateProgress();

    const rockGltf = await loader.loadAsync('/models/kenney_nature-kit/Models/GLTF format/rock_smallA.glb');
    rockGltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material.map && child.material.transparent) child.material.alphaTest = 0.5;
      }
    });
    env.loadedModels.smallRock = rockGltf.scene;
    updateProgress();
  } catch (error) {
    console.error('Model loading failed, using fallbacks', error);
  }
}

function spawnWorld(env) {
  const houseTransforms = [];
  env.humanData = [];
  env.roadGeometries = [];

  for (let i = 0; i < NUM_HOUSES; i++) {
    let x;
    let z;
    let attempts = 0;
    do {
      x = (Math.random() - 0.5) * (WORLD_SIZE - 40);
      z = (Math.random() - 0.5) * (WORLD_SIZE - 40);
      attempts++;
    } while (attempts < 80 && (isInsideAnyPond(x, z, 10) || isOnCliff(x, z) || checkCollision(env, x, z, 8)));

    if (attempts < 80) {
      env.placedObjects.push({ x, z, radius: 8 });
      const y = getTerrainHeight(x, z) - 0.1;
      const rotY = Math.random() * Math.PI * 2;
      
      houseTransforms.push({ x, y, z, rotY, scale: 1 });
      env.housePositions.push({ x, y, z });

      const spacing = 5;
      const offsets = [[spacing, 0], [-spacing, 0], [0, spacing], [0, -spacing]];
      offsets.forEach((offset, index) => {
        const fx = x + offset[0];
        const fz = z + offset[1];
        env.fenceTransforms.push({ x: fx, y: getTerrainHeight(fx, fz), z: fz, scale: 2, rotY: index < 2 ? Math.PI / 2 : 0 });
      });

      for (let j = 0; j < 3; j++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 4 + Math.random() * 2;
        const humanX = x + Math.cos(angle) * distance;
        const humanZ = z + Math.sin(angle) * distance;
        env.humanData.push({ x: humanX, y: getTerrainHeight(humanX, humanZ), z: humanZ, rotY: angle, scale: 1 });
      }
    }
  }

  for (let i = 0; i < env.housePositions.length; i++) {
    let nearestDist = Infinity;
    let nearestIdx = -1;
    for (let j = 0; j < env.housePositions.length; j++) {
      if (i === j) continue;
      const dx = env.housePositions[i].x - env.housePositions[j].x;
      const dz = env.housePositions[i].z - env.housePositions[j].z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < nearestDist) {
        nearestDist = distance;
        nearestIdx = j;
      }
    }
    if (nearestIdx !== -1 && nearestDist < 120) {
      createPathBetween(env, env.housePositions[i], env.housePositions[nearestIdx]);
    }
  }

  createPathBetween(env, { x: 20, z: 60 }, { x: 220, z: 60 });

  // Instantiate Houses
  const houseBaseGeo = new THREE.BoxGeometry(5, 4, 5);
  const houseBaseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  createInstancedFromGeometry(env, houseBaseGeo, houseBaseMat, houseTransforms, true, new THREE.Vector3(0, 2, 0));

  const houseRoofGeo = new THREE.ConeGeometry(4.5, 4, 4);
  houseRoofGeo.rotateY(Math.PI / 4);
  const houseRoofMat = new THREE.MeshStandardMaterial({ color: 0xE53935, roughness: 0.7 });
  createInstancedFromGeometry(env, houseRoofGeo, houseRoofMat, houseTransforms, true, new THREE.Vector3(0, 6, 0));

  // Instantiate Humans
  const humanGeo = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
  const humanMat = new THREE.MeshStandardMaterial({ color: 0x1976D2, roughness: 0.5 });
  env.instancedHumans = createInstancedFromGeometry(env, humanGeo, humanMat, env.humanData, true, new THREE.Vector3(0, 0.7, 0));

  // Merge and create Roads
  if (env.roadGeometries.length > 0) {
    const mergedGeo = BufferGeometryUtils.mergeGeometries(env.roadGeometries, false);
    const road = new THREE.Mesh(mergedGeo, new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 1.0, side: THREE.DoubleSide }));
    road.receiveShadow = true;
    env.scene.add(road);
  }
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    setTimeout(() => { loadingScreen.style.display = 'none'; }, 1200);
  }
}

export async function loadAndPopulateWorld(env) {
  await loadModels(env);
  spawnWorld(env);

  const treeTransforms = generateTreeTransforms(env);
  for (const key of Object.keys(treeTransforms)) {
    if (env.loadedModels[key] && treeTransforms[key].length > 0) {
      chunkAndInstantiate(env, env.loadedModels[key], treeTransforms[key], true);
    }
  }

  for (const config of FLORA_CONFIG) {
    if (!env.loadedModels[config.key]) continue;
    const transforms = generateScatterTransforms(env, config.count, config.scaleMin, config.scaleMax);
    chunkAndInstantiate(env, env.loadedModels[config.key], transforms, false);
  }

  if (env.loadedModels.fence && env.fenceTransforms.length > 0) {
    createInstancedFromModel(env, env.loadedModels.fence, env.fenceTransforms, true);
  }

  if (env.loadedModels.smallRock && env.roadRockTransforms.length > 0) {
    createInstancedFromModel(env, env.loadedModels.smallRock, env.roadRockTransforms, false);
  }

  hideLoadingScreen();
}
