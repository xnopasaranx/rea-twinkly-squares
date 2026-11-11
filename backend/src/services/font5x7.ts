import * as font from 'oled-font-5x7';

const { fontData, lookup, width, height } = font;
const data = Buffer.from(fontData);

export function charBitmap(ch: string): Buffer | undefined {
  const idx = lookup.indexOf(ch);
  if (idx === -1) return undefined;
  const start = idx * width * height;
  return data.slice(start, start + width * height);
}

export { width, height };
