import { Engine } from '@babylonjs/core/Engines/engine';
import { Sfx } from '../audio/Sfx';
import { InputManager } from '../controls/InputManager';
import { RENDER_CONFIG } from '../data/config';
import { FEEDBACK } from '../data/gameplay';
import { HERO_ORDER, type HeroId } from '../data/heroes';
import type { RunEvent } from '../gameplay/SurvivalRun';
import { MuseumScene } from '../scenes/MuseumScene';
import { Hud } from '../ui/Hud';
import { SaveManager } from './SaveManager';
import { GAME_TRANSITIONS, StateMachine, type GameState } from './StateMachine';

/** Owns the engine, the render loop, the active scene and the top-level state machine. */
export class Game {
  readonly engine: Engine;
  readonly fsm = new StateMachine<GameState>('boot', GAME_TRANSITIONS);
  readonly input: InputManager;
  private museum: MuseumScene | null = null;
  private hud: Hud | null = null;
  private heroId: HeroId = 'rizal';
  readonly save = new SaveManager();
  readonly sfx = new Sfx();
  /** Total simulated (unpaused) time across runs — used by tests. */
  simTime = 0;
  /** Real seconds left in the knocked-down beat before results appear. */
  private defeatLeft = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, false);
    this.applyPixelRatio();
    this.input = new InputManager(document.getElementById('touch-zone')!);
    this.sfx.setMuted(this.save.data.muted);

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
      onReplay: () => this.restart(),
      onToggleMute: () => this.toggleMute(),
      onNextHero: () => this.setHero(HERO_ORDER[(HERO_ORDER.indexOf(this.heroId) + 1) % HERO_ORDER.length]!),
    });
    this.hud.setHero(this.heroId);
    this.hud.setMuted(this.sfx.muted);
    this.museum.onRoomChange = (r) => this.hud?.showRoom(`📍 ${r.sign}`, r.subtitle);
    this.museum.onEvent = (e) => this.onRunEvent(e);
    if (new URLSearchParams(location.search).has('peaceful')) this.museum.run.peaceful = true;

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
      this.pushStats();
    } else if (this.fsm.state === 'gameover' && this.museum && this.defeatLeft > 0) {
      // Slow-mo knockout beat, then the results panel.
      this.museum.updateDefeated(dt * FEEDBACK.gameOverTimeScale);
      this.defeatLeft -= dt;
      if (this.defeatLeft <= 0) this.showResults();
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

  /** New run from scratch (pause-menu restart and results replay). */
  restart(): void {
    if (!this.museum) return;
    this.museum.resetRun();
    this.defeatLeft = 0;
    this.input.releaseAll();
    this.hud?.hideResults();
    this.hud?.setPaused(false);
    this.fsm.transition('playing');
    this.pushStats();
  }

  toggleMute(): void {
    this.sfx.setMuted(!this.sfx.muted);
    this.save.data.muted = this.sfx.muted;
    this.save.save();
    this.hud?.setMuted(this.sfx.muted);
    this.sfx.play('click');
  }

  private pushStats(): void {
    const run = this.museum?.run;
    if (!run || !this.hud) return;
    this.hud.setStats({ hearts: run.health.hearts, score: run.score.score, coins: run.score.runCoins, time: run.score.time, multiplier: run.score.multiplier });
  }

  private onRunEvent(e: RunEvent): void {
    const m = this.museum!;
    const hud = this.hud;
    switch (e.type) {
      case 'pickup': {
        const p = m.toScreen(e.pos, 1.2);
        if (e.kind === 'heart') {
          this.sfx.play('heart');
          hud?.floatText(p.x, p.y, '+1 ❤', 'heart');
        } else {
          this.sfx.play(e.kind === 'rareCoin' ? 'rare' : 'coin');
          hud?.floatText(p.x, p.y, `+${e.points}`, e.kind === 'rareCoin' ? 'rare' : 'coin');
        }
        break;
      }
      case 'hit':
        this.sfx.play('hit');
        hud?.flashHurt();
        break;
      case 'alert':
        this.sfx.play('alert');
        break;
      case 'guardJoined':
        if (e.guard > 0) hud?.showRoom('👮 May bagong guard!', 'Dumami sila, bilisan mo pa');
        break;
      case 'bonus': {
        this.sfx.play('bonus');
        const p = m.toScreen(m.player.position, 2.4);
        hud?.floatText(p.x, p.y, `+${e.points} survive bonus`, 'bonus');
        break;
      }
      case 'dead':
        this.pushStats();
        this.input.releaseAll();
        this.fsm.transition('gameover');
        this.defeatLeft = FEEDBACK.gameOverDelay;
        this.sfx.play('gameover');
        break;
    }
  }

  private showResults(): void {
    const run = this.museum?.run;
    if (!run) return;
    const newBest = this.save.recordRun(run.score.score, run.score.time, run.score.runCoins);
    this.hud?.showResults({
      score: run.score.score,
      time: run.score.time,
      coins: run.score.runCoins,
      bestScore: this.save.data.bestScore,
      newBest,
      wallet: this.save.data.coins,
    });
  }

  readonly debug: DebugHooks = {
    teleport: (x, z) => {
      const m = this.museum?.player.motor;
      if (m) m.state.pos = { x, z };
    },
    moveGuard: (i, x, z) => {
      const g = this.museum?.run.guards[i];
      if (g) g.pos = { x, z };
    },
    setPeaceful: (p) => {
      if (this.museum) this.museum.run.peaceful = p;
    },
  };

  setHero(id: HeroId): void {
    this.heroId = id;
    this.museum?.player.setHero(id);
    this.hud?.setHero(id);
  }

  /** Read-only snapshot for automated browser tests. */
  debugSnapshot(): Record<string, unknown> {
    const p = this.museum?.player;
    const run = this.museum?.run;
    return {
      hearts: run?.health.hearts,
      invulnerable: run?.health.invulnerable,
      score: run?.score.score,
      runCoins: run?.score.runCoins,
      runTime: run?.score.time,
      guards: run?.guards.map((g) => ({ x: g.pos.x, z: g.pos.z, state: g.state })),
      coins: run?.pickups.items.filter((i) => i.active).map((i) => ({ kind: i.kind, x: i.pos.x, z: i.pos.z })),
      results: this.hud?.resultsVisible ?? false,
      save: { ...this.save.data },
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

/** Test hooks (only used by the e2e smoke test; harmless in normal play). */
export interface DebugHooks {
  teleport(x: number, z: number): void;
  moveGuard(i: number, x: number, z: number): void;
  setPeaceful(p: boolean): void;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
