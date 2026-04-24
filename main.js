import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const WORLD_SIZE = 600; 
const NUM_HOUSES = 25;
const NUM_TREES = 200;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); 
scene.fog = new THREE.FogExp2(0x87CEEB, 0.006);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 40, 90);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

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
    
    const points = [];
    points.push(new THREE.Vector3(p1.x, getTerrainHeight(p1.x, p1.z) + 0.2, p1.z));
    const mx = (p1.x + p2.x)/2 + (Math.random() - 0.5) * 10;
    const mz = (p1.z + p2.z)/2 + (Math.random() - 0.5) * 10;
    points.push(new THREE.Vector3(mx, getTerrainHeight(mx, mz) + 0.2, mz));
    points.push(new THREE.Vector3(p2.x, getTerrainHeight(p2.x, p2.z) + 0.2, p2.z));
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 20, 1.5, 8, false);
    geo.scale(1, 0.1, 1); 
    const mat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 1.0 }); 
    const path = new THREE.Mesh(geo, mat);
    path.receiveShadow = true;
    scene.add(path);

    if (loadedModels.smallRock) {
        for(let i=0; i<dist/5; i++) {
            const t = Math.random();
            const pt = curve.getPoint(t);
            const rock = loadedModels.smallRock.clone();
            const sc = 0.5 + Math.random();
            rock.scale.set(sc, sc, sc);
            rock.position.set(pt.x + (Math.random()-0.5)*5, getTerrainHeight(pt.x, pt.z)-0.2, pt.z + (Math.random()-0.5)*5);
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

    // Connect houses with paths
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
        if (nearestIdx !== -1 && nearestDist < 100) {
            createPathBetween(housePositions[i], housePositions[nearestIdx]);
        }
    }

    for (let i = 0; i < NUM_TREES; i++) {
        if (!loadedModels.tree1) break;
        const keys = ['tree1', 'tree2', 'tree3', 'tree4', 'deadTree'];
        const treeKey = keys[Math.floor(Math.random() * keys.length)];
        const tree = loadedModels[treeKey].clone();
        const scale = 2 + Math.random() * 3;
        tree.scale.set(scale, scale, scale);
        let x, z, attempts = 0;
        do {
            x = (Math.random() - 0.5) * WORLD_SIZE;
            z = (Math.random() - 0.5) * WORLD_SIZE;
            attempts++;
        } while (attempts < 50 && (Math.sqrt(x*x + z*z) < 35 || checkCollision(x, z, 4))); 
        if (attempts < 50) {
            placedObjects.push({x, z, radius: 4});
            tree.position.set(x, getTerrainHeight(x, z), z);
            scene.add(tree);
        }
    }
}

async function initModelsAndSpawn() {
    const basePath = '/models/Ultimate Stylized Nature - May 2022/glTF/';
    try {
        const promises = Object.entries(assetNames).map(async ([key, filename]) => {
            const gltf = await loader.loadAsync(basePath + filename);
            const scene = gltf.scene;
            scene.traverse((child) => {
                if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
            });
            loadedModels[key] = scene;
        });
        await Promise.all(promises);

        // Load Kenney models separately
        const fencePath = '/models/kenney_nature-kit/Models/GLTF format/fence_simple.glb';
        const fenceGltf = await loader.loadAsync(fencePath);
        fenceGltf.scene.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
        loadedModels['fence'] = fenceGltf.scene;

        const rockPath = '/models/kenney_nature-kit/Models/GLTF format/rock_smallA.glb';
        const rockGltf = await loader.loadAsync(rockPath);
        rockGltf.scene.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
        loadedModels['smallRock'] = rockGltf.scene;

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

    spawnScatter('bush', 150, 1.5, 3.0);
    spawnScatter('bush2', 100, 1.5, 3.0);
    spawnScatter('grass', 800, 1.0, 2.5);
    spawnScatter('flowerR', 80, 1.0, 2.0);
    spawnScatter('flowerY', 80, 1.0, 2.0);
    spawnScatter('flowerP', 80, 1.0, 2.0);
}

initModelsAndSpawn();

// --- Interactivity Setup ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const targetMarkerGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
targetMarkerGeo.rotateX(Math.PI);
const targetMarkerMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B });
const targetMarker = new THREE.Mesh(targetMarkerGeo, targetMarkerMat);
targetMarker.visible = false;
scene.add(targetMarker);

let movingHuman = null;
let targetPos = null;

window.addEventListener('click', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (terrainMesh) {
        const intersects = raycaster.intersectObject(terrainMesh);
        if (intersects.length > 0) {
            targetPos = intersects[0].point;
            targetMarker.position.copy(targetPos);
            targetMarker.position.y += 2;
            targetMarker.visible = true;
            
            let closestDist = Infinity;
            humans.forEach(h => {
                const d = h.position.distanceTo(targetPos);
                if (d < closestDist) {
                    closestDist = d;
                    movingHuman = h;
                }
            });
        }
    }
});

window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    const time = Date.now() * 0.001;
    
    if (movingHuman && targetPos) {
        const dir = new THREE.Vector3().subVectors(targetPos, movingHuman.position);
        dir.y = 0; 
        if (dir.length() > 0.5) {
            dir.normalize();
            movingHuman.position.addScaledVector(dir, 0.2); 
            movingHuman.rotation.y = Math.atan2(dir.x, dir.z);
        } else {
            targetMarker.visible = false; 
            movingHuman = null;
        }
    }

    humans.forEach((human, index) => {
        const baseHeight = getTerrainHeight(human.position.x, human.position.z);
        const isWalking = (human === movingHuman);
        const bobSpeed = isWalking ? 15 : 2;
        const bobHeight = isWalking ? 0.3 : 0.1;
        human.position.y = baseHeight + 0.7 + Math.sin(time * bobSpeed + index) * bobHeight;
    });
    
    if (targetMarker.visible) {
        targetMarker.position.y = targetPos.y + 2 + Math.sin(time * 5) * 0.2;
    }

    renderer.render(scene, camera);
}
animate();
