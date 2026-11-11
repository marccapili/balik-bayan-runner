import { preloadHeroModels } from '../characters/HeroGlb';
import { GADGET_INFO, type GadgetKind } from '../data/gadgets';
import { MUSIC } from '../data/audio';
import { LORE, LORE_VIDEO } from '../data/lore';
import { HERO_CLIP, HERO_CLIPS, heroClipSources } from '../data/heroClips';
import { ClipPlayer } from '../ui/ClipPlayer';
import { LoreTimeline, type LoreEvent } from '../gameplay/LoreTimeline';
import type { LorePlayer } from '../ui/LorePlayer';
import { OBJECTIVE, TIPS, TIP_LOCKED_SUFFIX } from '../data/tutorial';
import { Tutorial } from '../gameplay/Tutorial';
import { Music } from '../audio/Music';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Sfx, type SfxName } from '../audio/Sfx';
import { InputManager } from '../controls/InputManager';
import { RENDER_CONFIG } from '../data/config';
import { FEEDBACK } from '../data/gameplay';
import { ABILITIES } from '../data/abilities';
import { ENEMY_INTRO, type EnemyKind } from '../data/enemies';
import { EXHIBIT_BY_ID, EXHIBIT_CONFIG, type Exhibit } from '../data/exhibits';
import { HEROES, type HeroId } from '../data/heroes';
import { MINIGAME } from '../data/minigames';
import { HERO_LEVEL } from '../data/progression';
import { describe } from '../gameplay/Missions';
import { describeDaily, heroPerks } from '../gameplay/Progression';
import type { ExhibitPayout } from '../gameplay/SurvivalRun';
import { MiniGameHost, type MiniSound } from '../ui/MiniGameHost';
import type { PromptMode } from '../ui/Hud';
import type { IntroEvent } from '../gameplay/IntroSequence';
import type { RunEvent } from '../gameplay/SurvivalRun';
import { LobbyScene } from '../scenes/LobbyScene';
import type { GalleryScene } from '../scenes/GalleryScene';
import type { GalleryUi } from '../ui/GalleryUi';
import { MuseumScene } from '../scenes/MuseumScene';
import { Hud } from '../ui/Hud';
import { Lobby } from '../ui/Lobby';
import { Transition } from '../ui/Transition';
import { SaveManager } from './SaveManager';
import { GAME_TRANSITIONS, StateMachine, type GameState } from './StateMachine';

/** Sound played when each kind of enemy joins the run. */
const JOIN_SOUND: Record<EnemyKind, SfxName> = { guard: 'alert', dog: 'bark', multo: 'whoo', tikbalang: 'neigh' };
const MINI_SOUND: Record<MiniSound, SfxName> = { click: 'click', good: 'coin', bad: 'denied', win: 'unlock' };
/** The cutscene overlay lives in its own chunk; started during loading so it is ready on the first tap. */
const loadLore = (): Promise<typeof import('../ui/LorePlayer')> => import('../ui/LorePlayer');
/** The Future Heroes Gallery (room + viewers) is its own chunk, loaded on the first visit. */
const loadGallery = (): Promise<[typeof import('../scenes/GalleryScene'), typeof import('../ui/GalleryUi')]> =>
  Promise.all([import('../scenes/GalleryScene'), import('../ui/GalleryUi')]);

