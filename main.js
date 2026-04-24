import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const WORLD_SIZE = 600; 
const NUM_HOUSES = 25;
const NUM_TREES = 800; // Dense forest

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); 
scene.fog = new THREE.FogExp2(0x87CEEB, 0.006);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 30, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 3;
controls.maxDistance = 500; // Allow zooming far out for shift+drag travel, then back in to house level

// --- Custom WASD / Arrow Key Navigation ---
const keysPressed = {};
window.addEventListener('keydown', (e) => { keysPressed[e.code] = true; });
window.addEventListener('keyup', (e) => { keysPressed[e.code] = false; }); 

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 600;
dirLight.shadow.camera.left = -300;
dirLight.shadow.camera.right = 300;
dirLight.shadow.camera.top = 300;
dirLight.shadow.camera.bottom = -300;
scene.add(dirLight);

function getTerrainHeight(x, z) {
    let y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4;
    y += Math.sin(x * 0.02) * Math.cos(z * 0.02) * 8; 
    const distFromCenter = Math.sqrt(x*x + z*z);
    if (distFromCenter < 35) {
        const depth = Math.cos((distFromCenter / 35) * (Math.PI / 2)); 
        y -= depth * 10; 
    }
    return y;
}

let terrainMesh;
function createTerrain() {
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 128, 128);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        positions.setY(i, getTerrainHeight(x, z));
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

function createWater() {
    const waterGeo = new THREE.CircleGeometry(32, 64);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x29B6F6, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.2
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -4, 0); 
    water.receiveShadow = true;
    scene.add(water);
}
createWater();

function createHouseFallback() {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(5, 4, 5);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const roofGeo = new THREE.ConeGeometry(4.5, 4, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xE53935, roughness: 0.7 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 6;
    roof.castShadow = true;
    group.add(roof);
    return group;
}

function createHumanFallback() {
    const humanGeo = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
    const humanMat = new THREE.MeshStandardMaterial({ color: 0x1976D2, roughness: 0.5 });
    const human = new THREE.Mesh(humanGeo, humanMat);
    human.position.y = 0.7;
    human.castShadow = true;
    return human;
}

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
        if (Math.sqrt(dx*dx + dz*dz) < (obj.radius + radius)) return true;
    }
    return false;
}

function createPathBetween(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const segments = Math.max(4, Math.floor(dist / 3));
    const roadWidth = 1.8;

    // Build a list of center points along the path
    const centerPoints = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const noiseX = Math.sin(t * Math.PI) * (Math.random() - 0.5) * 3;
        const noiseZ = Math.sin(t * Math.PI) * (Math.random() - 0.5) * 3;
        const cx = p1.x + dx * t + noiseX;
        const cz = p1.z + dz * t + noiseZ;
        centerPoints.push({ x: cx, z: cz });
    }

    // Build flat ribbon geometry: two vertices per center point (left & right)
    const vertices = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
        const cp = centerPoints[i];
        // Calculate perpendicular direction
        let dirX, dirZ;
        if (i < segments) {
            dirX = centerPoints[i + 1].x - cp.x;
            dirZ = centerPoints[i + 1].z - cp.z;
        } else {
            dirX = cp.x - centerPoints[i - 1].x;
            dirZ = cp.z - centerPoints[i - 1].z;
        }
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
        // Perpendicular (rotate 90 degrees)
        const perpX = -dirZ / len * roadWidth;
        const perpZ = dirX / len * roadWidth;

        const lx = cp.x + perpX;
        const lz = cp.z + perpZ;
        const rx = cp.x - perpX;
        const rz = cp.z - perpZ;

        // Place vertices directly on terrain surface + tiny offset to avoid z-fighting
        vertices.push(lx, getTerrainHeight(lx, lz) + 0.12, lz);
        vertices.push(rx, getTerrainHeight(rx, rz) + 0.12, rz);

        // Build two triangles per quad segment
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

    const mat = new THREE.MeshStandardMaterial({
        color: 0x5D4037, roughness: 1.0, side: THREE.DoubleSide
    });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    scene.add(road);

    // Scatter small rocks along the road edges
    if (loadedModels.smallRock) {
        for (let i = 0; i < dist / 6; i++) {
            const idx = Math.floor(Math.random() * centerPoints.length);
            const cp = centerPoints[idx];
            const rock = loadedModels.smallRock.clone();
            const sc = 0.5 + Math.random();
            rock.scale.set(sc, sc, sc);
            const side = Math.random() > 0.5 ? 1 : -1;
            const rx = cp.x + side * (roadWidth + 0.5 + Math.random() * 2);
            const rz = cp.z + side * (roadWidth + 0.5 + Math.random() * 2);
            rock.position.set(rx, getTerrainHeight(rx, rz) - 0.2, rz);
            rock.rotation.y = Math.random() * Math.PI * 2;
            scene.add(rock);
        }
    }
}

