import { Engine } from '@babylonjs/core/Engines/engine';
import { InputManager } from '../controls/InputManager';
import { RENDER_CONFIG } from '../data/config';
import { HERO_ORDER, type HeroId } from '../data/heroes';
import { SPAWN_POINT } from '../data/museumLayout';
import { MuseumScene } from '../scenes/MuseumScene';
import { Hud } from '../ui/Hud';
import { GAME_TRANSITIONS, StateMachine, type GameState } from './StateMachine';

/** Owns the engine, the render loop, the active scene and the top-level state machine. */
export class Game {
  readonly engine: Engine;
  readonly fsm = new StateMachine<GameState>('boot', GAME_TRANSITIONS);
  readonly input: InputManager;
  private museum: MuseumScene | null = null;
  private hud: Hud | null = null;
  private heroId: HeroId = 'rizal';
  /** Total simulated (unpaused) time — used by tests and later by the survival timer. */
  simTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, false);
    this.applyPixelRatio();
    this.input = new InputManager(document.getElementById('touch-zone')!);

    window.addEventListener('resize', () => {
      this.applyPixelRatio();
      this.engine.resize();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.fsm.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat) this.hud?.toggleFps();
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (n >= 0 && this.fsm.state === 'playing') this.setHero(HERO_ORDER[n]!);
    });
  }

  private applyPixelRatio(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, RENDER_CONFIG.maxPixelRatio);
    this.engine.setHardwareScalingLevel(1 / dpr);
  }

  /** Boot → build the museum → start playing (lobby & intro arrive in Milestone 3). */
  async start(onProgress: (p: number, label: string) => void): Promise<void> {
    onProgress(0.2, 'Binubuksan ang museo…');
    await nextFrame();
    this.museum = new MuseumScene(this.engine, this.input, this.heroId);
    onProgress(0.7, 'Ginigising ang mga bayani…');
    await this.museum.scene.whenReadyAsync();
    onProgress(1, 'Game na!');

    this.hud = new Hud(this.uiRoot, {
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onNextHero: () => this.setHero(HERO_ORDER[(HERO_ORDER.indexOf(this.heroId) + 1) % HERO_ORDER.length]!),
    });
    this.hud.setHero(this.heroId);
    this.museum.onRoomChange = (r) => this.hud?.showRoom(r.sign, r.subtitle);

    this.fsm.transition('playing');
    this.engine.runRenderLoop(() => this.frame());
  }

  private frame(): void {
    // Clamp dt so a tab switch or GC hitch never teleports the hero through a wall.
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 1 / 20);
    if (this.input.consume('pause')) {
      if (this.fsm.state === 'playing') this.pause();
      else if (this.fsm.state === 'paused') this.resume();
    }
    if (this.fsm.state === 'playing' && this.museum) {
      this.simTime += dt;
      this.museum.update(dt);
    }
    this.hud?.tickFps(dt);
    this.museum?.scene.render();
  }

  pause(): void {
    if (this.fsm.transition('paused')) {
      this.input.releaseAll();
      this.hud?.setPaused(true);
    }
  }

  resume(): void {
    if (this.fsm.transition('playing')) this.hud?.setPaused(false);
  }

  restart(): void {
    this.museum?.player.motor.reset(SPAWN_POINT);
    this.resume();
  }

  setHero(id: HeroId): void {
    this.heroId = id;
    this.museum?.player.setHero(id);
    this.hud?.setHero(id);
  }

  /** Read-only snapshot for automated browser tests. */
  debugSnapshot(): Record<string, unknown> {
    const p = this.museum?.player;
    return {
      state: this.fsm.state,
      hero: this.heroId,
      x: p?.position.x,
      z: p?.position.z,
      speed: p?.motor.speed,
      simTime: this.simTime,
      fps: this.engine.getFps(),
      drawCalls: (this.engine as unknown as { _drawCalls?: { current: number } })._drawCalls?.current,
      meshes: this.museum?.scene.meshes.length,
    };
  }
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
