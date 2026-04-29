import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================
//  CONFIG
// ============================================================
const WORLD_SIZE = 600;
const NUM_HOUSES = 50;
const NUM_TREES = 1500;

// Pond definitions: { x, z, radius, depth }
const PONDS = [
    { x: 0,    z: 0,    radius: 30, depth: 9 },
    { x: 150,  z: 100,  radius: 20, depth: 7 },
    { x: -130, z: -90,  radius: 25, depth: 8 },
    { x: 90,   z: -160, radius: 18, depth: 6 },
    { x: -180, z: 130,  radius: 22, depth: 7 },
    { x: 145,  z: -20,  radius: 35, depth: 10 }, // Waterfall splash pond
    { x: 195,  z: -20,  radius: 30, depth: 8 },  // Waterfall source pond (Upper Lake)
];

// ============================================================
//  SCENE, CAMERA, RENDERER
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.006);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 30, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap for high-DPI
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ============================================================
//  CONTROLS
// ============================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 3;
controls.maxDistance = 500;
controls.zoomSpeed = 2.0;
controls.screenSpacePanning = true;

let terrainMesh; // declared early for zoom raycaster
const zoomRaycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('wheel', () => {
    requestAnimationFrame(() => {
        if (!terrainMesh) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        zoomRaycaster.set(camera.position, dir);
        const hits = zoomRaycaster.intersectObject(terrainMesh);
        if (hits.length > 0) controls.target.copy(hits[0].point);
    });
});

const keysPressed = {};
window.addEventListener('keydown', (e) => { keysPressed[e.code] = true; });
window.addEventListener('keyup', (e) => { keysPressed[e.code] = false; });

// ============================================================
//  LIGHTING (optimized shadow map)
// ============================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;  // reduced from 4096
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 600;
dirLight.shadow.camera.left = -300;
dirLight.shadow.camera.right = 300;
dirLight.shadow.camera.top = 300;
dirLight.shadow.camera.bottom = -300;
scene.add(dirLight);

// ============================================================
//  TERRAIN (multi-pond + Mountain & Pass)
// ============================================================
function getTerrainHeight(x, z) {
    let y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4;
    y += Math.sin(x * 0.02) * Math.cos(z * 0.02) * 8;

    // --- ISLAND / BOWL EFFECT ---
    const distFromCenter = Math.max(Math.abs(x), Math.abs(z));
    const edgeStart = (WORLD_SIZE / 2) * 0.7; 
    if (distFromCenter > edgeStart) {
        const t = (distFromCenter - edgeStart) / ((WORLD_SIZE / 2) - edgeStart);
        y += t * t * 50; 
    }

    // --- CLIFF / PLATEAU ---
    const cliffNoise = Math.sin(z * 0.05) * 8 + Math.cos(z * 0.1) * 4;
    const cliffEdge = 160 + cliffNoise;

    // --- MOUNTAIN PASS (The Way Up) ---
    // At z ≈ 60, we create a much wider ramp (60 units instead of 12)
    const passZ = 60;
    const passRange = 40;
    const distToPass = Math.abs(z - passZ);
    let rampWidth = 12;
    if (distToPass < passRange) {
        const passT = 1.0 - (distToPass / passRange);
        rampWidth = 12 + (passT * 50); // Becomes a 62-unit long ramp
    }

    if (x > cliffEdge) {
        const plateauHeight = 35;
        const t = Math.min(1, Math.max(0, (x - cliffEdge) / rampWidth));
        y += (t * t * (3 - 2 * t)) * plateauHeight;
    }

    // --- MOUNTAIN PEAK (River Source) ---
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

function isInsideAnyPond(x, z, margin = 0) {
    for (const pond of PONDS) {
        const dist = Math.sqrt((x - pond.x) ** 2 + (z - pond.z) ** 2);
        if (dist < pond.radius + margin) return true;
    }
    return false;
}

function isOnCliff(x, z) {
    const cliffNoise = Math.sin(z * 0.05) * 8 + Math.cos(z * 0.1) * 4;
    const cliffEdge = 160 + cliffNoise;
    // Slope varies by rampWidth now
    const passZ = 60;
    const distToPass = Math.abs(z - passZ);
    const rw = distToPass < 40 ? 12 + (1 - distToPass/40) * 50 : 12;
    return (x > cliffEdge - 2 && x < cliffEdge + rw + 2);
}

const groundRaycaster = new THREE.Raycaster();
function getYOnTerrain(x, z) {
    return getTerrainHeight(x, z) - 0.1;
}

function createTerrain() {
    const res = 250;
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, res, res);
    geometry.rotateX(-Math.PI / 2);
    
    const positions = geometry.attributes.position;
    const colors = [];
    const colorGrass = new THREE.Color(0x4CAF50);
    const colorRock = new THREE.Color(0x795548); 
    const colorPath = new THREE.Color(0x8D6E63); // Lighter path color
    
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const y = getTerrainHeight(x, z);
        positions.setY(i, y);
        
        const cliffNoise = Math.sin(z * 0.05) * 8 + Math.cos(z * 0.1) * 4;
        const cliffEdge = 160 + cliffNoise;
        
        // Pass zone coloring (Visual path up the ramp)
        const isPass = Math.abs(z - 60) < 10 && x > cliffEdge && x < cliffEdge + 60;

        if (isPass) {
            colors.push(colorPath.r, colorPath.g, colorPath.b);
        } else if (isOnCliff(x, z) && Math.abs(z - 60) > 30) {
            // Only show rock on steep cliffs, not on the pass
            const lerpVal = Math.random() * 0.3;
            const mixedColor = colorRock.clone().lerp(new THREE.Color(0x5D4037), lerpVal);
            colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
        } else {
            colors.push(colorGrass.r, colorGrass.g, colorGrass.b);
        }
    }
    
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.9, flatShading: true
    });
    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
}
createTerrain();