function spawnWorld() {
    for (let i = 0; i < NUM_HOUSES; i++) {
        const house = createHouseFallback();
        let x, z, attempts = 0;
        do {
            x = (Math.random() - 0.5) * (WORLD_SIZE - 40);
            z = (Math.random() - 0.5) * (WORLD_SIZE - 40);
            attempts++;
        } while (attempts < 50 && (Math.sqrt(x*x + z*z) < 40 || checkCollision(x, z, 8))); 
        
        if (attempts < 50) {
            placedObjects.push({x, z, radius: 8});
            const y = getTerrainHeight(x, z);
            house.position.set(x, y, z);
            house.rotation.y = Math.random() * Math.PI * 2;
            scene.add(house);
            housePositions.push({x, y, z});

            // Spawn Fences
            if (loadedModels.fence) {
                const fenceSize = 5;
                const fenceOffsets = [
                    [fenceSize, 0, 0], [-fenceSize, 0, 0], [0, 0, fenceSize], [0, 0, -fenceSize]
                ];
                fenceOffsets.forEach((offset, idx) => {
                    const f = loadedModels.fence.clone();
                    f.scale.set(2, 2, 2);
                    const fx = x + offset[0];
                    const fz = z + offset[2];
                    f.position.set(fx, getTerrainHeight(fx, fz), fz);
                    f.rotation.y = idx < 2 ? Math.PI / 2 : 0;
                    scene.add(f);
                });
            }
            
            for (let j = 0; j < 3; j++) {
                const human = createHumanFallback();
                const angle = Math.random() * Math.PI * 2;
                const distance = 4 + Math.random() * 2;
                const hX = x + Math.cos(angle) * distance;
                const hZ = z + Math.sin(angle) * distance;
                human.position.set(hX, getTerrainHeight(hX, hZ), hZ);
                scene.add(human);
                humans.push(human);
            }
        }
    }

    // Connect houses with paths perfectly hugging terrain
    for (let i = 0; i < housePositions.length; i++) {
        let nearestDist = Infinity;
        let nearestIdx = -1;
        for (let j = 0; j < housePositions.length; j++) {
            if (i === j) continue;
            const dx = housePositions[i].x - housePositions[j].x;
            const dz = housePositions[i].z - housePositions[j].z;
            const d = Math.sqrt(dx*dx + dz*dz);
            if (d < nearestDist) { nearestDist = d; nearestIdx = j; }
        }
        if (nearestIdx !== -1 && nearestDist < 120) {
            createPathBetween(housePositions[i], housePositions[nearestIdx]);
        }
    }

    // Dense forests, fewer dead trees
    for (let i = 0; i < NUM_TREES; i++) {
        if (!loadedModels.tree1) break;
        // 12:1 ratio of living trees to dead trees
        const keys = ['tree1', 'tree1', 'tree1', 'tree2', 'tree2', 'tree2', 'tree3', 'tree3', 'tree3', 'tree4', 'tree4', 'tree4', 'deadTree'];
        const treeKey = keys[Math.floor(Math.random() * keys.length)];
        const tree = loadedModels[treeKey].clone();
        const scale = 2 + Math.random() * 3;
        tree.scale.set(scale, scale, scale);
        let x, z, attempts = 0;
        do {
            x = (Math.random() - 0.5) * WORLD_SIZE;
            z = (Math.random() - 0.5) * WORLD_SIZE;
            attempts++;
        } while (attempts < 30 && (Math.sqrt(x*x + z*z) < 35 || checkCollision(x, z, 2))); 
        if (attempts < 30) {
            placedObjects.push({x, z, radius: 2});
            tree.position.set(x, getTerrainHeight(x, z), z);
            scene.add(tree);
        }
    }
}

