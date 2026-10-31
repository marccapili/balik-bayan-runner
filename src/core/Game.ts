import { Engine } from '@babylonjs/core/Engines/engine';
import { Sfx, type SfxName } from '../audio/Sfx';
import { InputManager } from '../controls/InputManager';
import { RENDER_CONFIG } from '../data/config';
import { FEEDBACK } from '../data/gameplay';
import { ABILITIES } from '../data/abilities';
import { ENEMY_INTRO, type EnemyKind } from '../data/enemies';
import { HEROES, type HeroId } from '../data/heroes';
import { describe } from '../gameplay/Missions';
import type { IntroEvent } from '../gameplay/IntroSequence';
import type { RunEvent } from '../gameplay/SurvivalRun';
import { LobbyScene } from '../scenes/LobbyScene';
import { MuseumScene } from '../scenes/MuseumScene';
import { Hud } from '../ui/Hud';
import { Lobby } from '../ui/Lobby';
import { Transition } from '../ui/Transition';
import { SaveManager } from './SaveManager';
import { GAME_TRANSITIONS, StateMachine, type GameState } from './StateMachine';

/** Sound played when each kind of enemy joins the run. */
const JOIN_SOUND: Record<EnemyKind, SfxName> = { guard: 'alert', dog: 'bark', multo: 'whoo', tikbalang: 'neigh' };