/** Owns the engine, the render loop, both scenes and the top-level state machine. */
export class Game {
  readonly engine: Engine;
  readonly fsm = new StateMachine<GameState>('boot', GAME_TRANSITIONS);
  readonly input: InputManager;
  private museum: MuseumScene | null = null;
  private lobbyScene: LobbyScene | null = null;
  private hud: Hud | null = null;
  private lobby: Lobby | null = null;
  private mini: MiniGameHost | null = null;
  private transition: Transition | null = null;
  readonly save = new SaveManager();
  readonly sfx = new Sfx();
  readonly music = new Music(
    () => this.sfx.context,
    () => this.sfx.mixBus,
  );
  /** First-run coach tips (null when done / not this run). */
  private tutorial: Tutorial | null = null;
  private tut = { moved: 0, opened: false, usedGadget: false, last: { x: 0, z: 0 } };
  /** Seconds of hit-stop left (the world crawls for a beat after the hero is caught). */
  private hitStopLeft = 0;
  /** ?play (tests/dev) skips the tips unless ?tutorial is set. */
  private readonly noTutorial = new URLSearchParams(location.search).has('play') && !new URLSearchParams(location.search).has('tutorial');
  /** Total simulated (unpaused) time across runs — used by tests. */
  simTime = 0;
  /** Ability events handled (tests check each use plays its sound/effect once). */
  private abilityEvents = 0;
  /** Last results (tests). */
  private lastRecord: unknown = null;
  /** Real seconds left in the knocked-down beat before results appear. */
  private defeatLeft = 0;
  /** Set by the TAP TO DROP button; consumed by the intro. */
  private dropRequested = false;
  private switching = false;
  /** Set while in training: the hero being tried (may be locked). */
  private trainingHero: HeroId | null = null;
  /** Opening lore cutscene (null outside the 'lore' state). */
  private lore: { timeline: LoreTimeline; wait: number } | null = null;
  private lorePlayer: LorePlayer | null = null;
  /** The chosen hero's start clip, played on PLAY (null with ?play / ?noclip). */
  private clipPlayer: ClipPlayer | null = null;
  private loreModules: ReturnType<typeof loadLore> | null = null;
  /** Future Heroes Gallery: built on the first visit. */
  private gallery: GalleryScene | null = null;
  private galleryUi: GalleryUi | null = null;
  /** What the open gallery viewer shows (the TV mutes the music). */
  private galleryView: 'none' | 'work' | 'tv' = 'none';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, false);
    this.applyPixelRatio();
    this.input = new InputManager(document.getElementById('touch-zone')!);
    this.sfx.setMuted(this.save.data.settings.muted);
    this.sfx.onUnlock = () => this.music.poke();

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
    const cap = this.save && !this.highQuality ? RENDER_CONFIG.lowQualityPixelRatio : RENDER_CONFIG.maxPixelRatio;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    this.engine.setHardwareScalingLevel(1 / dpr);
  }

  get heroId(): HeroId {
    return this.trainingHero ?? this.save.data.selectedHero;
  }

  /** Boot: build both scenes, then open on the lobby. */
  /** Boot: build both scenes. Resolves true when the game waits for "Tap to start" (then `beginLore`). */
  async start(onProgress: (p: number, label: string) => void): Promise<boolean> {
    const q = new URLSearchParams(location.search);
    // ?play / ?nolore (tests, dev) skip the opening cutscene.
    const wantsLore = !q.has('play') && !q.has('nolore') && !q.has('gallery');
    if (wantsLore) this.loreModules = loadLore();
    onProgress(0.08, 'Kinukuha ang mga bayani…');
    await preloadHeroModels();
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
      onGadget: () => this.input.press('gadget'),
      onTipOk: () => this.tutorial?.dismiss(),
      onObjectiveOk: () => this.closeObjective(),
      onToggleMute: () => this.toggleMute(),
      onInteract: () => this.input.press('interact'),
      onCloseExhibit: () => this.closeExhibit(),
    });
    this.lobby = new Lobby(this.uiRoot, this.save, {
      onPlay: () => void this.play(),
      onTrain: (id) => void this.train(id),
      onPreview: (id, skin) => this.lobbyScene?.setHero(id, skin ?? this.save.skinOf(id)),
      onPurchase: (kind) => this.sfx.play(kind === 'skin' ? 'unlock' : kind === 'frame' ? 'click' : 'claim'),
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
      onSetting: (key, value) => {
        const st = this.save.data.settings;
        if (key === 'musicVolume' && typeof value === 'number') st.musicVolume = value;
        else if (key === 'sfxVolume' && typeof value === 'number') st.sfxVolume = value;
        else if (key === 'quality' && (value === 'auto' || value === 'low' || value === 'high')) st.quality = value;
        else if (key === 'showFps') st.showFps = value === true;
        else if (key === 'largeText') st.largeText = value === true;
        else if (key === 'tutorial') st.tutorialDone = false;
        this.save.save();
        this.applySettings();
      },
      onReset: () => {
        this.save.reset();
        this.applySettings();
        this.lobbyScene?.setHero(this.heroId, this.save.skinOf(this.heroId));
      },
      onClick: () => this.sfx.play('click'),
      onReplayLore: () => void this.beginLore(),
      onGallery: () => void this.openGallery(),
    });
    this.mini = new MiniGameHost(this.uiRoot, {
      onWin: () => this.miniWon(),
      onQuit: () => this.closeMini(),
      onSound: (s) => this.sfx.play(MINI_SOUND[s]),
    });
    this.transition = new Transition(this.uiRoot);
    if (!q.has('noclip') && !q.has('play')) {
      this.clipPlayer = new ClipPlayer(this.uiRoot);
      const st = this.save.data.settings;
      this.clipPlayer.setVolume(st.muted ? 0 : Math.max(st.musicVolume, st.sfxVolume));
    }
    this.applySettings();
    this.museum.onRoomChange = (r) => {
      // Training stays in one hall and has its own tag; skip the gallery banner there.
      if (!this.trainingHero) this.hud?.showRoom(`📍 ${r.sign}`, r.subtitle);
    };
    this.museum.onEvent = (e) => this.onRunEvent(e);
    this.museum.player.onStep = () => {
      if (this.fsm.state === 'playing') this.sfx.play('step');
    };
    // Markers show what's cleared in *this* run (Exhibit Mode); the Archive keeps the all-time list.
    this.museum.isDiscovered = (id) => !!this.museum?.run.read.has(id);
    this.museum.perksFor = (id) => heroPerks(this.save.heroLevel(id));
    if (q.has('peaceful')) this.museum.run.peaceful = true;

    this.engine.runRenderLoop(() => this.frame());
    if (wantsLore) {
      // Build the (hidden) player now so the video buffers while "Tap to start" shows.
      const { LorePlayer } = await this.loreModules!;
      this.lorePlayer ??= this.makeLorePlayer(LorePlayer);
      return true;
    }
    this.fsm.transition('lobby');
    this.showLobby();
    // Test/dev shortcut: jump straight into a run (no lobby, no cinematic).
    if (q.has('play')) this.quickStart();
    // Direct link for the class: …/?gallery opens the Future Heroes Gallery.
    else if (q.has('gallery')) void this.openGallery();
    return false;
  }

  /** Opening lore cutscene: from boot (after "Tap to start") or the lobby's Replay intro. */
  async beginLore(): Promise<void> {
    if (this.lore || this.switching || !this.fsm.can('lore')) return;
    this.switching = true;
    const fromLobby = this.fsm.state === 'lobby';
    const { LorePlayer } = await (this.loreModules ??= loadLore());
    if (fromLobby) await this.transition?.cover();
    this.lorePlayer ??= this.makeLorePlayer(LorePlayer);
    this.lore = { timeline: new LoreTimeline(), wait: 0 };
    this.lobby?.setVisible(false);
    if (this.lobbyScene) this.lobbyScene.active = false;
    this.hud?.setMode('off');
    document.body.dataset.mode = 'lore';
    this.fsm.transition('lore');
    this.input.releaseAll();
    const ok = await this.lorePlayer.show(0);
    if (fromLobby) await this.transition?.reveal();
    this.switching = false;
    // Media blocked or missing: never trap the player behind a black screen.
    if (!ok) this.skipLore();
  }

  private makeLorePlayer(P: typeof LorePlayer): LorePlayer {
    const sources = LORE_VIDEO.map((v) => ({ src: import.meta.env.BASE_URL + v.src, type: v.type }));
    const p = new P(this.uiRoot, sources, () => this.skipLore());
    const s = this.save.data.settings;
    p.setVolume(s.muted ? 0 : Math.max(s.musicVolume, s.sfxVolume));
    return p;
  }

  /** Follows the video clock; if the video never gets going, gives up and skips. */
  private advanceLore(dt: number): void {
    const l = this.lore;
    const p = this.lorePlayer;
    if (!l || !p) return;
    if (!p.playing && l.timeline.time < 0.05) {
      l.wait += dt;
      if (l.wait > LORE.loadTimeout) return this.skipLore();
    }
    const t = p.video.ended ? LORE.duration : p.time;
    if (!l.timeline.done) for (const e of l.timeline.syncTo(t)) this.onLoreEvent(e);
    p.update(dt, l.timeline);
  }

  /** Skip chip / Esc / Enter / Space. */
  skipLore(): void {
    const l = this.lore;
    if (!l || this.switching) return;
    for (const e of l.timeline.skip()) this.onLoreEvent(e);
  }

  private onLoreEvent(e: LoreEvent): void {
    this.lorePlayer?.onEvent(e);
    if (e.type === 'end') void this.finishLore();
  }

  /** Lore over (or skipped): portal wipe into the lobby. */
  private async finishLore(): Promise<void> {
    if (!this.lore || this.switching) return;
    this.switching = true;
    this.sfx.play('portal');
    await this.transition?.cover();
    this.lorePlayer?.hide();
    this.lore = null;
    this.fsm.transition('lobby');
    this.input.releaseAll();
    this.showLobby();
    await this.transition?.reveal();
    this.switching = false;
  }

  /** Auto quality: High on desktops / strong phones, Low on small-core devices. */
  private get highQuality(): boolean {
    const q = this.save.data.settings.quality;
    if (q !== 'auto') return q === 'high';
    const cores = navigator.hardwareConcurrency ?? 8;
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return cores > 4 && !(touch && cores <= 6);
  }

  private applySettings(): void {
    const s = this.save.data.settings;
    this.sfx.setVolume(s.sfxVolume);
    this.music.setVolume(s.musicVolume);
    this.music.setMuted(s.muted);
    this.applyPixelRatio();
    this.engine.resize();
    this.museum?.setGlow(this.highQuality && !s.reducedEffects);
    this.museum?.setShadows(this.highQuality);
    this.hud?.setFpsVisible(s.showFps);
    document.body.classList.toggle('large-text', s.largeText);
    this.sfx.setMuted(s.muted);
    this.lorePlayer?.setVolume(s.muted ? 0 : Math.max(s.musicVolume, s.sfxVolume));
    this.clipPlayer?.setVolume(s.muted ? 0 : Math.max(s.musicVolume, s.sfxVolume));
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
    this.preloadClip();
  }

  /** Buffers the selected hero's start clip so PLAY starts it at once. */
  private preloadClip(): void {
    const id = this.heroId;
    this.clipPlayer?.load(id, heroClipSources(id).map((v) => ({ src: import.meta.env.BASE_URL + v.src, type: v.type })));
  }

  /** The chosen hero's start clip, over the portal wipe; resolves when it ends or is skipped. */
  private async playHeroClip(): Promise<void> {
    const c = this.clipPlayer;
    if (!c) return;
    this.preloadClip();
    await c.play(HERO_CLIPS[this.heroId].line, HERO_CLIP.startTimeout);
    this.input.releaseAll();
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

  /** PLAY: hero start clip (over a portal wipe) → museum reveal with the hero hovering. */
  async play(): Promise<void> {
    if (this.switching || this.fsm.state !== 'lobby' || !this.museum) return;
    this.switching = true;
    // The hero's start clip starts right away, inside the tap (so phones let it play with sound); the portal
    // wipe covers the lobby behind it and reveals the museum once the clip is over.
    const clip = this.playHeroClip();
    if (!this.clipPlayer) this.sfx.play('portal');
    this.lobby?.playOut();
    await Promise.all([this.transition?.cover(), clip]);
    this.showMuseum();
    this.beginIntro();
    this.clipPlayer?.hide();
    await this.transition?.reveal();
    this.switching = false;
  }

  /** Event banner: lobby → portal wipe → Future Heroes Gallery with the selected hero. */
  async openGallery(): Promise<void> {
    if (this.switching || this.fsm.state !== 'lobby') return;
    this.switching = true;
    this.sfx.play('portal');
    this.lobby?.playOut();
    const [mods] = await Promise.all([loadGallery(), this.transition?.cover()]);
    if (!this.gallery || !this.galleryUi) {
      const [{ GalleryScene }, { GalleryUi }] = mods;
      this.gallery = new GalleryScene(this.engine, this.input, this.heroId);
      await this.gallery.scene.whenReadyAsync();
      this.galleryUi = new GalleryUi(this.uiRoot, {
        onBack: () => void this.leaveGallery(),
        onOpen: (i) => {
          this.galleryView = i >= 0 ? 'work' : this.galleryUi?.showingTv ? 'tv' : 'work';
          this.input.releaseAll();
          this.input.enabled = false;
          if (i >= 0) this.gallery?.markSeen(i);
        },
        onClose: () => {
          this.galleryView = 'none';
          this.input.enabled = true;
        },
        onClick: () => this.sfx.play('click'),
        onPage: () => this.sfx.play('page'),
      });
      this.galleryUi.interactPressed = () => this.input.press('interact');
    }
    this.gallery.setHero(this.heroId, this.save.skinOf(this.heroId));
    this.gallery.reset();
    this.fsm.transition('gallery');
    this.input.releaseAll();
    this.lobby?.setVisible(false);
    if (this.lobbyScene) this.lobbyScene.active = false;
    this.hud?.setMode('off');
    document.body.dataset.mode = 'gallery';
    this.galleryUi.setVisible(true);
    await this.transition?.reveal();
    this.switching = false;
  }

  /** Back button / Esc in the gallery → portal wipe → lobby. */
  async leaveGallery(): Promise<void> {
    if (this.switching || this.fsm.state !== 'gallery') return;
    this.switching = true;
    this.input.releaseAll();
    await this.transition?.cover();
    this.galleryUi?.setVisible(false);
    this.galleryView = 'none';
    this.input.enabled = true;
    this.fsm.transition('lobby');
    this.showLobby();
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
    this.closeMini();
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
    this.closeMini();
    this.dropRequested = false;
    this.defeatLeft = 0;
    this.hud?.hideResults();
    this.hud?.setPaused(false);
    this.hud?.showObjective(null);
    this.hud?.setMode('intro');
    this.museum.startIntro();
    this.startTutorial();
    this.pushStats();
  }

  private startTutorial(): void {
    const m = this.museum;
    this.tutorial = !m || this.noTutorial || this.trainingHero || this.save.data.settings.tutorialDone ? null : new Tutorial();
    const p = m?.player.position ?? { x: 0, z: 0 };
    this.tut = { moved: 0, opened: false, usedGadget: false, last: { x: p.x, z: p.z } };
    this.hud?.showTip(null);
  }

  private finishTutorial(): void {
    if (!this.tutorial) return;
    this.tutorial = null;
    this.hud?.showTip(null);
    this.save.data.settings.tutorialDone = true;
    this.save.save();
  }

  private updateTutorial(dt: number): void {
    const t = this.tutorial;
    const m = this.museum;
    if (!t || !m) return;
    const p = m.player.position;
    this.tut.moved += Math.hypot(p.x - this.tut.last.x, p.z - this.tut.last.z);
    this.tut.last = { x: p.x, z: p.z };
    const run = m.run;
    const id = t.update(dt, {
      moved: this.tut.moved,
      openedExhibit: this.tut.opened,
      usedAbility: run.ability.uses > 0,
      holdingGadget: run.gadget !== null,
      usedGadget: this.tut.usedGadget,
    });
    if (t.done) return this.finishTutorial();
    if (!id) return this.hud?.showTip(null);
    const tip = TIPS[id];
    const touch = document.body.classList.contains('touch');
    let body = touch ? tip.touch : tip.desktop;
    if (id === 'ability' && run.ability.locked) body += TIP_LOCKED_SUFFIX;
    this.hud?.showTip({ id, icon: tip.icon, title: tip.title, body });
  }

  /** Skip lobby + cinematic (used by automated movement tests via ?play). */
  quickStart(): void {
    if (!this.museum) return;
    this.showMuseum();
    this.museum.resetRun();
    this.hud?.setMode('play');
    if (this.fsm.state === 'lobby') this.fsm.transition('intro');
    this.fsm.transition('playing');
    this.startTutorial();
    this.pushStats();
  }

  /** Results / pause → portal wipe → lobby. */
  async toLobby(): Promise<void> {
    if (this.switching || !this.fsm.can('lobby')) return;
    this.switching = true;
    this.input.releaseAll();
    await this.transition?.cover();
    this.fsm.transition('lobby');
    this.closeMini();
    this.hud?.showObjective(null);
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
    // Read every frame so a press never lingers into a later state.
    const interact = this.input.consume('interact');
    if (this.input.consume('pause')) {
      if (state === 'playing') this.pause();
      else if (state === 'paused') this.resume();
      else if (state === 'reading') this.closeExhibit();
      else if (state === 'lobby') this.lobby?.back();
      else if (state === 'gallery' && !this.galleryUi?.back()) void this.leaveGallery();
      else if (state === 'lore') this.skipLore();
    }
    if (state === 'lore' && this.lore) {
      if (this.input.consume('confirm') || this.input.consume('ability')) this.skipLore();
      this.advanceLore(dt);
    } else if (state === 'lobby') {
      this.lobbyScene?.update(dt);
    } else if (state === 'gallery' && this.gallery && this.galleryUi) {
      const viewing = this.galleryUi.viewing;
      if (interact && !viewing && this.gallery.near) this.galleryUi.openSpot(this.gallery.near);
      this.gallery.update(dt, this.galleryUi.viewing);
      this.galleryUi.setNear(this.galleryUi.viewing ? null : this.gallery.near);
    } else if (state === 'intro' && this.museum) {
      const mv = this.input.move;
      const drop = this.dropRequested || this.input.consume('confirm') || this.input.consume('ability') || Math.hypot(mv.x, mv.z) > 0.5;
      this.dropRequested = false;
      for (const e of this.museum.updateIntro(dt, drop)) this.onIntroEvent(e);
    } else if (state === 'playing' && this.museum && this.hud?.objectiveOpen) {
      // Objective card: the world crawls in slow motion; any key closes it (a tap is handled by the HUD).
      const closeKey = interact || this.input.consume('confirm') || this.input.consume('ability') || this.input.consume('gadget');
      this.simTime += dt * OBJECTIVE.worldSlow;
      this.museum.update(dt * OBJECTIVE.worldSlow, true);
      this.pushStats();
      if (closeKey) this.closeObjective();
    } else if (state === 'playing' && this.museum) {
      if (this.input.consume('ability') && !this.museum.useAbility()) {
        this.sfx.play('denied');
        this.hud?.abilityDenied();
        if (this.museum.run.ability.locked) this.hud?.showRoom(`🔒 Skill sa Lv ${HERO_LEVEL.abilityLevel}`, `Mag-level up muna si ${HEROES[this.heroId].name}`);
      }
      const gadgetPressed = this.input.consume('gadget');
      if (gadgetPressed && this.museum.useGadget()) this.tut.usedGadget = true;
      else if (gadgetPressed) {
        this.sfx.play('denied');
        this.hud?.gadgetDenied();
        this.hud?.showRoom('🎒 Wala kang gadget', 'Pulutin ang mga lumulutang na icon sa museum');
      }
      const mini = this.mini;
      const near = this.museum.nearExhibit;
      if (mini?.active) {
        // The world keeps going while the hero is busy, but in slow motion (owner: like the Time Freeze),
        // so enemies can still sneak up without the mini-game being a race.
        this.simTime += dt * MINIGAME.worldSlow;
        this.museum.update(dt * MINIGAME.worldSlow, true);
        mini.update(dt);
        mini.setDanger(this.nearestEnemy() < MINIGAME.dangerRange);
        this.pushStats();
      } else if (interact && near) {
        this.interactExhibit(near);
      } else if (interact && this.museum.nearChart) {
        this.openChart();
      } else {
        // Hit-stop: the frame "sticks" for a beat when the hero is caught, so the hit has weight.
        const k = this.hitStopLeft > 0 ? FEEDBACK.hitStopScale : 1;
        this.hitStopLeft = Math.max(0, this.hitStopLeft - dt);
        this.simTime += dt * k;
        this.museum.update(dt * k);
        this.pushStats();
        const n = this.museum.nearExhibit;
        if (!n && this.museum.nearChart) this.hud?.setChartPrompt();
        else this.hud?.setExhibitPrompt(n, n ? this.promptMode(n) : 'new');
      }
    } else if (state === 'reading') {
      // Frozen run (like pause): E / Esc / the button closes the panel.
      if (interact) this.closeExhibit();
    } else if (state === 'gameover' && this.museum && this.defeatLeft > 0) {
      // Slow-mo knockout beat, then the results panel.
      this.museum.updateDefeated(dt * FEEDBACK.gameOverTimeScale);
      this.defeatLeft -= dt;
      if (this.defeatLeft <= 0) this.showResults();
    }
    // Slow motion (mini-game or the objective card): a cold time-freeze tint over the screen.
    document.body.classList.toggle('slowmo', this.slowMo);
    if (state === 'playing' && !this.hud?.objectiveOpen) this.updateTutorial(dt);
    else if (state !== 'paused' && state !== 'reading') this.hud?.showTip(null);
    this.updateMusic(state);
    this.hud?.tickFps(dt);
    // While the intro video covers the screen, the 3D scenes don't render at all.
    if (this.clipPlayer?.visible) return;
    if (state === 'lobby' || state === 'boot') this.lobbyScene?.scene.render();
    else if (state === 'lore') return;
    else if (state === 'gallery') this.gallery?.scene.render();
    else this.museum?.scene.render();
  }

  /** Picks the loop + intensity for the current state (cheap; Music only acts on changes). */
  private updateMusic(state: string): void {
    const run = this.museum?.run;
    // The intro video and the hero start clips carry their own score and sound effects.
    if (state === 'lore' || this.clipPlayer?.visible) return this.music.set(null);
    if (state === 'boot' || state === 'lobby') return this.music.set('lobby');
    if (state === 'gallery') return this.galleryView === 'tv' ? this.music.set(null) : this.music.set('lobby', 0, this.galleryView === 'work' ? MUSIC.duckPaused : 1);
    if (state === 'gameover' || !run) return this.music.set(null);
    const enemies = run.training ? 0 : run.guards.length;
    const intensity = run.endless ? 1 : Math.min(0.84, enemies / MUSIC.fullIntensityEnemies);
    const duck = state === 'paused' || state === 'reading' ? MUSIC.duckPaused : this.mini?.active ? MUSIC.duckMini : 1;
    this.music.set('museum', intensity, duck, (run.endless ? MUSIC.endlessTempo : 1) * (this.slowMo ? MUSIC.slowMoTempo : 1));
  }

  /** True while the world runs in slow motion (an exhibit mini-game or the objective card). */
  private get slowMo(): boolean {
    return this.fsm.state === 'playing' && (!!this.mini?.active || !!this.hud?.objectiveOpen);
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
          this.openObjective();
        }
        break;
      default:
        break;
    }
  }

  /** The first guard is on you: the world slows and the run's objective pops up (once per run). */
  private openObjective(): void {
    const run = this.museum?.run;
    if (!run || run.training || !this.hud) return;
    this.hud.showObjective({ ...OBJECTIVE, cleared: run.cleared, total: run.exhibitTotal });
    this.sfx.play('page');
    this.input.releaseAll();
  }

  private closeObjective(): void {
    if (!this.hud?.objectiveOpen) return;
    this.hud.showObjective(null);
    this.sfx.play('click');
    this.input.releaseAll();
  }

  private promptMode(e: Exhibit): PromptMode {
    const run = this.museum!.run;
    if (run.read.has(e.id)) return 'cleared';
    if (run.training) return 'practice';
    return e.game === 'swipe' && !run.hasIdCard ? 'needId' : 'new';
  }

  /** E / tap near an exhibit: re-read a cleared one, or start its mini-game. */
  private interactExhibit(e: Exhibit): void {
    const run = this.museum?.run;
    if (!run) return;
    const mode = this.promptMode(e);
    if (mode === 'cleared') {
      this.openExhibit(e, null);
    } else if (mode === 'needId') {
      this.sfx.play('denied');
      this.hud?.showRoom('🪪 Kailangan ng Curator ID!', 'Sundan ang dilaw na arrow para mahanap ang ID card');
    } else {
      this.input.releaseAll();
      this.hud?.setExhibitPrompt(null);
      this.mini?.open(e, run.cleared / run.exhibitTotal);
      this.tut.opened = true;
      this.sfx.play('page');
    }
  }

  private closeMini(): void {
    this.mini?.close();
    this.input.releaseAll();
  }

  /** Mini-game solved: pay for the exhibit and open its history panel. */
  private miniWon(): void {
    const id = this.mini?.exhibitId;
    const run = this.museum?.run;
    this.mini?.close();
    const e = id ? EXHIBIT_BY_ID[id] : undefined;
    if (!e || !run || run.over || this.fsm.state !== 'playing') return;
    run.wonGame();
    const pay = run.discover(e.id);
    if (pay.diamonds) this.save.addDiamonds(pay.diamonds);
    this.openExhibit(e, pay);
  }

  /** Opens an exhibit panel (run frozen) and adds it to the Archive. `pay` = what clearing it just paid. */
  private openExhibit(e: Exhibit, pay: ExhibitPayout | null): void {
    if (!this.museum || !this.fsm.transition('reading')) return;
    this.input.releaseAll();
    const isNew = this.save.discover(e.id);
    this.hud?.setExhibitPrompt(null);
    this.hud?.showExhibit(e, pay, isNew);
    this.sfx.play(pay?.diamonds ? 'claim' : 'page');
    this.pushStats();
    this.lobby?.refresh();
  }

  /** The Library's baybayin chart: a study sheet, run fully frozen (owner: freeze, not slow-mo). */
  private openChart(): void {
    if (!this.museum || !this.fsm.transition('reading')) return;
    this.input.releaseAll();
    this.hud?.setExhibitPrompt(null);
    this.hud?.showChart();
    this.sfx.play('page');
  }

  /** Distance to the closest enemy that can hurt the hero right now. */
  private nearestEnemy(): number {
    const m = this.museum;
    if (!m) return Infinity;
    const p = m.player.position;
    let best = Infinity;
    for (const g of m.run.guards) if (g.canHurt) best = Math.min(best, Math.hypot(g.pos.x - p.x, g.pos.z - p.z));
    return best;
  }

  closeExhibit(): void {
    if (this.fsm.state !== 'reading' || !this.fsm.transition('playing')) return;
    this.hud?.hideExhibit();
    this.input.releaseAll();
    // Never resume straight into a hit from an enemy that was right behind you.
    this.museum?.run.health.grantInvuln(EXHIBIT_CONFIG.resumeGrace);
  }

  pause(): void {
    // Pausing over the objective card closes it first, so the pause menu is never hidden under it.
    if (this.fsm.state === 'playing') this.closeObjective();
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
      this.closeMini();
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
    this.hud.setAbilityState(ab.cooldownFrac, ab.active || run.shielded, ab.cooldownLeft, ab.locked ? HERO_LEVEL.abilityLevel : 0);
    this.hud.setExhibitProgress(run.cleared, run.exhibitTotal, run.endless, run.hasIdCard);
    const fx: { kind: GadgetKind; left: number }[] = [];
    if (run.smokeLeft > 0) fx.push({ kind: 'smoke', left: run.smokeLeft });
    if (run.magnetLeft > 0) fx.push({ kind: 'magnet', left: run.magnetLeft });
    if (run.freezeLeft > 0) fx.push({ kind: 'freeze', left: run.freezeLeft });
    if (run.bubble) fx.push({ kind: 'bubble', left: 0 });
    this.hud.setGadget(run.gadget, fx);
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
        if (!this.save.data.settings.reducedEffects) this.hitStopLeft = FEEDBACK.hitStop;
        hud?.flashHurt();
        if (this.mini?.active) {
          this.closeMini();
          if (!m.run.over) hud?.showRoom('💥 Nahuli ka habang naglalaro!', 'Na-cancel ang mini-game. Balikan mo mamaya');
        }
        break;
      case 'gadgetPickup': {
        const info = GADGET_INFO[e.kind];
        this.sfx.play('unlock');
        hud?.showRoom(`${info.icon} ${info.name}!`, e.kind === 'magnet' ? info.blurb : `${info.blurb} · pindutin ang 🎒 (Q)`);
        break;
      }
      case 'gadget':
        this.sfx.play(e.kind === 'smoke' ? 'poof' : e.kind === 'freeze' ? 'shockwave' : e.kind === 'bubble' ? 'shield' : 'rare');
        if (e.kind === 'smoke' && e.affected > 0) {
          const p = m.toScreen(e.pos, 2.4);
          hud?.floatText(p.x, p.y, 'Nawala ka sa paningin nila! 💨', 'bonus');
        } else if (e.kind === 'freeze' && e.affected > 0) {
          const p = m.toScreen(e.pos, 2.4);
          hud?.floatText(p.x, p.y, `${e.affected} kalaban, slow-mo! ⏳`, 'bonus');
        }
        break;
      case 'bubblePop': {
        this.sfx.play('block');
        const p = m.toScreen(e.pos, 2.2);
        hud?.floatText(p.x, p.y, 'Bubble saved you! 🛡️', 'bonus');
        break;
      }
      case 'idCard':
        this.sfx.play('claim');
        hud?.showRoom('🪪 Curator ID, nakuha!', 'Pwede mo nang i-swipe sa Card Swipe exhibits');
        break;
      case 'endless':
        this.sfx.play('gameover');
        hud?.banner('🏛️ MUSEUM CLEARED! ♾️', 'Endless Mode na: bibilis at dadami sila hanggang mahuli ka. Habol pa ng score!');
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
      case 'discovered':
        if (e.points > 0) {
          const p = m.toScreen(m.player.position, 2.4);
          hud?.floatText(p.x, p.y, `+${e.points} · +${e.coins} 🪙 📜`, 'bonus');
        }
        break;
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
    // One run is enough of a tutorial: don't nag on the next one.
    this.finishTutorial();
    const s = run.score;
    const rec = this.save.recordRun(
      {
        score: s.score,
        time: s.time,
        runCoins: s.runCoins,
        coinsPicked: s.coinsPicked,
        bestMultiplier: s.bestMultiplier,
        abilityUses: run.ability.uses,
        exhibits: s.discoveries,
        gamesWon: run.gamesWon,
      },
      this.heroId,
    );
    this.lastRecord = rec;
    this.hud?.showResults({
      score: run.score.score,
      time: run.score.time,
      coins: run.score.runCoins,
      bestScore: this.save.data.bestScore,
      newBest: rec.newBest,
      wallet: this.save.data.coins,
      missions: rec.completedMissions.map(describe),
      daily: rec.completedDaily.map(describeDaily),
      cleared: run.cleared,
      total: run.exhibitTotal,
      endlessTime: run.endless ? run.endlessTime : 0,
      heroName: HEROES[this.heroId].name,
      hero: rec.hero,
      player: rec.player,
    });
    if (rec.hero.to > rec.hero.from || rec.player.to > rec.player.from) this.sfx.play('claim');
  }

  readonly debug: DebugHooks = {
    loreSeek: (t) => {
      const l = this.lore;
      if (!l) return;
      for (const e of l.timeline.seek(t)) this.lorePlayer?.onEvent(e);
      this.lorePlayer?.seek(t);
    },
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
      this.museum?.run.health.setInvuln(seconds);
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
    winMiniGame: () => this.mini?.forceWin(),
    giveGadget: (kind) => {
      const m = this.museum;
      if (m) m.run.giveGadget(kind, m.player.position);
    },
    spawnGadget: (kind, x, z) => {
      const m = this.museum;
      if (m) m.run.gadgets.spawn(m.player.position, kind, x === undefined || z === undefined ? undefined : { x, z });
    },
    giveIdCard: () => {
      const c = this.museum?.run.idCard;
      if (c) {
        const p = this.museum!.player.position;
        c.pos = { ...p };
      }
    },
    clearExhibits: (n) => {
      const run = this.museum?.run;
      if (!run) return;
      for (const e of Object.values(EXHIBIT_BY_ID)) {
        if (run.cleared >= n) break;
        if (!run.read.has(e.id)) run.discover(e.id);
      }
    },
    addHeroXp: (hero, xp) => {
      this.save.addHeroXp(hero, xp);
      this.lobby?.refresh();
    },
    addPlayerXp: (xp) => {
      this.save.addPlayerXp(xp);
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
    this.preloadClip();
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
      nearExhibit: this.museum?.nearExhibit?.id ?? null,
      exhibitPrompt: this.hud?.exhibitPromptVisible ?? false,
      exhibitOpen: this.hud?.exhibitVisible ?? false,
      mini: this.mini?.active ? { kind: this.mini.kind, id: this.mini.exhibitId } : null,
      cleared: run?.cleared,
      endless: run?.endless ?? false,
      endlessTime: run?.endlessTime ?? 0,
      hasIdCard: run?.hasIdCard ?? false,
      idCard: run?.idCard ? { ...run.idCard.pos, taken: run.idCard.taken } : null,
      guide: this.museum?.guideTo ?? null,
      chaseSpeed: run?.chaseSpeed,
      abilityLocked: run?.ability.locked ?? false,
      gadget: run?.gadget ?? null,
      gadgetItems: run?.gadgets.items.map((g) => ({ kind: g.kind, x: g.pos.x, z: g.pos.z })) ?? [],
      smokeLeft: run?.smokeLeft ?? 0,
      magnetLeft: run?.magnetLeft ?? 0,
      freezeLeft: run?.freezeLeft ?? 0,
      bubble: run?.bubble ?? false,
      slowed: run?.guards.filter((g) => g.slowLeft > 0).length ?? 0,
      lastRecord: this.lastRecord,
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
      lore: this.lore
        ? { time: this.lore.timeline.time, scene: this.lore.timeline.scene.id, video: this.lorePlayer?.time ?? 0, bubble: this.lore.timeline.currentBubble?.text ?? null, skip: this.lorePlayer?.skipVisible ?? false, sound: this.lorePlayer ? !this.lorePlayer.video.muted && this.lorePlayer.video.volume > 0 : false }
        : null,
      clip: this.clipPlayer?.visible ? { time: this.clipPlayer.video.currentTime, sound: !this.clipPlayer.video.muted && this.clipPlayer.video.volume > 0, src: this.clipPlayer.video.currentSrc } : null,
      previewHero: this.lobby?.previewHero,
      save: { ...this.save.data },
      state: this.fsm.state,
      hero: this.heroId,
      x: p?.position.x,
      z: p?.position.z,
      speed: p?.motor.speed,
      simTime: this.simTime,
      objective: !!this.hud?.objectiveOpen,
      slowMo: this.slowMo,
      abilityEvents: this.abilityEvents,
      fps: this.engine.getFps(),
      drawCalls: (this.engine as unknown as { _drawCalls?: { current: number } })._drawCalls?.current,
      meshes: this.museum?.scene.meshes.length,
    };
  }
}

/** Test hooks (only used by the e2e smoke test; harmless in normal play). */
export interface DebugHooks {
  /** Jumps the lore cutscene to `t` seconds (screenshots of each shot). */
  loreSeek(t: number): void;
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
  /** Solves the open mini-game. */
  winMiniGame(): void;
  /** Puts a gadget in the hero's slot (a magnet fires at once). */
  giveGadget(kind: GadgetKind): void;
  /** Drops a gadget pickup on the floor (at x, z if given). */
  spawnGadget(kind?: GadgetKind, x?: number, z?: number): void;
  /** Moves the Curator ID card under the hero (picked up next frame). */
  giveIdCard(): void;
  /** Marks exhibits cleared (paid as normal) until `n` are done. */
  clearExhibits(n: number): void;
  addHeroXp(hero: HeroId, xp: number): void;
  addPlayerXp(xp: number): void;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
