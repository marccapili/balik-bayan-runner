import type { Scene } from '@babylonjs/core/scene';

/** Every playable screen implements this so the Game can swap them without leaks. */
export interface GameScene {
  readonly scene: Scene;
  /** Simulation step; dt in seconds, already clamped by the Game loop. */
  update(dt: number): void;
  dispose(): void;
}
