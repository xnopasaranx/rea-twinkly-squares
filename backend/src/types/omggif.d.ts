declare module 'omggif' {
  export interface FrameInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    delay: number;
    disposal: number;
    has_local_palette: boolean;
  }

  export class GifReader {
    width: number;
    height: number;
    numFrames(): number;
    frameInfo(index: number): FrameInfo;
    decodeAndBlitFrameRGBA(index: number, pixels: Uint8Array | Buffer): void;
    constructor(buffer: Buffer | Uint8Array);
  }

  export class GifWriter {
    constructor(buffer: Buffer | Uint8Array, width: number, height: number, gopts?: { palette?: number[]; background?: number });
    addFrame(x: number, y: number, width: number, height: number, indexedPixels: number[], opts?: any): number;
  }
}
