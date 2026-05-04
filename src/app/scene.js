import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FOG_COLOR_DAY, SKY_COLOR_DAY } from './config.js';

export function createEnvironment() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR_DAY);
  scene.fog = new THREE.FogExp2(FOG_COLOR_DAY, 0.006);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 30, 60);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 3;
  controls.maxDistance = 500;
  controls.zoomSpeed = 2.0;
  controls.screenSpacePanning = true;

  const ambientLight = new THREE.AmbientLight(0xf4f8ff, 0.52);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xfff1d6, 0.68);
  dirLight.position.set(100, 200, 100);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 3000;
  dirLight.shadow.camera.left = -500;
  dirLight.shadow.camera.right = 500;
  dirLight.shadow.camera.top = 500;
  dirLight.shadow.camera.bottom = -500;
  scene.add(dirLight);

  const moonLight = new THREE.DirectionalLight(0x88bbff, 0.0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.width = 2048;
  moonLight.shadow.mapSize.height = 2048;
  moonLight.shadow.camera.near = 0.5;
  moonLight.shadow.camera.far = 3000;
  moonLight.shadow.camera.left = -500;
  moonLight.shadow.camera.right = 500;
  moonLight.shadow.camera.top = 500;
  moonLight.shadow.camera.bottom = -500;
  scene.add(moonLight);

  const sunGeo = new THREE.SphereGeometry(60, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee, fog: false });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);

  const moonGeo = new THREE.SphereGeometry(40, 32, 32);
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xe0e0ff, fog: false });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  scene.add(moonMesh);

  const env = {
    scene,
    camera,
    renderer,
    controls,
    ambientLight,
    dirLight,
    moonLight,
    sunMesh,
    moonMesh,
    keysPressed: {},
    terrainMesh: null,
    loadedModels: {},
    waterMeshes: [],
    humans: [],
    humanData: [],
    instancedHumans: null,
    housePositions: [],
    placedObjects: [],
    fenceTransforms: [],
    roadRockTransforms: [],
    ponds: [],
    riverEndPos: new THREE.Vector3(164, 34.8, -20),
    waterMaterial: null,
    worldBounds: null,
  };

  const zoomRaycaster = new THREE.Raycaster();
  renderer.domElement.addEventListener('wheel', () => {
    requestAnimationFrame(() => {
      if (!env.terrainMesh) return;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      zoomRaycaster.set(camera.position, dir);
      const hits = zoomRaycaster.intersectObject(env.terrainMesh);
      if (hits.length > 0) controls.target.copy(hits[0].point);
    });
  });

  window.addEventListener('keydown', (event) => { env.keysPressed[event.code] = true; });
  window.addEventListener('keyup', (event) => { env.keysPressed[event.code] = false; });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return env;
}
