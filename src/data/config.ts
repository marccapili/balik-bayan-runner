/** Central tuning values. Change numbers here, not inside systems. */

export const PLAYER_CONFIG = {
  radius: 0.42,
  /** Units per second at full stick / key. */
  maxSpeed: 6.2,
  /** Units per second² while speeding up. */
  acceleration: 38,
  /** Units per second² while letting go (higher = less slippery). */
  deceleration: 46,
  /** Extra braking when reversing direction so turns feel snappy. */
  turnBrake: 70,
  /** How fast the hero faces their travel direction. */
  turnSharpness: 16,
  /** Below this speed the hero is considered idle for animation. */
  idleThreshold: 0.15,
  /** Above this fraction of maxSpeed the run cycle replaces the walk. */
  runThreshold: 0.6,
} as const;

export const CAMERA_CONFIG = {
  /** Downward pitch in degrees (masterprompt target: 45–55). */
  pitchDeg: 52,
  /** Distance from the focus point along the view ray. */
  distance: 14,
  /** Follow smoothing sharpness (frame-rate independent). */
  followSharpness: 7,
  /** Seconds of velocity used to lead the camera ahead of the hero. */
  lookAhead: 0.32,
  lookAheadSharpness: 3.5,
  /** Vertical field of view in landscape. Portrait widens automatically. */
  fovDeg: 42,
  /** Minimum horizontal FOV so portrait phones still see the hallway. */
  minHorizontalFovDeg: 30,
  /** Walls between camera and hero fade to this visibility. */
  occludedVisibility: 0.22,
  occlusionFadeSharpness: 12,
} as const;

export const INPUT_CONFIG = {
  /** Joystick radius in CSS pixels. */
  joystickRadius: 56,
  /** Fraction of radius ignored to stop thumb jitter. */
  joystickDeadzone: 0.12,
} as const;

export const RENDER_CONFIG = {
  /** Caps device pixel ratio on phones so fill-rate stays sane. */
  maxPixelRatio: 2,
  lowQualityPixelRatio: 1,
} as const;
