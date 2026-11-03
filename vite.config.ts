import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets support GitHub project Pages and custom domains alike.
  base: './',
  // The retained physics smoke scene is loaded on demand, outside the ocean entry.
  // Prebundle its dependencies so its first import cannot reload a running test.
  optimizeDeps: {
    include: [
      '@babylonjs/havok',
      '@babylonjs/core/Physics/v2/Plugins/havokPlugin',
      '@babylonjs/core/Physics/v2/physicsAggregate',
      '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin',
      '@babylonjs/core/Physics/v2/physicsEngineComponent',
    ],
  },
});
