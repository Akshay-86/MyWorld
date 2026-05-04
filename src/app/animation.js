import * as THREE from 'three';
import { getTerrainHeight, updateDayNight } from './terrain.js';

export function startAnimation(env) {
  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const timeNow = performance.now();
    const dt = Math.min((timeNow - lastTime) / 1000, 0.1);
    lastTime = timeNow;

    const { now } = updateDayNight(env);
    const time = now.getTime() * 0.001;

    const moveSpeed = 1.5;
    const forward = new THREE.Vector3();
    env.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, env.camera.up).normalize();

    if (env.keysPressed.KeyW || env.keysPressed.ArrowUp) {
      env.controls.target.addScaledVector(forward, moveSpeed);
      env.camera.position.addScaledVector(forward, moveSpeed);
    }
    if (env.keysPressed.KeyS || env.keysPressed.ArrowDown) {
      env.controls.target.addScaledVector(forward, -moveSpeed);
      env.camera.position.addScaledVector(forward, -moveSpeed);
    }
    if (env.keysPressed.KeyA || env.keysPressed.ArrowLeft) {
      env.controls.target.addScaledVector(right, -moveSpeed);
      env.camera.position.addScaledVector(right, -moveSpeed);
    }
    if (env.keysPressed.KeyD || env.keysPressed.ArrowRight) {
      env.controls.target.addScaledVector(right, moveSpeed);
      env.camera.position.addScaledVector(right, moveSpeed);
    }

    // Clamp camera and target to world bounds
    if (env.worldBounds) {
      const b = env.worldBounds;
      const clampX = (x) => Math.max(b.minX + b.buffer, Math.min(b.maxX - b.buffer, x));
      const clampZ = (z) => Math.max(b.minZ + b.buffer, Math.min(b.maxZ - b.buffer, z));
      env.camera.position.x = clampX(env.camera.position.x);
      env.camera.position.z = clampZ(env.camera.position.z);
      env.controls.target.x = clampX(env.controls.target.x);
      env.controls.target.z = clampZ(env.controls.target.z);
    }

    env.controls.update();

    if (env.instancedHumans && env.humanData) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < env.humanData.length; i++) {
        const data = env.humanData[i];
        const height = getTerrainHeight(data.x, data.z);
        dummy.position.set(data.x, height + Math.sin(time * 2 + i) * 0.1, data.z);
        dummy.rotation.set(0, data.rotY, 0);
        dummy.scale.set(data.scale, data.scale, data.scale);
        dummy.translateY(0.7); // apply vertical offset in local space
        dummy.updateMatrix();
        env.instancedHumans.setMatrixAt(i, dummy.matrix);
      }
      env.instancedHumans.instanceMatrix.needsUpdate = true;
    }

    env.waterMeshes.forEach((water) => {
      const position = water.geometry.attributes.position;
      const timeOffset = time * 2;

      for (let i = 0; i < position.count; i++) {
        const px = position.getX(i) + water.position.x;
        const pz = position.getZ(i) + water.position.z;
        const wave = Math.sin(px * 0.4 + timeOffset) * 0.15 + Math.cos(pz * 0.4 + timeOffset * 0.8) * 0.15;
        if (water.geometry.type === 'CircleGeometry' || water.geometry.type === 'BufferGeometry') {
          position.setY(i, position.getY(i) + wave * 0.1);
        }
      }
      position.needsUpdate = true;
    });

    // Waterfall particles removed: no per-frame update necessary.

    env.renderer.render(env.scene, env.camera);
  }

  animate();
}
