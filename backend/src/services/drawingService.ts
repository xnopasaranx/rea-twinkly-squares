import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Drawing } from '../types';

const FILENAME = 'drawings.json';

export class DrawingService {
  private file: string;

  constructor(private dataDir: string) {
    this.file = path.join(dataDir, FILENAME);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  private loadAll(): Drawing[] {
    if (!fs.existsSync(this.file)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as Drawing[];
    } catch {
      return [];
    }
  }

  private saveAll(items: Drawing[]) {
    fs.writeFileSync(this.file, JSON.stringify(items, null, 2));
  }

  list(): Drawing[] {
    return this.loadAll();
  }

  get(id: string): Drawing | undefined {
    return this.loadAll().find((d) => d.id === id);
  }

  create(width: number, height: number, name = 'Untitled', frameDelay = 200): Drawing {
    const total = width * height;
    const frame: string[] = Array(total).fill('#000000');
    const now = new Date().toISOString();
    const drawing: Drawing = {
      id: uuidv4(),
      name,
      width,
      height,
      frames: [frame],
      frameDelay,
      createdAt: now,
      updatedAt: now,
    };
    const items = this.loadAll();
    items.push(drawing);
    this.saveAll(items);
    return drawing;
  }

  update(id: string, updates: Partial<Drawing>): Drawing | undefined {
    const items = this.loadAll();
    const idx = items.findIndex((d) => d.id === id);
    if (idx === -1) return undefined;
    const drawing = { ...items[idx], ...updates, updatedAt: new Date().toISOString() };
    items[idx] = drawing;
    this.saveAll(items);
    return drawing;
  }

  addFrame(id: string, cloneFromLast = true): Drawing | undefined {
    const items = this.loadAll();
    const idx = items.findIndex((d) => d.id === id);
    if (idx === -1) return undefined;
    const drawing = items[idx];
    const total = drawing.width * drawing.height;
    const newFrame = cloneFromLast && drawing.frames.length
      ? [...drawing.frames[drawing.frames.length - 1]]
      : Array(total).fill('#000000');
    drawing.frames.push(newFrame);
    drawing.updatedAt = new Date().toISOString();
    this.saveAll(items);
    return drawing;
  }

  delete(id: string): boolean {
    const items = this.loadAll();
    const idx = items.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    this.saveAll(items);
    return true;
  }

  /** Export all drawings as an archive (zip-like is overkill; just the JSON for now). */
  exportAll(): string {
    return JSON.stringify(this.loadAll(), null, 2);
  }

  importAll(json: string): { count: number } {
    const parsed = JSON.parse(json) as Drawing | Drawing[];
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const now = new Date().toISOString();
    for (const d of items) {
      d.createdAt = d.createdAt || now;
      d.updatedAt = now;
    }
    this.saveAll(items);
    return { count: items.length };
  }
}
