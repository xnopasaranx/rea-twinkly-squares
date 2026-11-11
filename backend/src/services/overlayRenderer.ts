import { charBitmap, width as CHAR_W, height as CHAR_H } from './font5x7';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const num = parseInt(cleaned, 16);
  if (cleaned.length === 3) {
    const r = ((num >> 8) & 0xf) * 17;
    const g = ((num >> 4) & 0xf) * 17;
    const b = (num & 0xf) * 17;
    return { r, g, b };
  }
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

export interface TextScrollState {
  text: string;
  color: { r: number; g: number; b: number };
  bg: { r: number; g: number; b: number } | null;
  speed: number; // pixels per second
  offset: number; // current scroll offset in pixels
  lastUpdate: number; // ms timestamp
  loop: boolean;
  scratch?: Buffer;
}

/**
 * Measure total pixel width of a string using the 5x7 font (1 pixel gap between chars).
 */
export function textWidth(text: string): number {
  if (!text) return 0;
  return text.length * (CHAR_W + 1) - 1;
}

export function createScrollState(
  text: string,
  colorHex = '#ffffff',
  bgHex = '',
  speed = 8,
  loop = false,
  count = 1
): TextScrollState {
  return {
    text,
    color: hexToRgb(colorHex),
    bg: bgHex ? hexToRgb(bgHex) : null,
    speed,
    offset: 0,
    lastUpdate: Date.now(),
    loop,
  };
}

/**
 * Render a single frame of scrolling text into the given area buffer.
 * Returns true when the message has finished scrolling.
 */
export function renderScrollFrame(state: TextScrollState, width: number, height: number, buffer: Buffer): boolean {
  const now = Date.now();
  const dt = Math.max(0, now - state.lastUpdate) / 1000;
  state.lastUpdate = now;

  // Advance offset.
  state.offset += state.speed * dt;

  // Clear / fill background.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      if (state.bg) {
        buffer[idx] = state.bg.r;
        buffer[idx + 1] = state.bg.g;
        buffer[idx + 2] = state.bg.b;
      } else {
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
      }
    }
  }

  // Draw chars relative to scroll offset. Start at right edge so text scrolls in from right.
  const textW = textWidth(state.text);
  const finished = state.offset > textW + width;
  const startX = width - Math.floor(state.offset);
  const startY = Math.floor((height - CHAR_H) / 2);

  for (let i = 0; i < state.text.length; i++) {
    const ch = state.text[i];
    const bitmap = charBitmap(ch);
    if (!bitmap) continue;
    const cx = startX + i * (CHAR_W + 1);
    for (let gx = 0; gx < CHAR_W; gx++) {
      const screenX = cx + gx;
      if (screenX < 0 || screenX >= width) continue;
      for (let gy = 0; gy < CHAR_H; gy++) {
        const screenY = startY + gy;
        if (screenY < 0 || screenY >= height) continue;
        const bit = bitmap[gx * CHAR_H + gy];
        if (bit) {
          const idx = (screenY * width + screenX) * 3;
          buffer[idx] = state.color.r;
          buffer[idx + 1] = state.color.g;
          buffer[idx + 2] = state.color.b;
        }
      }
    }
  }

  return finished;
}