// ============================================================
//  WATER — Low-poly animated water
// ============================================================
const waterMat = new THREE.MeshStandardMaterial({
    color: 0x29B6F6, 
    transparent: true, 
    opacity: 0.82,
    roughness: 0.05, 
    metalness: 0.3, 
    side: THREE.DoubleSide,
    flatShading: true,
    depthWrite: true 
});

const waterMeshes = [];
let riverCurve; 

// Shared Water Levels
const PLATEAU_WATER_LEVEL = 34.8; // Flush with plateau

let riverEndPos = new THREE.Vector3(164, 34.8, -20); // Global for waterfall reset

function createRiver() {
    // Waypoints for the meandering path
    const waypoints = [
        new THREE.Vector3(295, 0, -50),
        new THREE.Vector3(275, 0, -10),
        new THREE.Vector3(255, 0, -40),
        new THREE.Vector3(235, 0, -15),
        new THREE.Vector3(215, 0, -30),
        new THREE.Vector3(195, 0, -20),
        new THREE.Vector3(180, 0, -12),
        new THREE.Vector3(173, 0, -20) // Cliff Edge
    ];

    const spline = new THREE.CatmullRomCurve3(waypoints);
    const riverWidth = 5.6; 
    const segments = 200; 
    const centerPoints = spline.getPoints(segments);
    
    const lastCP = centerPoints[segments];
    const upperPondHeight = getPondRimHeight(PONDS[6]) - 0.1;
    riverEndPos.set(lastCP.x, upperPondHeight, lastCP.z);

    const vertices = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
        const cp = centerPoints[i];
        let ddx, ddz;
        if (i < segments) { ddx = centerPoints[i + 1].x - cp.x; ddz = centerPoints[i + 1].z - cp.z; }
        else { ddx = cp.x - centerPoints[i - 1].x; ddz = cp.z - centerPoints[i - 1].z; }
        
        const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        const perpX = -ddz / len * riverWidth;
        const perpZ = ddx / len * riverWidth;
        
        const lx = cp.x + perpX, lz = cp.z + perpZ;
        const rx = cp.x - perpX, rz = cp.z - perpZ;
        
        // INTEGRATED HEIGHT LOGIC:
        let hL = getTerrainHeight(lx, lz) + 0.4;
        let hR = getTerrainHeight(rx, rz) + 0.4;

        // Sample ponds to lock river height to pond surface
        for (let pIdx = 0; pIdx < PONDS.length; pIdx++) {
            const pond = PONDS[pIdx];
            const distL = Math.sqrt((lx - pond.x)**2 + (lz - pond.z)**2);
            const distR = Math.sqrt((rx - pond.x)**2 + (rz - pond.z)**2);
            if (distL < pond.radius + 2 || distR < pond.radius + 2) {
                const pH = getPondRimHeight(pond) - 0.1;
                hL = Math.min(hL, pH);
                hR = Math.min(hR, pH);
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

    const river = new THREE.Mesh(geo, waterMat);
    scene.add(river);
    waterMeshes.push(river);

    // River Source (Spring)
    const sourcePos = waypoints[0];
    const sourceGeo = new THREE.CircleGeometry(12, 16);
    sourceGeo.rotateX(-Math.PI / 2);
    const source = new THREE.Mesh(sourceGeo, waterMat);
    source.position.set(sourcePos.x, getTerrainHeight(sourcePos.x, sourcePos.z) + 0.5, sourcePos.z);
    scene.add(source);
    waterMeshes.push(source);
}

function getPondRimHeight(pond) {
    let minHeight = Infinity;
    const r = pond.radius + 0.8; 
    for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        const h = getTerrainHeight(pond.x + Math.cos(angle) * r, pond.z + Math.sin(angle) * r);
        if (h < minHeight) minHeight = h;
    }
    return minHeight;
}

function createPondWater(pond, index) {
    const waterY = getPondRimHeight(pond) - 0.1;
    const segments = 64;
    // We use a slightly smaller radius to avoid z-fighting with the rim
    const geo = new THREE.CylinderGeometry(pond.radius * 0.98, pond.radius * 0.98, 1, segments, 1);
    
    const pos = geo.attributes.position;
    
    // Explicitly find min/max Y to avoid any coordinate system confusion
    let minY = 1000, maxY = -1000;
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const threshold = (minY + maxY) / 2;

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const y = pos.getY(i);
        
        const worldX = x + pond.x;
        const worldZ = z + pond.z;
        
        if (y > threshold) {
            // TOP SURFACE: Must be perfectly flat
            pos.setY(i, 0); 
        } else {
            // BOTTOM SURFACE: Must follow the carved terrain
            // We sample slightly inside to ensure we hit the "bowl" part of the terrain
            const terrainY = getTerrainHeight(worldX, worldZ);
            pos.setY(i, terrainY - waterY);
        }
    }
    
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    
    const water = new THREE.Mesh(geo, waterMat);
    water.position.set(pond.x, waterY, pond.z);
    water.receiveShadow = true;
    scene.add(water);
    waterMeshes.push(water);
}

