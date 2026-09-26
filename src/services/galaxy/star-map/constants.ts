// Camera scale, in pixels per radian at the tangent point.
export const INITIAL_SCALE = 400;
export const MIN_SCALE = 400;
export const MAX_SCALE = 10000000;

// Radius of the shared glow texture in logical pixels. Sprite scale=1 renders
// a star this big; per-star brightness and per-frame zoom scale multiply it.
export const GLOW_TEXTURE_RADIUS = 16;

// Cap on the glow texture's edge in physical pixels when re-baked for deep zoom.
export const GLOW_MAX_TEXTURE_PX = 4096;

// Largest star radius at INITIAL_SCALE, in logical pixels (brightest stars).
export const STAR_MAX_RADIUS_PX = 5;

// Star tint fallbacks used for CLAIMED rows — real stars use their catalog K.
export const PRIME_STAR_COLOR = 0xffd166;
export const STANDARD_STAR_COLOR = 0x8ecae6;
export const SELECTION_RING_COLOR = 0xffffff;

// Canvas background.
export const BACKGROUND_COLOR = 0x02040a;

// Input tuning.
export const DRAG_THRESHOLD_PX = 3;
export const HIT_TEST_MIN_RADIUS_PX = 6;
export const HIT_TEST_EXTRA_PX = 4;
export const WHEEL_ZOOM_FACTOR = 1.0015;
export const ZOOM_CORRECTION_TOLERANCE = 0.25;
export const ZOOM_CORRECTION_MAX_ITERATIONS = 4;
export const KEYBOARD_PAN_STEP_PX = 40;
export const KEYBOARD_PAN_SHIFT_MULTIPLIER = 3;

// Animation.
export const CAMERA_ANIMATION_MS = 700;

// Ring adornment offsets in screen pixels.
export const CLAIMED_RING_OFFSET_PX = 4;
export const SELECTION_RING_OFFSET_PX = 8;