/** Owns the engine, the render loop, both scenes and the top-level state machine. */
export class Game {
  readonly engine: Engine;
  readonly fsm = new StateMachine<GameState>('boot', GAME_TRANSITIONS);
  readonly input: InputManager;
  private museum: MuseumScene | null = null;
  private lobbyScene: LobbyScene | null = null;
  private hud: Hud | null = null;
  private lobby: Lobby | null = null;
  private transition: Transition | null = null;
  readonly save = new SaveManager();
  readonly sfx = new Sfx();
  /** Total simulated (unpaused) time across runs — used by tests. */
  simTime = 0;
  /** Ability events handled (tests check each use plays its sound/effect once). */
  private abilityEvents = 0;
  /** Real seconds left in the knocked-down beat before results appear. */
  private defeatLeft = 0;
  /** Set by the TAP TO DROP button; consumed by the intro. */
  private dropRequested = false;
  private switching = false;
  /** Set while in training: the hero being tried (may be locked). */
  private trainingHero: HeroId | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, false);
    this.applyPixelRatio();
    this.input = new InputManager(document.getElementById('touch-zone')!);
    this.sfx.setMuted(this.save.data.settings.muted);

    window.addEventListener('resize', () => {
      this.applyPixelRatio();
      this.engine.resize();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.fsm.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat && !(e.target instanceof HTMLInputElement)) this.hud?.toggleFps();
    });
  }

  private applyPixelRatio(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, RENDER_CONFIG.maxPixelRatio);
    this.engine.setHardwareScalingLevel(1 / dpr);
  }

  get heroId(): HeroId {
    return this.trainingHero ?? this.save.data.selectedHero;
  }

  /** Boot: build both scenes, then open on the lobby. */
  async start(onProgress: (p: number, label: string) => void): Promise<void> {
    onProgress(0.15, 'Binubuksan ang museo…');
    await nextFrame();
    this.museum = new MuseumScene(this.engine, this.input, this.heroId);
    onProgress(0.55, 'Ginigising ang mga bayani…');
    await this.museum.scene.whenReadyAsync();
    this.lobbyScene = new LobbyScene(this.engine, this.canvas);
    this.lobbyScene.setHero(this.heroId, this.save.skinOf(this.heroId));
    onProgress(0.85, 'Inaayos ang lobby…');
    await this.lobbyScene.scene.whenReadyAsync();
    onProgress(1, 'Game na!');

    this.hud = new Hud(this.uiRoot, {
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onReplay: () => this.restart(),
      onLobby: () => void this.toLobby(),
      onDrop: () => {
        this.dropRequested = true;
      },
      onAbility: () => this.input.press('ability'),
      onToggleMute: () => this.toggleMute(),
    });
    this.lobby = new Lobby(this.uiRoot, this.save, {
      onPlay: () => void this.play(),
      onTrain: (id) => void this.train(id),
      onPreview: (id, skin) => this.lobbyScene?.setHero(id, skin ?? this.save.skinOf(id)),
      onPurchase: (kind) => this.sfx.play(kind === 'claim' ? 'claim' : 'unlock'),
      onUnlock: (id) => {
        const r = this.save.unlockHero(id);
        if (r === 'ok') this.sfx.play('unlock');
        return r;
      },
      onToggleMute: () => this.toggleMute(),
      onToggleReduced: () => {
        this.save.data.settings.reducedEffects = !this.save.data.settings.reducedEffects;
        this.save.save();
        this.applySettings();
      },
      onReset: () => {
        this.save.reset();
        this.applySettings();
        this.lobbyScene?.setHero(this.heroId, this.save.skinOf(this.heroId));
      },
      onClick: () => this.sfx.play('click'),
    });
    this.transition = new Transition(this.uiRoot);
    this.applySettings();
    this.museum.onRoomChange = (r) => {
      // Training stays in one hall and has its own tag; skip the gallery banner there.
      if (!this.trainingHero) this.hud?.showRoom(`📍 ${r.sign}`, r.subtitle);
    };
    this.museum.onEvent = (e) => this.onRunEvent(e);
    const q = new URLSearchParams(location.search);
    if (q.has('peaceful')) this.museum.run.peaceful = true;

    this.fsm.transition('lobby');
    this.showLobby();
    this.engine.runRenderLoop(() => this.frame());
    // Test/dev shortcut: jump straight into a run (no lobby, no cinematic).
    if (q.has('play')) this.quickStart();
  }

  private applySettings(): void {
    const s = this.save.data.settings;
    this.sfx.setMuted(s.muted);
    this.hud?.setMuted(s.muted);
    if (this.museum) this.museum.reducedEffects = s.reducedEffects;
    document.body.classList.toggle('reduced-fx', s.reducedEffects);
  }

  private showLobby(): void {
    document.body.dataset.mode = 'lobby';
    this.hud?.setMode('off');
    this.lobby?.setVisible(true);
    if (this.lobbyScene) {
      this.lobbyScene.active = true;
      this.lobbyScene.setHero(this.heroId, this.save.skinOf(this.heroId));
    }
  }

  private showMuseum(): void {
    document.body.dataset.mode = 'museum';
    this.lobby?.setVisible(false);
    if (this.lobbyScene) this.lobbyScene.active = false;
    const id = this.heroId;
    this.museum?.setHero(id, this.save.skinOf(id));
    const h = HEROES[id];
    this.hud?.setAbility(ABILITIES[h.abilityKind].icon, h.ability);
  }

  /** PLAY: lobby slides out → portal wipe → museum reveal with the hero hovering. */
  async play(): Promise<void> {
    if (this.switching || this.fsm.state !== 'lobby' || !this.museum) return;
    this.switching = true;
    this.sfx.play('portal');
    this.lobby?.playOut();
    await this.transition?.cover();
    this.showMuseum();
    this.beginIntro();
    await this.transition?.reveal();
    this.switching = false;
  }

  /** Training: lobby → portal wipe → Hall of Heroes with the previewed hero (owned or not). */
  async train(id: HeroId): Promise<void> {
    if (this.switching || this.fsm.state !== 'lobby' || !this.museum) return;
    this.switching = true;
    this.sfx.play('portal');
    this.lobby?.playOut();
    await this.transition?.cover();
    this.trainingHero = id;
    this.showMuseum();
    this.beginTraining();
    await this.transition?.reveal();
    this.switching = false;
  }

  private beginTraining(): void {
    if (!this.museum || !this.trainingHero) return;
    this.input.releaseAll();
    this.hud?.hideResults();
    this.hud?.setPaused(false);
    this.museum.startTraining();
    if (this.fsm.state === 'lobby') this.fsm.transition('intro');
    if (this.fsm.state === 'intro' || this.fsm.state === 'paused') this.fsm.transition('playing');
    this.hud?.setMode('training', HEROES[this.trainingHero].name);
    this.pushStats();
  }

  private beginIntro(): void {
    if (!this.museum || !this.fsm.transition('intro')) return;
    this.input.releaseAll();
    this.dropRequested = false;
    this.defeatLeft = 0;
    this.hud?.hideResults();
    this.hud?.setPaused(false);
    this.hud?.setMode('intro');
    this.museum.startIntro();
    this.pushStats();
  }

  /** Skip lobby + cinematic (used by automated movement tests via ?play). */
  quickStart(): void {
    if (!this.museum) return;
    this.showMuseum();
    this.museum.resetRun();
    this.hud?.setMode('play');
    if (this.fsm.state === 'lobby') this.fsm.transition('intro');
    this.fsm.transition('playing');
    this.pushStats();
  }

  /** Results / pause → portal wipe → lobby. */
  async toLobby(): Promise<void> {
    if (this.switching || !this.fsm.can('lobby')) return;
    this.switching = true;
    this.input.releaseAll();
    await this.transition?.cover();
    this.fsm.transition('lobby');
    this.defeatLeft = 0;
    this.hud?.hideResults();
    this.hud?.setPaused(false);
    this.trainingHero = null;
    this.museum?.resetRun();
    this.showLobby();
    await this.transition?.reveal();
    this.switching = false;
  }

  private frame(): void {
    // Clamp dt so a tab switch or GC hitch never teleports the hero through a wall.
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 1 / 20);
    const state = this.fsm.state;
    if (this.input.consume('pause')) {
      if (state === 'playing') this.pause();
      else if (state === 'paused') this.resume();
      else if (state === 'lobby') this.lobby?.closePanel();
    }
    if (state === 'lobby') {
      this.lobbyScene?.update(dt);
    } else if (state === 'intro' && this.museum) {
      const mv = this.input.move;
      const drop = this.dropRequested || this.input.consume('confirm') || this.input.consume('ability') || Math.hypot(mv.x, mv.z) > 0.5;
      this.dropRequested = false;
      for (const e of this.museum.updateIntro(dt, drop)) this.onIntroEvent(e);
    } else if (state === 'playing' && this.museum) {
      if (this.input.consume('ability') && !this.museum.useAbility()) {
        this.sfx.play('denied');
        this.hud?.abilityDenied();
      }
      this.simTime += dt;
      this.museum.update(dt);
      this.pushStats();
    } else if (state === 'gameover' && this.museum && this.defeatLeft > 0) {
      // Slow-mo knockout beat, then the results panel.
      this.museum.updateDefeated(dt * FEEDBACK.gameOverTimeScale);
      this.defeatLeft -= dt;
      if (this.defeatLeft <= 0) this.showResults();
    }
    this.hud?.tickFps(dt);
    if (state === 'lobby' || state === 'boot') this.lobbyScene?.scene.render();
    else this.museum?.scene.render();
  }

  private onIntroEvent(e: IntroEvent): void {
    switch (e) {
      case 'awaitDrop':
        this.hud?.showDrop(true);
        break;
      case 'drop':
        this.hud?.showDrop(false);
        this.sfx.play('drop');
        break;
      case 'landed':
        this.sfx.play('land');
        break;
      case 'guardAlert':
        this.sfx.play('alert');
        break;
      case 'chase':
        if (this.fsm.transition('playing')) {
          this.hud?.setMode('play');
          this.pushStats();
        }
        break;
      default:
        break;
    }
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

  /** New run from scratch (pause-menu restart and results replay): straight back into the cinematic. */
  restart(): void {
    if (this.switching || !this.museum) return;
    if (this.trainingHero) {
      this.beginTraining();
      return;
    }
    if (this.fsm.state === 'playing') {
      // Dev/test path: restart without the intro while already running.
      this.museum.resetRun();
      this.pushStats();
      return;
    }
    this.beginIntro();
  }

  toggleMute(): void {
    this.save.data.settings.muted = !this.save.data.settings.muted;
    this.save.save();
    this.applySettings();
    this.sfx.play('click');
  }

  private pushStats(): void {
    const run = this.museum?.run;
    if (!run || !this.hud) return;
    this.hud.setStats({ hearts: run.health.hearts, score: run.score.score, coins: run.score.runCoins, time: run.score.time, multiplier: run.score.multiplier });
    const ab = run.ability;
    this.hud.setAbilityState(ab.cooldownFrac, ab.active || run.shielded, ab.cooldownLeft);
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
      case 'ability': {
        this.abilityEvents++;
        this.sfx.play(e.kind);
        if (e.kind === 'shockwave' && e.affected > 0) {
          const p = m.toScreen(e.pos, 2.4);
          hud?.floatText(p.x, p.y, e.affected > 1 ? `${e.affected} kalaban stunned!` : 'Stunned!', 'bonus');
        }
        break;
      }
      case 'blocked': {
        this.sfx.play('block');
        const p = m.toScreen(e.pos, 2.2);
        hud?.floatText(p.x, p.y, 'Blocked! 🛡️', 'bonus');
        break;
      }
      case 'guardJoined': {
        if (e.guard === 0) break;
        const intro = ENEMY_INTRO[e.kind];
        hud?.showRoom(intro.title, intro.subtitle);
        this.sfx.play(JOIN_SOUND[e.kind]);
        break;
      }
      case 'windup':
        this.sfx.play(e.kind === 'dog' ? 'growl' : 'neigh');
        break;
      case 'bonk': {
        this.sfx.play('thump');
        const p = m.toScreen(e.pos, 3);
        hud?.floatText(p.x, p.y, 'BONK! 💫', 'bonus');
        break;
      }
      case 'illusion':
      case 'decoyPop':
        this.sfx.play('poof');
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
    const s = run.score;
    const rec = this.save.recordRun(
      { score: s.score, time: s.time, runCoins: s.runCoins, coinsPicked: s.coinsPicked, bestMultiplier: s.bestMultiplier, abilityUses: run.ability.uses },
      this.heroId,
    );
    this.hud?.showResults({
      score: run.score.score,
      time: run.score.time,
      coins: run.score.runCoins,
      bestScore: this.save.data.bestScore,
      newBest: rec.newBest,
      wallet: this.save.data.coins,
      missions: rec.completedMissions.map(describe),
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
    spawnEnemy: (kind, x, z) => {
      const m = this.museum;
      if (!m) return;
      m.run.spawnEnemy(kind, m.player.position, x !== undefined && z !== undefined ? { x, z } : undefined);
    },
    setInvulnerable: (seconds) => {
      this.museum?.run.health.grantInvuln(seconds);
    },
    setPeaceful: (p) => {
      if (this.museum) this.museum.run.peaceful = p;
    },
    addCoins: (n) => {
      this.save.data.coins += Math.max(0, Math.floor(n));
      this.save.save();
      this.lobby?.refresh();
    },
    addHiyas: (n) => {
      this.save.data.diamonds += Math.max(0, Math.floor(n));
      this.save.save();
      this.lobby?.refresh();
    },
    finishMissions: () => {
      for (const m of this.save.data.missions) m.progress = m.target;
      this.save.save();
      this.lobby?.refresh();
    },
  };

  /** Selects an owned hero (used by tools/tests; the lobby UI goes through the same save call). */
  setHero(id: HeroId): void {
    if (!this.save.selectHero(id)) return;
    this.museum?.setHero(id, this.save.skinOf(id));
    this.lobbyScene?.setHero(id, this.save.skinOf(id));
    this.lobby?.refresh();
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
      guards: run?.guards.map((g) => ({ kind: g.kind, x: g.pos.x, z: g.pos.z, state: g.state, hunting: g.hunting, canHurt: g.canHurt })),
      decoys: run?.decoys.map((d) => ({ x: d.pos.x, z: d.pos.z, ttl: d.ttl })),
      ability: run && { kind: run.ability.kind, ready: run.ability.ready, active: run.ability.active, uses: run.ability.uses, cooldownLeft: run.ability.cooldownLeft },
      shielded: run?.shielded ?? false,
      speedMultiplier: p?.motor.speedMultiplier,
      skin: this.save.skinOf(this.heroId),
      coins: run?.pickups.items.filter((i) => i.active).map((i) => ({ kind: i.kind, x: i.pos.x, z: i.pos.z })),
      results: this.hud?.resultsVisible ?? false,
      training: this.museum?.training ?? false,
      dummies: this.museum?.run.dummies.map((d) => ({ x: d.pos.x, z: d.pos.z, stun: d.stun })),
      introPhase: this.museum?.introPhase ?? null,
      dropPrompt: this.hud?.dropVisible ?? false,
      lobbyPanel: this.lobby?.openPanelName ?? null,
      previewHero: this.lobby?.previewHero,
      save: { ...this.save.data },
      state: this.fsm.state,
      hero: this.heroId,
      x: p?.position.x,
      z: p?.position.z,
      speed: p?.motor.speed,
      simTime: this.simTime,
      abilityEvents: this.abilityEvents,
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
  /** Drops an enemy into the run now (hunting); at (x, z) if given. */
  spawnEnemy(kind: EnemyKind, x?: number, z?: number): void;
  /** Hero can't be hurt for `seconds` (lets tests watch enemies up close). */
  setInvulnerable(seconds: number): void;
  setPeaceful(p: boolean): void;
  addCoins(n: number): void;
  addHiyas(n: number): void;
  finishMissions(): void;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