PONDS.forEach((p, i) => createPondWater(p, i));
createRiver();

// ============================================================
//  WATERFALL — Curved Particle Path
// ============================================================
const waterfallCubes = [];

function createWaterfallPath(startX, startY, startZ) {
    const points = [];
    const lowerPond = PONDS[5];
    const splashY = getTerrainHeight(lowerPond.x, lowerPond.z) + lowerPond.depth * 0.75;
    
    // Calculate the cliff parameters to hug the face
    const cliffNoise = Math.sin(startZ * 0.05) * 8 + Math.cos(startZ * 0.1) * 4;
    const cliffEdge = 160 + cliffNoise;
    const passZ = 60;
    const distToPass = Math.abs(startZ - passZ);
    const rw = distToPass < 40 ? 12 + (1 - distToPass/40) * 50 : 12;

    // 1. Top Point
    points.push(new THREE.Vector3(startX, startY, startZ));
    
    // 2. The Lip (Hug the cliff curve)
    const lipY = startY - 4;
    const lipX = cliffEdge + (rw * 0.1); 
    points.push(new THREE.Vector3(lipX, lipY, startZ));
    
    // 3. The Face (Middle drop, hugging the base of the rock)
    const midY = (startY + splashY) / 2;
    const midX = cliffEdge + (rw * 0.02); 
    points.push(new THREE.Vector3(midX, midY, startZ));
    
    // 4. The Splash
    points.push(new THREE.Vector3(cliffEdge - 3, splashY, startZ));
    
    return new THREE.CatmullRomCurve3(points);
}

