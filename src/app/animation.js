import * as THREE from 'three';
import { getTerrainHeight, updateDayNight } from './terrain.js';

export function startAnimation(env) {
  function animate() {
    requestAnimationFrame(animate);

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

    env.controls.update();

    env.humans.forEach((human, index) => {
      const height = getTerrainHeight(human.position.x, human.position.z);
      human.position.y = height + 0.7 + Math.sin(time * 2 + index) * 0.1;
    });

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
