import { MatrixConfig, DeviceConfig, LibraryItem, Drawing } from '../types';
import { TwinklyClient } from './twinklyClient';
import { OverlayQueueManager } from './overlayQueue';
import { LibraryService } from './libraryService';
import { DrawingService } from './drawingService';
import { gridDimensions, totalLeds } from './settings';
import { normalizeCoords, buildRectLayout, rectLayoutPayload } from './layoutBuilder';
import {
  rasterToDeviceFrame,
  buildLedToPixelMapping,
} from './imageProcessor';


type BaseSource =
  | { type: 'library'; id: string }
  | { type: 'drawing'; id: string; frame?: number }
  | { type: 'color'; r: number; g: number; b: number }
  | { type: 'off' };

export class MatrixComposer {
  private client: TwinklyClient;
  private queue: OverlayQueueManager;
  private baseSource: BaseSource = { type: 'off' };
  private running = false;
  private frameTimer: NodeJS.Timeout | null = null;
  private lastFrameTime = 0;

  constructor(
    public matrix: MatrixConfig,
    private libraryService: LibraryService,
    private drawingService: DrawingService,
    private initialClient?: TwinklyClient
  ) {
    this.client =
      initialClient || new TwinklyClient(matrix.device.ip, matrix.device.mac || undefined);
    this.queue = new OverlayQueueManager(matrix);
  }

  get deviceConfig(): DeviceConfig {
    return this.matrix.device;
  }

  get dims() {
    return gridDimensions(this.matrix.device);
  }

  private getMapping(): number[] {
    const { gridCols, gridRows, panelCols, panelRows, panelOrientations, panelChain } =
      this.matrix.device;
    const { width, height } = this.dims;
    const coords = rectLayoutPayload(
      gridCols,
      gridRows,
      panelCols,
      panelRows,
      panelOrientations || [],
      panelChain || []
    ).coordinates;
    return buildLedToPixelMapping(coords, width, height);
  }

  private renderBaseFrame(): Buffer {
    const { width, height } = this.dims;
    const size = width * height * 3;

    switch (this.baseSource.type) {
      case 'library': {
        const bin = this.libraryService.getProcessedFrames(this.baseSource.id);
        if (!bin || bin.length === 0) return Buffer.alloc(size);
        const frameSize = size;
        const frameIdx = Math.floor((Date.now() / 1000) * 10) % Math.max(1, Math.floor(bin.length / frameSize));
        return bin.slice(frameIdx * frameSize, (frameIdx + 1) * frameSize);
      }
      case 'drawing': {
        const drawing = this.drawingService.get(this.baseSource.id);
        if (!drawing) return Buffer.alloc(size);
        const frame = drawing.frames[this.baseSource.frame ?? 0] || drawing.frames[0];
        if (!frame) return Buffer.alloc(size);
        return this.rasterFromHexFrame(frame, width, height);
      }
      case 'color': {
        const buf = Buffer.alloc(size);
        for (let i = 0; i < width * height; i++) {
          buf[i * 3] = this.baseSource.r;
          buf[i * 3 + 1] = this.baseSource.g;
          buf[i * 3 + 2] = this.baseSource.b;
        }
        return buf;
      }
      case 'off':
      default:
        return Buffer.alloc(size);
    }
  }

  private rasterFromHexFrame(frame: string[], width: number, height: number): Buffer {
    const buf = Buffer.alloc(width * height * 3);
    for (let i = 0; i < Math.min(frame.length, width * height); i++) {
      const hex = frame[i] || '#000000';
      const num = parseInt(hex.replace('#', ''), 16);
      buf[i * 3] = (num >> 16) & 0xff;
      buf[i * 3 + 1] = (num >> 8) & 0xff;
      buf[i * 3 + 2] = num & 0xff;
    }
    return buf;
  }

  setClient(client: TwinklyClient) {
    this.client.closeRealtimeSocket();
    this.client = client;
  }

  updateMatrix(matrix: MatrixConfig) {
    this.matrix = matrix;
    this.queue.updateAreas(matrix.overlays || []);
  }

  setBaseSource(source: BaseSource) {
    this.baseSource = source;
  }

  pushOverlay(areaId: string, text: string, opts?: Partial<{
    color?: string;
    bg?: string;
    speed?: number;
    loop?: boolean;
    count?: number;
  }>) {
    return this.queue.push(areaId, {
      text,
      color: opts?.color,
      bg: opts?.bg,
      speed: opts?.speed,
      loop: opts?.loop,
      count: opts?.count,
    });
  }

  clearOverlays(areaId?: string) {
    if (areaId) {
      this.queue.clear(areaId);
    } else {
      for (const q of this.queue.getAllQueues()) {
        this.queue.clear(q.area.id);
      }
    }
  }

  getQueues(): Array<{
    areaId: string;
    current: { text: string; color?: string; bg?: string; speed?: number; loop?: boolean; count?: number; completedCycles: number } | null;
    queued: number;
  }> {
    return this.queue.getAllQueues().map((q) => {
      const cur = q.current;
      return {
        areaId: q.area.id,
        current: cur
          ? {
              text: cur.text,
              color: cur.color,
              bg: cur.bg,
              speed: cur.speed,
              loop: cur.loop,
              count: cur.count,
              completedCycles: cur.completedCycles,
            }
          : null,
        queued: q.messages.length,
      };
    });
  }

  async start(fps = 30) {
    if (this.running) return;
    this.running = true;
    try {
      await this.client.setMode('rt');
    } catch (e: any) {
      console.warn('[composer] could not set rt mode', e.message);
    }
    const interval = 1000 / fps;
    this.lastFrameTime = Date.now();

    const tick = async () => {
      if (!this.running) return;
      const now = Date.now();
      const elapsed = now - this.lastFrameTime;
      if (elapsed >= interval) {
        this.lastFrameTime = now - (elapsed % interval);
        await this.renderAndSend();
      }
      this.frameTimer = setTimeout(tick, Math.max(0, interval - (Date.now() - this.lastFrameTime)));
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.frameTimer = null;
    try {
      this.client.closeRealtimeSocket();
    } catch {}
  }

  private async renderAndSend() {
    try {
      const { width, height } = this.dims;
      const raster = this.renderBaseFrame();
      const composited = this.queue.renderFrame(raster, width, height, this.matrix.device);
      const mapping = this.getMapping();
      const deviceFrame = rasterToDeviceFrame(composited, mapping);
      await this.client.sendRealtimeFrame(deviceFrame);
    } catch (e: any) {
      console.warn('[composer] frame send failed', e.message);
    }
  }
}
