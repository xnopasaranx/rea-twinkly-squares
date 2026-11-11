import sharp from 'sharp';
import { GifReader } from 'omggif';
import { MovieFrame } from '../types';

const CHANNELS = 3;

function scaleNearestNeighbor(
  src: Buffer,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  channels: number
): Buffer {
  const dst = Buffer.alloc(dstW * dstH * channels);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(Math.floor(y * yRatio), srcH - 1);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(Math.floor(x * xRatio), srcW - 1);
      const srcIdx = (sy * srcW + sx) * channels;
      const dstIdx = (y * dstW + x) * channels;
      for (let c = 0; c < channels; c++) {
        dst[dstIdx + c] = src[srcIdx + c];
      }
    }
  }
  return dst;
}

function stripAlpha(src: Buffer, width: number, height: number): Buffer {
  const dst = Buffer.alloc(width * height * CHANNELS);
  for (let i = 0; i < width * height; i++) {
    dst[i * CHANNELS] = src[i * 4];
    dst[i * CHANNELS + 1] = src[i * 4 + 1];
    dst[i * CHANNELS + 2] = src[i * 4 + 2];
  }
  return dst;
}

async function decodeStaticImage(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  return {
    data: stripAlpha(raw, meta.width!, meta.height!),
    width: meta.width!,
    height: meta.height!,
  };
}

function decodeGif(buffer: Buffer): { frames: Buffer[]; widths: number[]; heights: number[]; delays: number[] } {
  const reader = new GifReader(buffer);
  const frames: Buffer[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  const delays: number[] = [];

  const width = reader.width;
  const height = reader.height;

  for (let i = 0; i < reader.numFrames(); i++) {
    const frameInfo = reader.frameInfo(i);
    const frame = Buffer.alloc(width * height * 4);
    reader.decodeAndBlitFrameRGBA(i, frame);
    frames.push(stripAlpha(frame, width, height));
    widths.push(width);
    heights.push(height);
    delays.push(frameInfo.delay * 10); // gif delay is in 1/100s
  }

  return { frames, widths, heights, delays };
}

function isGif(buffer: Buffer): boolean {
  return buffer.slice(0, 3).toString('ascii') === 'GIF';
}

export async function processImageToFrames(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<{ frames: Buffer[]; sourceWidth: number; sourceHeight: number; delays: number[] }> {
  let rawFrames: Buffer[] = [];
  let sourceWidth = 0;
  let sourceHeight = 0;
  let delays: number[] = [];

  if (isGif(buffer)) {
    const gif = decodeGif(buffer);
    rawFrames = gif.frames;
    sourceWidth = gif.widths[0] || targetWidth;
    sourceHeight = gif.heights[0] || targetHeight;
    delays = gif.delays;
  } else {
    const img = await decodeStaticImage(buffer);
    rawFrames = [img.data];
    sourceWidth = img.width;
    sourceHeight = img.height;
    delays = [0];
  }

  const scaled = rawFrames.map((frame) =>
    scaleNearestNeighbor(frame, sourceWidth, sourceHeight, targetWidth, targetHeight, CHANNELS)
  );

  return { frames: scaled, sourceWidth, sourceHeight, delays };
}

/**
 * Map a flat raster RGB buffer to the device's native LED order using the
 * layout coordinates. `ledToPixel[i]` is the raster pixel index that feeds LED i.
 */
export function rasterToDeviceFrame(raster: Buffer, ledToPixel: number[]): Buffer {
  const n = ledToPixel.length;
  const frame = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const px = ledToPixel[i] * 3;
    frame[i * 3] = raster[px];
    frame[i * 3 + 1] = raster[px + 1];
    frame[i * 3 + 2] = raster[px + 2];
  }
  return frame;
}

/**
 * Build a lookup table: for each LED index, the raster pixel index (y*width+x).
 * Coordinates are assumed to be Twinkly layout normalized values; they are
 * scaled to the target grid and rounded to the nearest cell.
 */
export function buildLedToPixelMapping(coords: { x: number; y: number; z: number }[], width: number, height: number): number[] {
  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scaleX = maxX === minX ? 1 : maxX - minX;
  const scaleY = maxY === minY ? 1 : maxY - minY;

  return coords.map((c) => {
    const nx = Math.min(width - 1, Math.max(0, Math.round(((c.x - minX) / scaleX) * (width - 1))));
    const ny = Math.min(height - 1, Math.max(0, Math.round(((c.y - minY) / scaleY) * (height - 1))));
    return ny * width + nx;
  });
}

/** Build full movie binary from frame RGB buffers (3 bytes per LED, frames concatenated). */
export function buildMovieBinary(frames: Buffer[]): Buffer {
  let total = 0;
  for (const f of frames) total += f.length;
  const out = Buffer.alloc(total);
  let offset = 0;
  for (const f of frames) {
    f.copy(out, offset);
    offset += f.length;
  }
  return out;
}

/** Reverse mapping: create a flat raster RGB from a frame buffer. */
export function deviceFrameToRaster(frame: Buffer, ledToPixel: number[], width: number, height: number): Buffer {
  const raster = Buffer.alloc(width * height * 3);
  for (let i = 0; i < ledToPixel.length; i++) {
    const px = ledToPixel[i] * 3;
    raster[px] = frame[i * 3];
    raster[px + 1] = frame[i * 3 + 1];
    raster[px + 2] = frame[i * 3 + 2];
  }
  return raster;
}

/**
 * Generate a PNG thumbnail from raw RGB data.
 */
export async function rgbToPng(rgb: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

export { scaleNearestNeighbor, stripAlpha };