function createWaterfall() {
    const cubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6); 
    const cubeMat = new THREE.MeshStandardMaterial({ 
        color: 0x4FC3F7, 
        transparent: true, 
        opacity: 0.7, 
        flatShading: true,
        depthWrite: false 
    });

    for (let i = 0; i < 150; i++) { // High density
        const cube = new THREE.Mesh(cubeGeo, cubeMat);
        
        // Randomize spawn along river width
        const jitterZ = (Math.random() - 0.5) * 5.4;
        const jitterX = (Math.random() - 0.5) * 1.5;
        const startX = riverEndPos.x + jitterX;
        const startY = riverEndPos.y + 0.2;
        const startZ = riverEndPos.z + jitterZ;

        cube.userData.path = createWaterfallPath(startX, startY, startZ);
        cube.userData.progress = Math.random(); 
        cube.userData.speed = 0.006 + Math.random() * 0.006;
        
        const s = 0.5 + Math.random() * 1.5;
        cube.scale.set(s, s, s);
        
        scene.add(cube);
        waterfallCubes.push(cube);
    }
}

createWaterfall();

// ============================================================
//  FALLBACK MODELS (Houses & Humans – kept as individual meshes, low count)
// ============================================================
function createHouseFallback() {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(5, 4, 5),
        new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 })
    );
    base.position.y = 2; base.castShadow = true; base.receiveShadow = true;
    group.add(base);
    const roofGeo = new THREE.ConeGeometry(4.5, 4, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0xE53935, roughness: 0.7 }));
    roof.position.y = 6; roof.castShadow = true;
    group.add(roof);
    return group;
}

function createHumanFallback() {
    const human = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 0.8, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x1976D2, roughness: 0.5 })
    );
    human.position.y = 0.7; human.castShadow = true;
    return human;
}

// ============================================================
//  ASSET LOADING
// ============================================================
const loader = new GLTFLoader();
const assetNames = {
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
    deadTree: 'DeadTree_1.gltf'
};
const loadedModels = {};
const humans = [];
const housePositions = [];
const placedObjects = [];

function checkCollision(x, z, radius) {
    for (const obj of placedObjects) {
        const dx = obj.x - x;
        const dz = obj.z - z;
        if (dx * dx + dz * dz < (obj.radius + radius) ** 2) return true; // avoid sqrt
    }
    return false;
}

