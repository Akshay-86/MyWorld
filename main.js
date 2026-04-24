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
//  TERRAIN (multi-pond)
// ============================================================
function getTerrainHeight(x, z) {
    let y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4;
    y += Math.sin(x * 0.02) * Math.cos(z * 0.02) * 8;
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

function createTerrain() {
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 200, 200); // higher res
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        positions.setY(i, getTerrainHeight(positions.getX(i), positions.getZ(i)));
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
        color: 0x4CAF50, roughness: 0.8, flatShading: true
    });
    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
}
createTerrain();

// ============================================================
//  WATER — simple flat disc inside each bowl. Water is flat!
// ============================================================
const waterMat = new THREE.MeshStandardMaterial({
    color: 0x29B6F6, transparent: true, opacity: 0.82,
    roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide
});

function createPondWater(pond) {
    // The center of the bowl is the deepest point.
    // We fill the bowl ~60% of the way up from center to rim.
    const centerY = getTerrainHeight(pond.x, pond.z); // deepest
    const waterY = centerY + pond.depth * 0.6;
    
    const geo = new THREE.CircleGeometry(pond.radius * 0.75, 48);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, waterMat);
    water.position.set(pond.x, waterY, pond.z);
    water.receiveShadow = true;
    scene.add(water);
}

PONDS.forEach(p => createPondWater(p));

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
        vertices.push(lx, getTerrainHeight(lx, lz) + 0.12, lz);
        vertices.push(rx, getTerrainHeight(rx, rz) + 0.12, rz);
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

    // Collect rock positions (will be instanced later)
    for (let i = 0; i < dist / 6; i++) {
        const cp = centerPoints[Math.floor(Math.random() * centerPoints.length)];
        const side = Math.random() > 0.5 ? 1 : -1;
        const rx = cp.x + side * (roadWidth + 0.5 + Math.random() * 2);
        const rz = cp.z + side * (roadWidth + 0.5 + Math.random() * 2);
        roadRockTransforms.push({
            x: rx, y: getTerrainHeight(rx, rz) - 0.2, z: rz,
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
        } while (attempts < 80 && (isInsideAnyPond(x, z, 10) || checkCollision(x, z, 8)));

        if (attempts < 80) {
            placedObjects.push({ x, z, radius: 8 });
            const y = getTerrainHeight(x, z);
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
                    x: fx, y: getTerrainHeight(fx, fz), z: fz,
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
                human.position.set(hX, getTerrainHeight(hX, hZ), hZ);
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
                x, y: getTerrainHeight(x, z), z,
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
        } while (attempts < 30 && (isInsideAnyPond(x, z, 5) || checkCollision(x, z, 2)));

        if (attempts < 30) {
            placedObjects.push({ x, z, radius: 2 });
            const key = keys[Math.floor(Math.random() * keys.length)];
            transforms[key].push({
                x, y: getTerrainHeight(x, z), z,
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
            gltf.scene.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            loadedModels[key] = gltf.scene;
            updateProgress();
        });
        await Promise.all(promises);

        // Load Kenney fence + rock
        const fenceGltf = await loader.loadAsync('/models/kenney_nature-kit/Models/GLTF format/fence_simple.glb');
        fenceGltf.scene.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        loadedModels['fence'] = fenceGltf.scene;
        updateProgress();

        const rockGltf = await loader.loadAsync('/models/kenney_nature-kit/Models/GLTF format/rock_smallA.glb');
        rockGltf.scene.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
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

    const time = Date.now() * 0.001;

    // --- Day/Night cycle ---
    const dayProgress = (time % DAY_DURATION) / DAY_DURATION; // 0→1 over DAY_DURATION seconds
    const sunAngle = dayProgress * Math.PI * 2; // full circle

    // Sun position: orbits overhead
    dirLight.position.set(
        Math.cos(sunAngle) * 200,
        Math.sin(sunAngle) * 200 + 50, // stays above horizon mostly
        100
    );

    // Is the sun above the horizon?
    const sunHeight = Math.sin(sunAngle); // -1 to 1
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

    renderer.render(scene, camera);
}
animate();
