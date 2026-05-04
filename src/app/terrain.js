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
  const cliffEdge = 120 + cliffNoise;
  const passZ = 60;
  const passRange = 40;
  const distToPass = Math.abs(z - passZ);
  let rampWidth = 60;
  if (distToPass < passRange) {
    const passT = 1.0 - distToPass / passRange;
    rampWidth = 60 + passT * 50;
  }

  if (x > cliffEdge) {
    const plateauHeight = 35;
    const t = Math.min(1, Math.max(0, (x - cliffEdge) / rampWidth));
    y += (t * t * (3 - 2 * t)) * plateauHeight;
  }

  // Removed peak generation (x > 230)

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
  const cliffEdge = 120 + cliffNoise;
  const passZ = 60;
  const distToPass = Math.abs(z - passZ);
  const rampWidth = distToPass < 40 ? 60 + (1 - distToPass / 40) * 50 : 60;
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

// River generation removed: rivers are disabled in this build.


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
  PONDS.forEach((pond) => {
    if (!isOnCliff(pond.x, pond.z)) {
      createPondWater(env, pond);
    }
  });
  createBoundaryWalls(env);
}

function createBoundaryWalls(env) {
  // Store boundary info in env for collision detection (invisible walls)
  // We use a large buffer so the player can't walk all the way to the 
  // edge of the terrain plane, allowing the fog to hide the end of the world.
  env.worldBounds = {
    minX: -WORLD_SIZE / 2,
    maxX: WORLD_SIZE / 2,
    minZ: -WORLD_SIZE / 2,
    maxZ: WORLD_SIZE / 2,
    buffer: 400,
  };
}

export function updateDayNight(env) {
  const now = new Date();
  const dayProgress = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
  
  const sunAngle = dayProgress * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  const t = Math.max(0, sunHeight);

  // Position Sun at a far distance so it appears in the sky behind the fog
  const sunDist = 1200;
  env.dirLight.position.set(Math.cos(sunAngle) * -sunDist, Math.sin(sunAngle) * sunDist, 100);
  if (env.sunMesh) {
    env.sunMesh.position.copy(env.dirLight.position);
  }

  // Moon is exactly opposite the sun
  const moonAngle = sunAngle + Math.PI;
  const moonHeight = Math.sin(moonAngle);
  const mt = Math.max(0, moonHeight);
  
  if (env.moonLight) {
    env.moonLight.position.set(Math.cos(moonAngle) * -sunDist, Math.sin(moonAngle) * sunDist, 100);
    env.moonLight.intensity = Math.max(0.01, mt * 0.3); // Weaker light for the moon
  }
  if (env.moonMesh) {
    env.moonMesh.position.copy(env.moonLight.position);
  }

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
  
  // Fade out sun light when moon is out, and vice versa
  env.dirLight.intensity = Math.max(0.0, t * 0.68);
  env.ambientLight.intensity = 0.12 + t * 0.46 + mt * 0.1;
  
  return { now };
}
