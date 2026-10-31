import type { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { NavGrid } from '../ai/NavGrid';
import { FollowCamera } from '../camera/FollowCamera';
import { Player } from '../characters/Player';
import type { InputManager } from '../controls/InputManager';
import { FEEDBACK, HEALTH, PICKUPS } from '../data/gameplay';
import { INTRO } from '../data/lobby';
import { IntroSequence, type IntroEvent } from '../gameplay/IntroSequence';
import type { GuardBrain } from '../enemies/GuardBrain';
import { Portal } from '../world/Portal';
import { ABILITIES } from '../data/abilities';
import { HEROES, type HeroId } from '../data/heroes';
import { AbilityViews } from '../world/AbilityViews';
import { TrainingProps } from '../world/TrainingProps';
import { ExhibitMarkers } from '../world/ExhibitMarkers';
import type { Exhibit } from '../data/exhibits';
import { exhibitInReach, guideTarget, type GuideTarget } from '../history/exhibitMath';
import { GadgetViews } from '../world/GadgetViews';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { GuideViews } from '../world/GuideViews';
import { TRAINING } from '../data/training';
import { buildColliders, MUSEUM_BOUNDS, roomAt, SPAWN_POINT, type Room } from '../data/museumLayout';
import { DecoyView, EnemyMaterials, makeEnemyView, type EnemyView } from '../enemies/EnemyViews';
import { SPAWN_SCHEDULE, TIKBALANG, type EnemyKind } from '../data/enemies';
import { SurvivalRun, type AbilityPerks, type RunEvent } from '../gameplay/SurvivalRun';
import { CollisionWorld } from '../physics/Collision';
import { dampAngle, type Vec2 } from '../utils/math';
import { Fx } from '../world/Fx';
import { buildMuseum, type MuseumBuild } from '../world/MuseumBuilder';
import { PickupViews } from '../world/PickupViews';
import type { GameScene } from './GameScene';

const STILL = { x: 0, z: 0 } as const;

/** The museum run: hero, guards, pickups and camera. Gameplay rules live in SurvivalRun. */
export class MuseumScene implements GameScene {
  readonly scene: Scene;
  readonly player: Player;
  readonly world: CollisionWorld;
  readonly run: SurvivalRun;
  private readonly cam: FollowCamera;
  private readonly museum: MuseumBuild;
  private readonly fx: Fx;
  private readonly pickupViews: PickupViews;
  private readonly enemyMats: EnemyMaterials;
  /** Pooled views per kind (built up-front from the spawn schedule, grown on demand). */
  private readonly viewPool = new Map<EnemyKind, EnemyView[]>();
  /** Which view renders which enemy this run. */
  private readonly viewOf = new Map<GuardBrain, EnemyView>();
  private readonly decoyViews: DecoyView[] = [];
  private room: Room | undefined;
  private blinkT = 0;
  private readonly portal: Portal;
  private readonly abilityViews: AbilityViews;
  private readonly trainingProps: TrainingProps;
  private readonly exhibitMarkers: ExhibitMarkers;
  private readonly guide: GuideViews;
  private readonly gadgetViews: GadgetViews;
  private glow: GlowLayer | null = null;
  /** Where the floor arrow points (null in training / endless). */
  guideTo: GuideTarget | null = null;
  /** Hero-level ability perks for a hero (set by the Game; full strength by default). */
  perksFor: (id: HeroId) => AbilityPerks = () => ({ abilityUnlocked: true, cooldownMult: 1, boost: 1 });
  /** Exhibit the hero can read right now (updated while playing). */
  nearExhibit: Exhibit | null = null;
  /** Whether an exhibit is already in the Archive (markers turn blue); set by the Game. */
  isDiscovered: (id: string) => boolean = () => false;
  private intro: IntroSequence | null = null;
  private introGuard: GuardBrain | null = null;
  /** Accessibility: no camera shake, fewer particles. */
  reducedEffects = false;
  onRoomChange: ((room: Room) => void) | null = null;
  /** Gameplay events after the scene has reacted (HUD + sound hook in here). */
  onEvent: ((e: RunEvent) => void) | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly input: InputManager,
    heroId: HeroId,
  ) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.06, 0.08, 0.18, 1);
    scene.ambientColor = new Color3(0.3, 0.28, 0.32);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;

    const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.72;
    hemi.diffuse = new Color3(1, 0.95, 0.86);
    hemi.groundColor = new Color3(0.36, 0.3, 0.38);
    hemi.specular = new Color3(0.2, 0.2, 0.2);
    const sun = new DirectionalLight('key', new Vector3(-0.45, -1, 0.35), scene);
    sun.intensity = 0.42;
    sun.diffuse = new Color3(1, 0.9, 0.75);

    this.museum = buildMuseum(scene);
    const boxes = buildColliders();
    this.world = new CollisionWorld(boxes);
    this.player = new Player(scene, this.world, SPAWN_POINT, heroId);
    this.cam = new FollowCamera(scene, SPAWN_POINT);
    for (const o of this.museum.occluders) this.cam.addOccluder(o);
    scene.activeCamera = this.cam.camera;

    const nav = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.45);
    const sight = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.05);
    const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, PICKUPS.wallClearance).walkableCells();
    this.run = new SurvivalRun(nav, sight, this.world, spots);

    this.fx = new Fx(scene);
    this.pickupViews = new PickupViews(scene);
    // Pool: one view per scheduled arrival, so nothing is built mid-run.
    this.enemyMats = new EnemyMaterials(scene);
    for (const { kind } of SPAWN_SCHEDULE) this.poolOf(kind).push(makeEnemyView(kind, scene, this.fx, this.enemyMats));
    const tikbalangs = SPAWN_SCHEDULE.filter((e) => e.kind === 'tikbalang').length;
    for (let i = 0; i < tikbalangs * TIKBALANG.illusionCount; i++) this.decoyViews.push(new DecoyView(scene, this.enemyMats));
    this.portal = new Portal(scene, this.fx.sparkTex);
    this.abilityViews = new AbilityViews(scene, this.fx.sparkTex);
    this.trainingProps = new TrainingProps(scene);
    this.exhibitMarkers = new ExhibitMarkers(scene);
    this.guide = new GuideViews(scene);
    this.gadgetViews = new GadgetViews(scene, this.fx.sparkTex);
    this.resetRun();
  }

  /** Fresh run: hero at spawn, new board, no guards. `training` = Hall of Heroes practice instead. */
  resetRun(training = false): void {
    const spawn = training ? TRAINING.spawn : SPAWN_POINT;
    this.intro = null;
    this.introGuard = null;
    this.portal.hide();
    this.world.setExtra(training ? TRAINING.barriers : []);
    this.trainingProps.setEnabled(training);
    this.player.respawn(spawn);
    this.run.reset(spawn, HEROES[this.player.heroId].abilityKind, training, this.perksFor(this.player.heroId));
    this.guideTo = null;
    this.guide.hide();
    this.trainingProps.sync(this.run.dummies, 0);
    this.abilityViews.hide();
    this.gadgetViews.hide();
    this.cam.zoom = 1;
    this.cam.lookY = 0.6;
    this.cam.snapTo(spawn);
    this.releaseViews();
    this.nearExhibit = null;
    this.pickupViews.sync(this.run.pickups.items, 0);
    this.room = undefined;
  }

  setHero(id: HeroId, skin?: string): void {
    this.player.setHero(id, skin);
  }

  /** Ability button / Space. Returns whether it fired (false while on cooldown). */
  /**
   * High quality: a soft, controlled glow on coins, exhibit gems and gadgets only
   * (never the whole scene). Low quality: no glow layer at all.
   */
  setGlow(on: boolean): void {
    if (!on) {
      this.glow?.dispose();
      this.glow = null;
      this.gadgetViews.onMesh = null;
      return;
    }
    if (this.glow) return;
    const g = (this.glow = new GlowLayer('softGlow', this.scene, { mainTextureRatio: 0.35, blurKernelSize: 16 }));
    g.intensity = 0.3;
    for (const m of [...this.pickupViews.glowMeshes, ...this.exhibitMarkers.glowMeshes]) g.addIncludedOnlyMesh(m);
    this.gadgetViews.onMesh = (m) => g.addIncludedOnlyMesh(m);
  }

  useAbility(): boolean {
    return this.run.useAbility(this.player.position, this.player.motor.facing);
  }

  /** Fires the carried gadget (false when the slot is empty). */
  useGadget(): boolean {
    return this.run.useGadget(this.player.position);
  }

  /** Training: straight into the Hall of Heroes with practice dummies (no intro, guards or coins). */
  startTraining(): void {
    this.resetRun(true);
    this.fx.reduced = this.reducedEffects;
    this.abilityViews.reduced = this.reducedEffects;
    this.gadgetViews.reduced = this.reducedEffects;
  }

  get training(): boolean {
    return this.run.training;
  }

  /** New run that starts with the cinematic: hover under the portal, wait for the drop. */
  startIntro(): void {
    this.resetRun();
    this.fx.reduced = this.reducedEffects;
    this.abilityViews.reduced = this.reducedEffects;
    this.gadgetViews.reduced = this.reducedEffects;
    this.intro = new IntroSequence();
    this.introGuard = this.run.placeIntroGuard(SPAWN_POINT, INTRO.guardDistance);
    this.portal.open(SPAWN_POINT, INTRO.floatHeight + 1.0, this.reducedEffects);
    this.cam.zoom = INTRO.revealZoom;
    this.cam.lookY = INTRO.floatHeight * 0.6;
    this.cam.snapTo(SPAWN_POINT);
    this.player.updateIntro(0, INTRO.floatHeight, 'float');
  }

  get introPhase(): string | null {
    return this.intro?.phase ?? null;
  }

  /**
   * Steps the cinematic. Nothing can hurt the hero here: SurvivalRun is not updated,
   * so the timer, scoring and damage only start once the Game switches to 'playing'.
   */
  updateIntro(dt: number, drop: boolean): IntroEvent[] {
    const intro = this.intro;
    if (!intro) return [];
    const ev = intro.update(dt, drop);
    const p = this.player.position;
    for (const e of ev) {
      if (e === 'drop') this.portal.close();
      if (e === 'landed') {
        this.fx.dustRing(p);
        if (!this.reducedEffects) this.cam.shake(INTRO.landShake, 0.25);
      }
      if (e === 'guardAlert') {
        this.introGuard?.hunt(p);
        if (this.introGuard) this.viewFor(this.introGuard).flashAlert();
      }
    }
    const ph = intro.phase;
    const anim = ph === 'reveal' || ph === 'float' ? 'float' : ph === 'fall' ? 'fall' : ev.includes('landed') ? 'land' : 'idle';
    this.player.updateIntro(dt, intro.heroY, anim, ph === 'reveal' || ph === 'float' ? 0.35 : 0);
    if (ph === 'fall' || ev.includes('drop')) {
      // Settle the hero's facing toward the camera as it drops.
      this.player.motor.state.yaw = dampAngle(this.player.motor.state.yaw, Math.PI, 6, dt);
    }

    // Guard: back turned until it hears the landing, then turns to look (alert state handles the stare).
    const g = this.introGuard;
    if (g) {
      if (ph === 'notice' && g.state !== 'alert') g.yaw = dampAngle(g.yaw, Math.atan2(p.x - g.pos.x, p.z - g.pos.z), 9, dt);
      if (g.state === 'alert') g.update(dt, p);
    }

    // Camera: wide reveal swooping in, look height following the hover/drop.
    const rt = intro.revealT;
    const ease = 1 - (1 - rt) ** 3;
    this.cam.zoom = INTRO.revealZoom + (1 - INTRO.revealZoom) * ease;
    const wantLook = 0.6 + intro.heroY * 0.6;
    this.cam.lookY += (wantLook - this.cam.lookY) * Math.min(1, dt * 6);
    this.portal.update(dt);
    if (ph === 'done') {
      this.cam.lookY = 0.6;
      this.intro = null;
    }
    this.syncWorld(dt);
    return ev;
  }

  /** `frozen` = the hero stands still (busy with an exhibit mini-game) while the world keeps going. */
  update(dt: number, frozen = false): void {
    this.player.motor.speedMultiplier = this.run.speedMultiplier;
    this.player.update(frozen ? STILL : this.input.move, dt);
    for (const e of this.run.update(dt, this.player.position)) this.react(e);
    const ab = this.run.ability;
    const trail = this.player.motor.dashing ? 'dash' : ab.kind === 'sprint' && ab.active ? 'sprint' : null;
    this.abilityViews.update(dt, this.player.position, this.run.shielded, trail);
    const run0 = this.run;
    this.gadgetViews.update(
      dt,
      run0.gadgets.items,
      this.player.position,
      { bubble: run0.bubble, magnet: run0.magnetLeft > 0, smoke: run0.smokeLeft > 0, smokeAt: run0.smokeAt },
      run0.guards,
    );

    // Blink while invulnerable (but not during the opening grace — that would read as damage).
    const h = this.run.health;
    if (h.invulnerable && h.hearts < HEALTH.maxHearts && !this.run.over) {
      this.blinkT += dt;
      this.player.setVisible(Math.floor(this.blinkT * FEEDBACK.blinkHz * 2) % 2 === 0);
    } else {
      this.blinkT = 0;
      this.player.setVisible(true);
    }
    this.nearExhibit = this.run.over ? null : exhibitInReach(this.player.position);
    const run = this.run;
    this.guideTo = run.training || run.endless || run.over ? null : guideTarget(this.player.position, run.read, run.idCard);
    this.guide.update(dt, this.player.position, this.guideTo?.at ?? null, run.training ? null : run.idCard);
    this.syncWorld(dt);

    const r = roomAt(this.player.position.x, this.player.position.z);
    if (r && r !== this.room) {
      this.room = r;
      this.onRoomChange?.(r);
    }
  }

  /** Slowed-down knockout beat after the last heart (no input, guards idle). */
  updateDefeated(dt: number): void {
    this.player.updateDefeated(dt);
    this.syncWorld(dt);
  }

  private poolOf(kind: EnemyKind): EnemyView[] {
    let pool = this.viewPool.get(kind);
    if (!pool) this.viewPool.set(kind, (pool = []));
    return pool;
  }

  /** The view bound to `g`, taking a free pooled one (or building one) on first sight. */
  private viewFor(g: GuardBrain): EnemyView {
    let v = this.viewOf.get(g);
    if (v) return v;
    const pool = this.poolOf(g.kind);
    const used = new Set(this.viewOf.values());
    v = pool.find((x) => !used.has(x));
    if (!v) pool.push((v = makeEnemyView(g.kind, this.scene, this.fx, this.enemyMats)));
    v.reduced = this.reducedEffects;
    this.viewOf.set(g, v);
    return v;
  }

  private releaseViews(): void {
    for (const v of this.viewOf.values()) v.hide();
    this.viewOf.clear();
    for (const d of this.decoyViews) d.hide();
  }

  private syncWorld(dt: number): void {
    for (const g of this.run.guards) this.viewFor(g).sync(g, dt);
    const decoys = this.run.decoys;
    while (this.decoyViews.length < decoys.length) this.decoyViews.push(new DecoyView(this.scene, this.enemyMats));
    this.decoyViews.forEach((v, i) => {
      const d = decoys[i];
      if (!d) return v.hide();
      v.reduced = this.reducedEffects;
      v.sync(d, dt);
    });
    this.pickupViews.sync(this.run.pickups.items, dt);
    if (this.run.training) this.trainingProps.sync(this.run.dummies, dt);
    this.exhibitMarkers.update(dt, this.nearExhibit, this.isDiscovered);
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.cam.update(this.player.position, this.player.velocity, dt, aspect);
    for (const s of this.museum.spinners) s.rotation.z += dt * 0.6;
  }

  private react(e: RunEvent): void {
    switch (e.type) {
      case 'pickup':
        this.fx.burst(e.kind === 'heart' ? 'heart' : e.kind === 'rareCoin' ? 'rare' : 'coin', e.pos, 0.7, e.kind === 'coin' ? 12 : 24);
        break;
      case 'hit':
        this.player.hurt(e.dir, HEALTH.knockback);
        this.fx.burst('hit', e.pos, 1.1, 26);
        if (!this.reducedEffects) this.cam.shake(FEEDBACK.hitShake, FEEDBACK.hitShakeSeconds);
        break;
      case 'ability':
        if (e.kind === 'dash') this.player.motor.dash(e.dir, ABILITIES.dash.speed, ABILITIES.dash.duration * this.run.ability.boost);
        if (e.kind === 'shockwave') {
          this.abilityViews.shockwave(e.pos);
          if (!this.reducedEffects) this.cam.shake(0.25, 0.25);
        }
        if (e.kind === 'dash' || e.kind === 'shockwave') this.fx.dustRing(e.pos, e.kind === 'dash' ? 14 : 30);
        break;
      case 'blocked':
        this.abilityViews.pop();
        this.fx.burst('rare', e.pos, 1.1, 20);
        break;
      case 'alert':
      case 'guardJoined':
      case 'windup': {
        const g = this.run.guards[e.guard];
        if (g) this.viewFor(g).flashAlert();
        break;
      }
      case 'bonk':
        this.fx.dustRing(e.pos, 20);
        this.fx.burst('rare', e.pos, 2.2, 10);
        if (!this.reducedEffects) this.cam.shake(0.18, 0.2);
        break;
      case 'illusion':
        this.fx.burst('illusion', e.pos, 1.4, 30);
        break;
      case 'decoyPop':
        this.fx.burst('illusion', e.pos, 1.2, 16);
        break;
      case 'idCard':
        this.fx.burst('rare', e.pos, 0.9, 22);
        break;
      case 'gadgetPickup':
        this.fx.burst('rare', e.pos, 0.9, 18);
        break;
      case 'gadget':
        if (e.kind === 'freeze') this.gadgetViews.freezeWave(e.pos);
        if (e.kind === 'smoke') this.fx.dustRing(e.pos, 30);
        break;
      case 'bubblePop':
        this.gadgetViews.pop();
        this.fx.burst('hit', e.pos, 1.1, 18);
        break;
      default:
        break;
    }
    this.onEvent?.(e);
  }

  /** Projects a world point to CSS pixels on the canvas (for floating score text). */
  toScreen(p: Vec2, y: number): { x: number; y: number } {
    const canvas = this.engine.getRenderingCanvas()!;
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    const v = Vector3.Project(new Vector3(p.x, y, p.z), Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), this.cam.camera.viewport.toGlobal(w, hgt));
    return { x: v.x, y: v.y };
  }

  dispose(): void {
    this.player.dispose();
    this.portal.dispose();
    this.trainingProps.dispose();
    this.exhibitMarkers.dispose();
    this.guide.dispose();
    this.abilityViews.dispose();
    for (const pool of this.viewPool.values()) for (const v of pool) v.dispose();
    for (const d of this.decoyViews) d.dispose();
    this.fx.dispose();
    this.museum.dispose();
    this.scene.dispose();
  }
}