// ============================================================
//  INSTANCED MESH HELPER
// ============================================================
// Takes a loaded GLTF scene, extracts all meshes, and creates
// one InstancedMesh per internal mesh, all sharing the same
// transform matrices. Returns the instanced meshes.
function createInstancedFromModel(modelScene, transforms, castShadow = true) {
    // Collect meshes from the model
    const sourceMeshes = [];
    modelScene.traverse(child => {
        if (child.isMesh) sourceMeshes.push(child);
    });
    if (sourceMeshes.length === 0) return [];

    const count = transforms.length;
    const dummy = new THREE.Object3D();
    const instancedMeshes = [];

    for (const srcMesh of sourceMeshes) {
        const im = new THREE.InstancedMesh(srcMesh.geometry, srcMesh.material, count);
        im.castShadow = castShadow;
        im.receiveShadow = true;

        for (let i = 0; i < count; i++) {
            const t = transforms[i];
            dummy.position.set(t.x, t.y, t.z);
            dummy.scale.set(t.scale, t.scale, t.scale);
            dummy.rotation.set(0, t.rotY, 0);
            dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
        scene.add(im);
        instancedMeshes.push(im);
    }
    return instancedMeshes;
}

// ============================================================
//  PATH (ROAD) GENERATION
// ============================================================
// Collect ALL road-side rock positions, then instance them at the end
const roadRockTransforms = [];

function createPathBetween(p1, p2) {
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
        let ddx, ddz;
        if (i < segments) { ddx = centerPoints[i + 1].x - cp.x; ddz = centerPoints[i + 1].z - cp.z; }
        else { ddx = cp.x - centerPoints[i - 1].x; ddz = cp.z - centerPoints[i - 1].z; }
        const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        const perpX = -ddz / len * roadWidth;
        const perpZ = ddx / len * roadWidth;
        const lx = cp.x + perpX, lz = cp.z + perpZ;
        const rx = cp.x - perpX, rz = cp.z - perpZ;
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
    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x5D4037, roughness: 1.0, side: THREE.DoubleSide
    }));
    road.receiveShadow = true;
    scene.add(road);

    // Register road path to collision system so trees avoid it
    centerPoints.forEach(p => {
        placedObjects.push({ x: p.x, z: p.z, radius: roadWidth + 1 });
    });

    // Collect rock positions (will be instanced later)
    for (let i = 0; i < dist / 6; i++) {
        const cp = centerPoints[Math.floor(Math.random() * centerPoints.length)];
        const side = Math.random() > 0.5 ? 1 : -1;
        const rx = cp.x + side * (roadWidth + 0.5 + Math.random() * 2);
        const rz = cp.z + side * (roadWidth + 0.5 + Math.random() * 2);
        roadRockTransforms.push({
            x: rx, y: getYOnTerrain(rx, rz) - 0.2, z: rz,
            scale: 0.5 + Math.random(), rotY: Math.random() * Math.PI * 2
        });
    }
}

// ============================================================
//  FENCE TRANSFORMS COLLECTION
// ============================================================
const fenceTransforms = [];

// ============================================================
//  WORLD SPAWNING
// ============================================================
function spawnWorld() {
    // --- HOUSES (individual meshes, only 50) ---
    for (let i = 0; i < NUM_HOUSES; i++) {
        const house = createHouseFallback();
        let x, z, attempts = 0;
        do {
            x = (Math.random() - 0.5) * (WORLD_SIZE - 40);
            z = (Math.random() - 0.5) * (WORLD_SIZE - 40);
            attempts++;
        } while (attempts < 80 && (isInsideAnyPond(x, z, 10) || isOnCliff(x, z) || checkCollision(x, z, 8)));

        if (attempts < 80) {
            placedObjects.push({ x, z, radius: 8 });
            const y = getTerrainHeight(x, z) - 0.1;
            house.position.set(x, y, z);
            house.rotation.y = Math.random() * Math.PI * 2;
            scene.add(house);
            housePositions.push({ x, y, z });

            // Collect fence transforms
            const fs = 5;
            const offsets = [[fs, 0], [-fs, 0], [0, fs], [0, -fs]];
            offsets.forEach((off, idx) => {
                const fx = x + off[0], fz = z + off[1];
                fenceTransforms.push({
                    x: fx, y: getYOnTerrain(fx, fz), z: fz,
                    scale: 2, rotY: idx < 2 ? Math.PI / 2 : 0
                });
            });

            // Humans (individual, only ~150 total)
            for (let j = 0; j < 3; j++) {
                const human = createHumanFallback();
                const angle = Math.random() * Math.PI * 2;
                const dist = 4 + Math.random() * 2;
                const hX = x + Math.cos(angle) * dist;
                const hZ = z + Math.sin(angle) * dist;
                human.position.set(hX, getYOnTerrain(hX, hZ), hZ);
                scene.add(human);
                humans.push(human);
            }
        }
    }

    // --- PATHS ---
    for (let i = 0; i < housePositions.length; i++) {
        let nearestDist = Infinity, nearestIdx = -1;
        for (let j = 0; j < housePositions.length; j++) {
            if (i === j) continue;
            const dx = housePositions[i].x - housePositions[j].x;
            const dz = housePositions[i].z - housePositions[j].z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < nearestDist) { nearestDist = d; nearestIdx = j; }
        }
        if (nearestIdx !== -1 && nearestDist < 120) {
            createPathBetween(housePositions[i], housePositions[nearestIdx]);
        }
    }

    // --- MAIN ROAD TO PLATEAU (The Way Up) ---
    // This ensures a path exists through the pass
    createPathBetween({ x: 20, z: 60 }, { x: 220, z: 60 });
}

