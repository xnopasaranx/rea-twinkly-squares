import {
  OverlayArea,
  OverlayMessage,
  MatrixConfig,
  DeviceConfig,
} from '../types';
import { createScrollState, renderScrollFrame, TextScrollState } from './overlayRenderer';
import { v4 as uuidv4 } from 'uuid';

export interface QueuedMessageState {
  text: string;
  color?: string;
  bg?: string;
  speed?: number;
  loop?: boolean;
  count?: number;
  completedCycles: number;
  internalId: string;
  state: TextScrollState;
}

export interface AreaQueue {
  area: OverlayArea;
  messages: QueuedMessageState[];
  current: QueuedMessageState | null;
}

export class OverlayQueueManager {
  private queues: Map<string, AreaQueue> = new Map();

  constructor(private matrix: MatrixConfig) {
    for (const area of matrix.overlays || []) {
      this.queues.set(area.id, { area, messages: [], current: null });
    }
  }

  updateAreas(areas: OverlayArea[]) {
    const next = new Map<string, AreaQueue>();
    for (const area of areas) {
      const existing = this.queues.get(area.id);
      next.set(area.id, {
        area,
        messages: existing ? existing.messages.slice() : [],
        current: existing ? existing.current : null,
      });
    }
    this.queues = next;
  }

  push(areaId: string, msg: OverlayMessage): QueuedMessageState | null {
    const queue = this.queues.get(areaId);
    if (!queue) return null;

    const area = queue.area;
    const item: QueuedMessageState = {
      ...msg,
      internalId: uuidv4(),
      completedCycles: 0,
      state: createScrollState(
        msg.text,
        msg.color || area.defaultColor,
        msg.bg ?? area.defaultBg,
        msg.speed ?? area.defaultSpeed,
        msg.loop,
        msg.count
      ),
    };

    // Enforce max queue size by evicting oldest queued message (not the one currently playing).
    while (queue.messages.length >= Math.max(1, area.maxQueueSize)) {
      queue.messages.shift();
    }
    queue.messages.push(item);
    return item;
  }

  clear(areaId: string) {
    const queue = this.queues.get(areaId);
    if (!queue) return;
    queue.messages = [];
    queue.current = null;
  }

  getAllQueues(): AreaQueue[] {
    return Array.from(this.queues.values());
  }

  getQueue(areaId: string): AreaQueue | undefined {
    return this.queues.get(areaId);
  }

  /**
   * Render all overlay areas into a single matrix-sized RGB buffer.
   * `baseBuffer` is the current content in raster order (width*height*3).
   * It is mutated/overlaid in the defined areas.
   */
  renderFrame(
    baseBuffer: Buffer,
    matrixWidth: number,
    matrixHeight: number,
    deviceConfig: DeviceConfig
  ): Buffer {
    const dims = {
      width: deviceConfig.gridCols * deviceConfig.panelCols,
      height: deviceConfig.gridRows * deviceConfig.panelRows,
    };
    if (baseBuffer.length !== dims.width * dims.height * 3) {
      // If base buffer dimensions mismatch (e.g. no active source), create black.
      baseBuffer = Buffer.alloc(dims.width * dims.height * 3);
    }

    // Dimensions must match expected matrix size for overlay placement.
    if (matrixWidth !== dims.width || matrixHeight !== dims.height) {
      return baseBuffer;
    }

    for (const queue of this.queues.values()) {
      this.advanceQueue(queue);
      if (!queue.current) continue;
      this.renderOverlayArea(queue.current, queue.area, baseBuffer, dims.width, dims.height);
    }

    return baseBuffer;
  }

  private advanceQueue(queue: AreaQueue) {
    if (queue.current) {
      const scratch = queue.current.state.scratch;
      const finished = scratch
        ? renderScrollFrame(queue.current.state, queue.area.width, queue.area.height, scratch)
        : false;
      if (finished) {
        queue.current.completedCycles++;
        if (!queue.current.loop && queue.current.completedCycles >= (queue.current.count || 1)) {
          queue.current = null;
        } else {
          // Loop: reset scroll offset and timestamp.
          queue.current.state.offset = 0;
          queue.current.state.lastUpdate = Date.now();
        }
      }
    }

    if (!queue.current && queue.messages.length > 0) {
      queue.current = queue.messages.shift()!;
      queue.current.state.scratch = Buffer.alloc(queue.area.width * queue.area.height * 3);
    }
  }

  private renderOverlayArea(
    current: QueuedMessageState,
    area: OverlayArea,
    target: Buffer,
    matrixWidth: number,
    matrixHeight: number
  ) {
    const scratch = current.state.scratch;
    if (!scratch) return;
    // Copy scratch into target at area position (clip to matrix bounds).
    const x0 = Math.max(0, Math.min(area.x, matrixWidth - 1));
    const y0 = Math.max(0, Math.min(area.y, matrixHeight - 1));
    const w = Math.min(area.width, matrixWidth - x0);
    const h = Math.min(area.height, matrixHeight - y0);
    const srcW = area.width;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * srcW + x) * 3;
        // If background is transparent, only overwrite non-black (lit) pixels.
        if (!current.state.bg) {
          if (scratch[srcIdx] === 0 && scratch[srcIdx + 1] === 0 && scratch[srcIdx + 2] === 0) {
            continue;
          }
        }
        const dstIdx = ((y0 + y) * matrixWidth + (x0 + x)) * 3;
        target[dstIdx] = scratch[srcIdx];
        target[dstIdx + 1] = scratch[srcIdx + 1];
        target[dstIdx + 2] = scratch[srcIdx + 2];
      }
    }
  }
}
