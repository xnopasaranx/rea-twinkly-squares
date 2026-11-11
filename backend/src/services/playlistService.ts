import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Playlist } from '../types';

const FILENAME = 'playlists.json';

export class PlaylistService {
  private file: string;

  constructor(private dataDir: string) {
    this.file = path.join(dataDir, FILENAME);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  private loadAll(): Playlist[] {
    if (!fs.existsSync(this.file)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as Playlist[];
    } catch {
      return [];
    }
  }

  private saveAll(items: Playlist[]) {
    fs.writeFileSync(this.file, JSON.stringify(items, null, 2));
  }

  list(): Playlist[] {
    return this.loadAll();
  }

  get(id: string): Playlist | undefined {
    return this.loadAll().find((p) => p.id === id);
  }

  create(name: string): Playlist {
    const playlist: Playlist = {
      id: uuidv4(),
      name,
      entries: [],
      repeat: true,
    };
    const items = this.loadAll();
    items.push(playlist);
    this.saveAll(items);
    return playlist;
  }

  update(id: string, updates: Partial<Playlist>): Playlist | undefined {
    const items = this.loadAll();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    const playlist = { ...items[idx], ...updates };
    items[idx] = playlist;
    this.saveAll(items);
    return playlist;
  }

  delete(id: string): boolean {
    const items = this.loadAll();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    this.saveAll(items);
    return true;
  }

  /** Convert all entries in order to a device-side playlist using library item uuids. */
  toDevicePlaylist(id: string): { entries: { unique_id: string; duration: number }[]; repeat: boolean } | undefined {
    const playlist = this.get(id);
    if (!playlist) return undefined;
    return {
      entries: playlist.entries.map((e) => ({ unique_id: e.itemId, duration: e.durationMs })),
      repeat: playlist.repeat,
    };
  }
}