// ============================================================
//  GENERATE SCATTER TRANSFORMS
// ============================================================
function generateScatterTransforms(count, scaleMin, scaleMax, pondMargin = 5) {
    const transforms = [];
    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE;
        const z = (Math.random() - 0.5) * WORLD_SIZE;
        if (!isInsideAnyPond(x, z, pondMargin)) {
            transforms.push({
                x, y: getTerrainHeight(x, z) - 0.1, z,
                scale: scaleMin + Math.random() * (scaleMax - scaleMin),
                rotY: Math.random() * Math.PI * 2
            });
        }
    }
    return transforms;
}

function generateTreeTransforms() {
    const transforms = { tree1: [], tree2: [], tree3: [], tree4: [], deadTree: [] };
    const keys = ['tree1', 'tree1', 'tree1', 'tree2', 'tree2', 'tree2',
                  'tree3', 'tree3', 'tree3', 'tree4', 'tree4', 'tree4', 'deadTree'];

    for (let i = 0; i < NUM_TREES; i++) {
        let x, z, attempts = 0;
        do {
            x = (Math.random() - 0.5) * WORLD_SIZE;
            z = (Math.random() - 0.5) * WORLD_SIZE;
            attempts++;
        } while (attempts < 30 && (isInsideAnyPond(x, z, 5) || isOnCliff(x, z) || checkCollision(x, z, 2)));

        if (attempts < 30) {
            placedObjects.push({ x, z, radius: 2 });
            const key = keys[Math.floor(Math.random() * keys.length)];
            transforms[key].push({
                x, y: getTerrainHeight(x, z) - 0.1, z,
                scale: 2 + Math.random() * 3,
                rotY: Math.random() * Math.PI * 2
            });
        }
    }
    return transforms;
}

