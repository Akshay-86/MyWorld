import * as THREE from 'three';
import { PONDS, SKY_COLOR_DAY, SKY_COLOR_NIGHT, SKY_COLOR_SUNSET, WORLD_SIZE } from './config.js';

export function getTerrainHeight(x, z) {
  let y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4;
  y += Math.sin(x * 0.02) * Math.cos(z * 0.02) * 8;

  const distFromCenter = Math.max(Math.abs(x), Math.abs(z));
  const edgeStart = (WORLD_SIZE / 2) * 0.7;
  if (distFromCenter > edgeStart) {
    const t = (distFromCenter - edgeStart) / ((WORLD_SIZE / 2) - edgeStart);
    y += t * t * 50;
  }

  const cliffNoise = Math.sin(z * 0.05) * 8 + Math.cos(z * 0.1) * 4;
  const cliffEdge = 160 + cliffNoise;
  const passZ = 60;
  const passRange = 40;
  const distToPass = Math.abs(z - passZ);
  let rampWidth = 12;
  if (distToPass < passRange) {
    const passT = 1.0 - distToPass / passRange;
    rampWidth = 12 + passT * 50;
  }

  if (x > cliffEdge) {
    const plateauHeight = 35;
    const t = Math.min(1, Math.max(0, (x - cliffEdge) / rampWidth));
    y += (t * t * (3 - 2 * t)) * plateauHeight;
  }

  if (x > 230) {
    const peakHeight = 40;
    const pt = (x - 230) / 70;
    y += pt * pt * peakHeight;
  }

  for (const pond of PONDS) {
    const dist = Math.sqrt((x - pond.x) ** 2 + (z - pond.z) ** 2);
    if (dist < pond.radius) {
      y -= Math.cos((dist / pond.radius) * (Math.PI / 2)) * pond.depth;
    }
  }

  return y;
}

export function isInsideAnyPond(x, z, margin = 0) {
  for (const pond of PONDS) {
    const dist = Math.sqrt((x - pond.x) ** 2 + (z - pond.z) ** 2);
    if (dist < pond.radius + margin) return true;
  }
  return false;
}

export function isOnCliff(x, z) {
  const cliffNoise = Math.sin(z * 0.05) * 8 + Math.cos(z * 0.1) * 4;
  const cliffEdge = 160 + cliffNoise;
  const passZ = 60;
  const distToPass = Math.abs(z - passZ);
  const rampWidth = distToPass < 40 ? 12 + (1 - distToPass / 40) * 50 : 12;
  return x > cliffEdge - 2 && x < cliffEdge + rampWidth + 2;
}

export function getYOnTerrain(x, z) {
  return getTerrainHeight(x, z) - 0.1;
}

function getPondRimHeight(pond) {
  let minHeight = Infinity;
  const rimRadius = pond.radius + 0.8;
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const height = getTerrainHeight(pond.x + Math.cos(angle) * rimRadius, pond.z + Math.sin(angle) * rimRadius);
    if (height < minHeight) minHeight = height;
  }
  return minHeight;
}

function createTerrain(env) {
  const resolution = 250;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const colors = [];
  const colorGrass = new THREE.Color(0x4CAF50);
  const colorRock = new THREE.Color(0x795548);
  const colorPath = new THREE.Color(0x8D6E63);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, getTerrainHeight(x, z));

    const cliffNoise = Math.sin(z * 0.05) * 8 + Math.cos(z * 0.1) * 4;
    const cliffEdge = 160 + cliffNoise;
    const isPass = Math.abs(z - 60) < 10 && x > cliffEdge && x < cliffEdge + 60;

    if (isPass) {
      colors.push(colorPath.r, colorPath.g, colorPath.b);
    } else if (isOnCliff(x, z) && Math.abs(z - 60) > 30) {
      const lerpVal = Math.random() * 0.3;
      const mixedColor = colorRock.clone().lerp(new THREE.Color(0x5D4037), lerpVal);
      colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
    } else {
      colors.push(colorGrass.r, colorGrass.g, colorGrass.b);
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  env.terrainMesh = new THREE.Mesh(geometry, material);
  env.terrainMesh.receiveShadow = true;
  env.scene.add(env.terrainMesh);
}

function createPondWater(env, pond) {
  const waterY = getPondRimHeight(pond) - 0.1;
  const radialSegments = 64;
  const ringSegments = 16;

  const topGeo = new THREE.RingGeometry(0, pond.radius * 0.98, radialSegments, ringSegments);
  topGeo.rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(topGeo, env.waterMaterial);
  topMesh.position.set(pond.x, waterY, pond.z);
  topMesh.receiveShadow = true;
  env.scene.add(topMesh);
  env.waterMeshes.push(topMesh);

  const bottomGeo = new THREE.RingGeometry(0, pond.radius * 0.98, radialSegments, ringSegments);
  bottomGeo.rotateX(-Math.PI / 2);
  const pos = bottomGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const worldX = pos.getX(i) + pond.x;
    const worldZ = pos.getZ(i) + pond.z;
    const terrainY = getTerrainHeight(worldX, worldZ);
    pos.setY(i, Math.min(0, terrainY - waterY) + 0.05);
  }
  bottomGeo.computeVertexNormals();
  const bottomMesh = new THREE.Mesh(bottomGeo, env.waterMaterial);
  bottomMesh.position.set(pond.x, waterY, pond.z);
  bottomMesh.receiveShadow = true;
  env.scene.add(bottomMesh);
  env.waterMeshes.push(bottomMesh);
}

