import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { LibraryItem, SearchResult, DeviceConfig } from '../types';
import { processImageToFrames, rgbToPng, buildMovieBinary } from './imageProcessor';
import { gridDimensions } from './settings';

export class LibraryService {
  private libDir: string;
  private cfg: DeviceConfig;

  constructor(private dataDir: string, config: DeviceConfig) {
    this.libDir = path.join(dataDir, 'library');
    this.cfg = config;
    fs.mkdirSync(this.libDir, { recursive: true });
  }

  setConfig(config: DeviceConfig) {
    this.cfg = config;
  }

  private metaPath() {
    return path.join(this.libDir, 'index.json');
  }

  loadIndex(): LibraryItem[] {
    const file = this.metaPath();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as LibraryItem[];
    } catch {
      return [];
    }
  }

  private saveIndex(items: LibraryItem[]) {
    fs.writeFileSync(this.metaPath(), JSON.stringify(items, null, 2));
  }

  list(): LibraryItem[] {
    return this.loadIndex();
  }

  get(id: string): LibraryItem | undefined {
    return this.loadIndex().find((i) => i.id === id);
  }

  private parseHrefDimensions(href: string): { width?: number; height?: number } {
    const decoded = href.replace(/&amp;/g, '&');
    const widthMatch = decoded.match(/[&?]expw=(\d+)/);
    const heightMatch = decoded.match(/[&?]exph=(\d+)/);
    return {
      width: widthMatch ? parseInt(widthMatch[1], 10) : undefined,
      height: heightMatch ? parseInt(heightMatch[1], 10) : undefined,
    };
  }

  /**
   * Search Bing images and parse the inline metadata.
   * When exactSize is true, only results that report the exact configured
   * matrix size are returned.
   */
  async search(
    query: string,
    type: 'gif' | 'pixelart' = 'gif',
    limit = 20,
    exactSize = false
  ): Promise<SearchResult[]> {
    const fullQuery = type === 'gif' ? `${query} gif` : `${query} pixelart`;
    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(fullQuery)}&form=HDRSC2`;
    const resp = await axios.get(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      responseType: 'text',
    });

    const html = resp.data as string;
    const results: SearchResult[] = [];
    const dims = gridDimensions(this.cfg);
    // Match the whole <a class="iusc" ...> tag so we can read the href as well.
    const tagRegex = /<a[^>]+class="iusc"[^>]*m="([^"]+)"[^>]*href="([^"]+)"[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(html)) !== null) {
      try {
        const meta = JSON.parse(m[1].replace(/&quot;/g, '"'));
        const decode = (s: string) => s.replace(/&amp;/g, '&');
        const { width, height } = this.parseHrefDimensions(m[2]);
        const result: SearchResult = {
          title: meta.t || meta.desc || '',
          image: decode(meta.murl),
          thumbnail: decode(meta.turl),
          source: decode(meta.purl || ''),
          width,
          height,
        };
        if (exactSize) {
          if (width === dims.width && height === dims.height) {
            results.push(result);
          }
        } else {
          results.push(result);
        }
      } catch {
        // ignore malformed metadata entries
      }
    }
    return results.slice(0, limit);
  }

  async addFromUrl(url: string, name: string, type: 'gif' | 'pixelart', tags?: string[]): Promise<LibraryItem> {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(resp.data as ArrayBuffer);
    return this.addFromBuffer(buffer, name, type, url, tags);
  }

  async addFromBuffer(
    buffer: Buffer,
    name: string,
    type: 'gif' | 'pixelart' | 'drawing',
    sourceUrl?: string,
    tags?: string[]
  ): Promise<LibraryItem> {
    const dims = gridDimensions(this.cfg);
    const { frames, sourceWidth, sourceHeight, delays } = await processImageToFrames(
      buffer,
      dims.width,
      dims.height
    );

    const id = uuidv4();
    const itemDir = path.join(this.libDir, id);
    fs.mkdirSync(itemDir, { recursive: true });

    const ext = type === 'gif' ? 'original.gif' : 'original.bin';
    const originalPath = path.join(itemDir, ext);
    fs.writeFileSync(originalPath, buffer);

    const frameFiles: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const png = await rgbToPng(frames[i], dims.width, dims.height);
      const file = path.join(itemDir, `frame_${i.toString().padStart(4, '0')}.png`);
      fs.writeFileSync(file, png);
      frameFiles.push(path.relative(this.libDir, file));
    }

    const processedPath = path.join(itemDir, 'frames.bin');
    fs.writeFileSync(processedPath, buildMovieBinary(frames));

    const item: LibraryItem = {
      id,
      name: name || `item-${id.slice(0, 6)}`,
      type,
      sourceUrl,
      thumbnailUrl: `/library/${id}/frame_0000.png`,
      width: dims.width,
      height: dims.height,
      frameDelays: delays,
      frameFiles,
      originalPath: path.relative(this.libDir, originalPath),
      processedPath: path.relative(this.libDir, processedPath),
      createdAt: new Date().toISOString(),
      tags: tags || [],
    };

    const items = this.loadIndex();
    items.push(item);
    this.saveIndex(items);
    return item;
  }

  getProcessedFrames(id: string): Buffer | undefined {
    const item = this.get(id);
    if (!item?.processedPath) return undefined;
    const full = path.join(this.libDir, item.processedPath);
    if (!fs.existsSync(full)) return undefined;
    return fs.readFileSync(full);
  }

  getFramePngPath(id: string, frame = 0): string | undefined {
    const item = this.get(id);
    if (!item?.frameFiles) return undefined;
    const rel = item.frameFiles[frame] || item.frameFiles[0];
    if (!rel) return undefined;
    return path.join(this.libDir, rel);
  }

  delete(id: string): boolean {
    const items = this.loadIndex();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    const [item] = items.splice(idx, 1);
    const itemDir = path.join(this.libDir, item.id);
    if (fs.existsSync(itemDir)) fs.rmSync(itemDir, { recursive: true });
    this.saveIndex(items);
    return true;
  }
}
