import { createEnvironment } from './scene.js';
import { createLandscape } from './terrain.js';
import { loadAndPopulateWorld } from './world.js';
import { startAnimation } from './animation.js';

export async function startApp() {
  const env = createEnvironment();
  createLandscape(env);
  await loadAndPopulateWorld(env);
  startAnimation(env);
  return env;
}