// ============================================================
//  MAIN INIT
// ============================================================
async function initModelsAndSpawn() {
    const basePath = '/models/Ultimate Stylized Nature - May 2022/glTF/';
    const progressBar = document.getElementById('load-progress');
    const totalSteps = Object.keys(assetNames).length + 2; // +fence +rock
    let loaded = 0;
    const updateProgress = () => {
        loaded++;
        if (progressBar) progressBar.style.width = Math.round((loaded / totalSteps) * 100) + '%';
    };

    try {
        // Load Quaternius models
        const promises = Object.entries(assetNames).map(async ([key, filename]) => {
            const gltf = await loader.loadAsync(basePath + filename);
            gltf.scene.traverse(c => { 
                if (c.isMesh) { 
                    c.castShadow = true; 
                    c.receiveShadow = true; 
                    if (c.material.map) { 
                        c.material.alphaTest = 0.5;
                        c.material.transparent = false; // TREES MUST BE OPAQUE to block depth
                        c.material.depthWrite = true;
                        c.material.needsUpdate = true;
                    }
                } 
            });
            loadedModels[key] = gltf.scene;
            updateProgress();
        });
        await Promise.all(promises);

        // Load Kenney fence + rock
        const fenceGltf = await loader.loadAsync('/models/kenney_nature-kit/Models/GLTF format/fence_simple.glb');
        fenceGltf.scene.traverse(c => { 
            if (c.isMesh) { 
                c.castShadow = true; 
                c.receiveShadow = true; 
                if (c.material.map && c.material.transparent) {
                    c.material.alphaTest = 0.5;
                }
            } 
        });
        loadedModels['fence'] = fenceGltf.scene;
        updateProgress();

        const rockGltf = await loader.loadAsync('/models/kenney_nature-kit/Models/GLTF format/rock_smallA.glb');
        rockGltf.scene.traverse(c => { 
            if (c.isMesh) { 
                c.castShadow = true; 
                c.receiveShadow = true; 
                if (c.material.map && c.material.transparent) {
                    c.material.alphaTest = 0.5;
                }
            } 
        });
        loadedModels['smallRock'] = rockGltf.scene;
        updateProgress();
    } catch (e) {
        console.error('Model loading failed, using fallbacks', e);
    }

    // --- Spawn houses, paths (collects fence & rock transforms) ---
    spawnWorld();

    // --- INSTANCED TREES ---
    const treeTransforms = generateTreeTransforms();
    for (const key of Object.keys(treeTransforms)) {
        if (loadedModels[key] && treeTransforms[key].length > 0) {
            createInstancedFromModel(loadedModels[key], treeTransforms[key], true);
        }
    }

    // --- INSTANCED FLORA (no shadows for small plants = big GPU save) ---
    const floraConfig = [
        { key: 'bush',    count: 500,  scaleMin: 1.5, scaleMax: 3.0 },
        { key: 'bush2',   count: 400,  scaleMin: 1.5, scaleMax: 3.0 },
        { key: 'grass',   count: 4000, scaleMin: 1.0, scaleMax: 2.5 },
        { key: 'flowerR', count: 250,  scaleMin: 1.0, scaleMax: 2.0 },
        { key: 'flowerY', count: 250,  scaleMin: 1.0, scaleMax: 2.0 },
        { key: 'flowerP', count: 250,  scaleMin: 1.0, scaleMax: 2.0 },
    ];
    for (const cfg of floraConfig) {
        if (!loadedModels[cfg.key]) continue;
        const transforms = generateScatterTransforms(cfg.count, cfg.scaleMin, cfg.scaleMax);
        createInstancedFromModel(loadedModels[cfg.key], transforms, false); // no shadow
    }

    // --- INSTANCED FENCES ---
    if (loadedModels.fence && fenceTransforms.length > 0) {
        createInstancedFromModel(loadedModels.fence, fenceTransforms, true);
    }

    // --- INSTANCED ROAD ROCKS ---
    if (loadedModels.smallRock && roadRockTransforms.length > 0) {
        createInstancedFromModel(loadedModels.smallRock, roadRockTransforms, false);
    }

    // --- HIDE LOADING SCREEN ---
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => { loadingScreen.style.display = 'none'; }, 1200);
    }
}

initModelsAndSpawn();

// ============================================================
//  RESIZE
// ============================================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
//  ANIMATION LOOP
// ============================================================
// ============================================================
//  DAY / NIGHT CYCLE
// ============================================================
const DAY_DURATION = 120; // seconds for a full day
const skyColorDay = new THREE.Color(0x87CEEB);
const skyColorSunset = new THREE.Color(0xFF7043);
const skyColorNight = new THREE.Color(0x0a1128);
const fogColorDay = new THREE.Color(0x87CEEB);
const fogColorNight = new THREE.Color(0x0a1128);