function createRiver(env) {
  const waypoints = [
    new THREE.Vector3(295, 0, -50),
    new THREE.Vector3(275, 0, -10),
    new THREE.Vector3(255, 0, -40),
    new THREE.Vector3(235, 0, -15),
    new THREE.Vector3(215, 0, -30),
    new THREE.Vector3(195, 0, -20),
    new THREE.Vector3(180, 0, -12),
    new THREE.Vector3(173, 0, -20),
  ];

  const spline = new THREE.CatmullRomCurve3(waypoints);
  const riverWidth = 5.6;
  const segments = 200;
  const centerPoints = spline.getPoints(segments);
  const lastCP = centerPoints[segments];
  const upperPondHeight = getPondRimHeight(PONDS[6]) - 0.1;
  env.riverEndPos.set(lastCP.x, upperPondHeight, lastCP.z);

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
    const perpX = (-ddz / len) * riverWidth;
    const perpZ = (ddx / len) * riverWidth;
    const lx = cp.x + perpX;
    const lz = cp.z + perpZ;
    const rx = cp.x - perpX;
    const rz = cp.z - perpZ;

    let hL = getTerrainHeight(lx, lz) + 0.4;
    let hR = getTerrainHeight(rx, rz) + 0.4;

    for (const pond of PONDS) {
      const distL = Math.sqrt((lx - pond.x) ** 2 + (lz - pond.z) ** 2);
      const distR = Math.sqrt((rx - pond.x) ** 2 + (rz - pond.z) ** 2);
      if (distL < pond.radius + 2 || distR < pond.radius + 2) {
        const pondHeight = getPondRimHeight(pond) - 0.1;
        hL = Math.min(hL, pondHeight);
        hR = Math.min(hR, pondHeight);
        break;
      }
    }

    vertices.push(lx, hL, lz);
    vertices.push(rx, hR, rz);

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

  const river = new THREE.Mesh(geo, env.waterMaterial);
  env.scene.add(river);
  env.waterMeshes.push(river);

  const sourceGeo = new THREE.CircleGeometry(12, 16);
  sourceGeo.rotateX(-Math.PI / 2);
  const source = new THREE.Mesh(sourceGeo, env.waterMaterial);
  source.position.set(waypoints[0].x, getTerrainHeight(waypoints[0].x, waypoints[0].z) + 0.5, waypoints[0].z);
  env.scene.add(source);
  env.waterMeshes.push(source);
}

function createWaterfallPath(env, startX, startY, startZ) {
  const lowerPond = PONDS[5];
  const splashY = getTerrainHeight(lowerPond.x, lowerPond.z) + lowerPond.depth * 0.75;
  const cliffNoise = Math.sin(startZ * 0.05) * 8 + Math.cos(startZ * 0.1) * 4;
  const cliffEdge = 160 + cliffNoise;
  const passZ = 60;
  const distToPass = Math.abs(startZ - passZ);
  const rw = distToPass < 40 ? 12 + (1 - distToPass / 40) * 50 : 12;

  const points = [];
  points.push(new THREE.Vector3(startX, startY, startZ));
  points.push(new THREE.Vector3(cliffEdge + rw * 0.1, startY - 4, startZ));
  points.push(new THREE.Vector3(cliffEdge + rw * 0.02, (startY + splashY) / 2, startZ));
  points.push(new THREE.Vector3(cliffEdge - 3, splashY, startZ));
  return new THREE.CatmullRomCurve3(points);
}

function createWaterfall(env) {
  const cubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0x4FC3F7, transparent: true, opacity: 0.7, flatShading: true, depthWrite: false });

  for (let i = 0; i < 150; i++) {
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    const jitterZ = (Math.random() - 0.5) * 5.4;
    const jitterX = (Math.random() - 0.5) * 1.5;
    const startX = env.riverEndPos.x + jitterX;
    const startY = env.riverEndPos.y + 0.2;
    const startZ = env.riverEndPos.z + jitterZ;

    cube.userData.path = createWaterfallPath(env, startX, startY, startZ);
    cube.userData.progress = Math.random();
    cube.userData.speed = 0.006 + Math.random() * 0.006;
    const scale = 0.5 + Math.random() * 1.5;
    cube.scale.set(scale, scale, scale);
    env.scene.add(cube);
    env.waterfallCubes.push(cube);
  }
}

export function createLandscape(env) {
  env.ponds = PONDS;
  env.waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x29B6F6,
    transparent: true,
    opacity: 0.82,
    roughness: 0.05,
    metalness: 0.3,
    side: THREE.DoubleSide,
    flatShading: true,
    depthWrite: true,
  });

  createTerrain(env);
  PONDS.forEach((pond) => createPondWater(env, pond));
  createRiver(env);
  createWaterfall(env);
}

export function updateDayNight(env) {
  const now = new Date();
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const dayProgress = secondsSinceMidnight / 86400;
  const sunAngle = dayProgress * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  const t = Math.max(0, sunHeight);

  env.dirLight.position.set(Math.cos(sunAngle) * -200, Math.sin(sunAngle) * 200, 100);

  const currentSky = new THREE.Color();
  if (sunHeight > 0.15) {
    currentSky.setHex(SKY_COLOR_DAY);
  } else if (sunHeight > -0.05) {
    currentSky.lerpColors(new THREE.Color(SKY_COLOR_SUNSET), new THREE.Color(SKY_COLOR_DAY), (sunHeight + 0.05) / 0.2);
  } else {
    currentSky.lerpColors(new THREE.Color(SKY_COLOR_SUNSET), new THREE.Color(SKY_COLOR_NIGHT), Math.min(1, (sunHeight + 0.05) / -0.3));
  }

  env.scene.background = currentSky;
  env.scene.fog.color.copy(currentSky);
  env.dirLight.intensity = Math.max(0.05, t * 0.72);
  env.ambientLight.intensity = 0.12 + t * 0.46;
  return { now };
}