async function initModelsAndSpawn() {
    const basePath = '/models/Ultimate Stylized Nature - May 2022/glTF/';
    const progressBar = document.getElementById('load-progress');
    const allKeys = Object.keys(assetNames);
    const totalSteps = allKeys.length + 2; // +2 for kenney fence and rock
    let loaded = 0;

    function updateProgress() {
        loaded++;
        if (progressBar) progressBar.style.width = Math.round((loaded / totalSteps) * 100) + '%';
    }

    try {
        const promises = Object.entries(assetNames).map(async ([key, filename]) => {
            const gltf = await loader.loadAsync(basePath + filename);
            const scene = gltf.scene;
            scene.traverse((child) => {
                if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
            });
            loadedModels[key] = scene;
            updateProgress();
        });
        await Promise.all(promises);

        // Load Kenney models separately
        const fencePath = '/models/kenney_nature-kit/Models/GLTF format/fence_simple.glb';
        const fenceGltf = await loader.loadAsync(fencePath);
        fenceGltf.scene.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
        loadedModels['fence'] = fenceGltf.scene;
        updateProgress();

        const rockPath = '/models/kenney_nature-kit/Models/GLTF format/rock_smallA.glb';
        const rockGltf = await loader.loadAsync(rockPath);
        rockGltf.scene.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
        loadedModels['smallRock'] = rockGltf.scene;
        updateProgress();

    } catch (e) {
        console.error("Failed to load models, using fallbacks", e);
    }
    
    spawnWorld();
    
    const spawnScatter = (modelKey, count, scaleMin, scaleMax, yOffset = 0) => {
        if (!loadedModels[modelKey]) return;
        for (let i = 0; i < count; i++) {
            const model = loadedModels[modelKey].clone();
            const scale = scaleMin + Math.random() * (scaleMax - scaleMin);
            model.scale.set(scale, scale, scale);
            const x = (Math.random() - 0.5) * WORLD_SIZE;
            const z = (Math.random() - 0.5) * WORLD_SIZE;
            if (Math.sqrt(x*x + z*z) > 35) {
                model.position.set(x, getTerrainHeight(x, z) + yOffset, z);
                model.rotation.y = Math.random() * Math.PI * 2;
                scene.add(model);
            }
        }
    };

    // Dense undergrowth to make it feel like a real forest
    spawnScatter('bush', 400, 1.5, 3.0);
    spawnScatter('bush2', 300, 1.5, 3.0);
    spawnScatter('grass', 2000, 1.0, 2.5);
    spawnScatter('flowerR', 200, 1.0, 2.0);
    spawnScatter('flowerY', 200, 1.0, 2.0);
    spawnScatter('flowerP', 200, 1.0, 2.0);

    // Hide Loading Screen
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 1200);
    }
}

initModelsAndSpawn();

window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // --- WASD / Arrow Key movement ---
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
    
    const time = Date.now() * 0.001;
    
    // Idle animation for humans
    humans.forEach((human, index) => {
        const baseHeight = getTerrainHeight(human.position.x, human.position.z);
        human.position.y = baseHeight + 0.7 + Math.sin(time * 2 + index) * 0.1;
    });

    renderer.render(scene, camera);
}
animate();