function animate() {
    requestAnimationFrame(animate);

    const now = new Date();
    const time = now.getTime() * 0.001;
    
    // --- Real-World Day/Night cycle ---
    // Calculate progress (0 to 1) based on current hours, minutes, seconds
    const secondsSinceMidnight = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
    const dayProgress = secondsSinceMidnight / 86400; 

    // Adjust angle: 
    // Midnight (0.0) -> -PI/2 (Directly below)
    // 6 AM (0.25) -> 0 (Horizon/Rise)
    // Noon (0.5) -> PI/2 (Zenith/Up)
    // 6 PM (0.75) -> PI (Horizon/Set)
    const sunAngle = (dayProgress * Math.PI * 2) - (Math.PI / 2); 

    // Sun position: orbits overhead
    dirLight.position.set(
        Math.cos(sunAngle) * -200, // Moves West to East
        Math.sin(sunAngle) * 200,  // Positive is UP
        100
    );

    // Is the sun above the horizon?
    const sunHeight = Math.sin(sunAngle); 
    const isDay = sunHeight > 0;
    const t = Math.max(0, sunHeight); // 0 at horizon, 1 at zenith

    // Sky color transition
    const currentSky = new THREE.Color();
    if (sunHeight > 0.15) {
        // Full day
        currentSky.copy(skyColorDay);
    } else if (sunHeight > -0.05) {
        // Sunset/sunrise zone
        const blend = (sunHeight + 0.05) / 0.2;
        currentSky.lerpColors(skyColorSunset, skyColorDay, blend);
    } else {
        // Night
        const blend = Math.min(1, (sunHeight + 0.05) / -0.3);
        currentSky.lerpColors(skyColorSunset, skyColorNight, blend);
    }
    scene.background = currentSky;
    scene.fog.color.copy(currentSky);

    // Light intensity
    dirLight.intensity = Math.max(0.05, t * 0.9);
    ambientLight.intensity = 0.15 + t * 0.5;

    // --- WASD / Arrow movement ---
    const moveSpeed = 1.5;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    if (keysPressed['KeyW'] || keysPressed['ArrowUp']) {
        controls.target.addScaledVector(forward, moveSpeed);
        camera.position.addScaledVector(forward, moveSpeed);
    }
    if (keysPressed['KeyS'] || keysPressed['ArrowDown']) {
        controls.target.addScaledVector(forward, -moveSpeed);
        camera.position.addScaledVector(forward, -moveSpeed);
    }
    if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
        controls.target.addScaledVector(right, -moveSpeed);
        camera.position.addScaledVector(right, -moveSpeed);
    }
    if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
        controls.target.addScaledVector(right, moveSpeed);
        camera.position.addScaledVector(right, moveSpeed);
    }

    controls.update();

    // Human idle bobbing
    humans.forEach((human, i) => {
        const h = getTerrainHeight(human.position.x, human.position.z);
        human.position.y = h + 0.7 + Math.sin(time * 2 + i) * 0.1;
    });

    // --- Water Animation ---
    waterMeshes.forEach((water) => {
        const pos = water.geometry.attributes.position;
        const timeOffset = time * 2;
        
        for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i) + water.position.x;
            const pz = pos.getZ(i) + water.position.z;
            
            // Simple wave math
            const wave = Math.sin(px * 0.4 + timeOffset) * 0.15 + 
                         Math.cos(pz * 0.4 + timeOffset * 0.8) * 0.15;
            
            // If it's a pond (CircleGeometry), we can just set Y
            // If it's the river (TubeGeometry), we should be careful not to flatten it
            if (water.geometry.type === 'CircleGeometry' || water.geometry.type === 'BufferGeometry') {
                pos.setY(i, pos.getY(i) + wave * 0.1); // Jitter the existing grounded height
            } 
        }
        pos.needsUpdate = true;
    });

    // --- Waterfall Animation ---
    waterfallCubes.forEach(cube => {
        // Update progress along the curved path
        cube.userData.progress += cube.userData.speed;
        
        if (cube.userData.progress >= 1.0) {
            cube.userData.progress = 0;
            // Slightly vary speed on reset
            cube.userData.speed = 0.006 + Math.random() * 0.006;
        }

        // Get the current position along the spline
        const point = cube.userData.path.getPointAt(cube.userData.progress);
        cube.position.copy(point);
        
        // Rotate while falling
        cube.rotation.x += 0.05;
        cube.rotation.y += 0.05;
    });

    renderer.render(scene, camera);
}
animate();
