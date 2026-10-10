// Facebook-style story text styling, shared by the server (validation, thumbnails) and the browser bundle (composer, viewer).

export const STORY_BACKGROUNDS = ['ocean', 'sunset', 'forest', 'night', 'candy', 'sun', 'aurora', 'fire', 'berry', 'mint', 'charcoal', 'paper'] as const;
export const STORY_FONTS = ['classic', 'serif', 'script', 'typewriter', 'strong', 'retro'] as const;
export const STORY_EFFECTS = ['none', 'shadow', 'outline', 'highlight', 'glow', 'neon'] as const;
export const STORY_ANIMATIONS = ['none', 'fade', 'zoom', 'slide', 'bounce', 'pulse'] as const;
export const STORY_ALIGNS = ['left', 'center', 'right'] as const;
export const STORY_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#ff2d92'] as const;
/** Story videos play for at most this long, like Facebook's per-story limit. */
export const STORY_VIDEO_MAX_SECONDS = 60;

export const STORY_FONT_LABELS: Record<StoryFont, string> = { classic: 'Classic', serif: 'Elegant', script: 'Script', typewriter: 'Typewriter', strong: 'Strong', retro: 'Retro' };
export const STORY_EFFECT_LABELS: Record<StoryEffect, string> = { none: 'Plain', shadow: 'Shadow', outline: 'Outline', highlight: 'Highlight', glow: 'Glow', neon: 'Neon' };
export const STORY_ANIMATION_LABELS: Record<StoryAnimation, string> = { none: 'None', fade: 'Fade in', zoom: 'Zoom', slide: 'Slide up', bounce: 'Bounce', pulse: 'Pulse' };

export type StoryFont = (typeof STORY_FONTS)[number];
export type StoryEffect = (typeof STORY_EFFECTS)[number];
export type StoryAnimation = (typeof STORY_ANIMATIONS)[number];
export type StoryAlign = (typeof STORY_ALIGNS)[number];
/** x / y are the text's centre as a percentage of the card; size scales the base font size. */
export type StoryStyle = { font: StoryFont; color: string; align: StoryAlign; effect: StoryEffect; animation: StoryAnimation; size: number; x: number; y: number };

export const DEFAULT_STORY_STYLE: StoryStyle = { font: 'classic', color: '#ffffff', align: 'center', effect: 'shadow', animation: 'none', size: 1, x: 50, y: 50 };
export const STORY_SIZE_RANGE = { min: 0.5, max: 2.5 } as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);

/** Black or white, whichever reads better on `hex` (used for highlight boxes and outlines). */
export function storyInk(hex: string): '#000000' | '#ffffff' {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
  const [r, g, b] = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? '#000000' : '#ffffff';
}

/** Class list and inline CSS for a styled story text block; `animate` is off for static thumbnails. */
export function storyTextAttrs(style: Partial<StoryStyle> | null | undefined, animate = false): { className: string; style: string } {
  const s = { ...DEFAULT_STORY_STYLE, ...(style || {}) };
  const pick = <T extends string>(list: readonly T[], value: string, fallback: T) => (list.includes(value as T) ? (value as T) : fallback);
  const color = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color.toLowerCase() : DEFAULT_STORY_STYLE.color;
  const animation = pick(STORY_ANIMATIONS, s.animation, 'none');
  const className = ['story-text', `story-font-${pick(STORY_FONTS, s.font, 'classic')}`, `story-fx-${pick(STORY_EFFECTS, s.effect, 'shadow')}`, `story-align-${pick(STORY_ALIGNS, s.align, 'center')}`, animate && animation !== 'none' ? `story-anim-${animation}` : ''].filter(Boolean).join(' ');
  const css = `--story-color:${color};--story-ink:${storyInk(color)};--story-size:${clamp(s.size, STORY_SIZE_RANGE.min, STORY_SIZE_RANGE.max)};left:${clamp(s.x, 0, 100)}%;top:${clamp(s.y, 0, 100)}%`;
  return { className, style: css };
}
