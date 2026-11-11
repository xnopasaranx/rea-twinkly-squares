import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { TwinklyClient } from './services/twinklyClient';
import { loadSettings, saveSettings, totalLeds, gridDimensions, AppSettings } from './services/settings';
import { DeviceConfig } from './types';
import { LibraryService } from './services/libraryService';
import { PlaylistService } from './services/playlistService';
import { DrawingService } from './services/drawingService';
import { rectLayoutPayload, buildRectLayout, normalizeCoords } from './services/layoutBuilder';
import {
  buildLedToPixelMapping,
  rasterToDeviceFrame,
} from './services/imageProcessor';
import { estimateGridDimensions } from './services/gridDetector';

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DEFAULT_DEVICE_IP = process.env.TWINKLY_DEFAULT_IP || '192.168.2.50';

fs.mkdirSync(DATA_DIR, { recursive: true });

let settings = loadSettings(DATA_DIR, DEFAULT_DEVICE_IP);

const libraryService = new LibraryService(DATA_DIR, settings.device);
const playlistService = new PlaylistService(DATA_DIR);
const drawingService = new DrawingService(DATA_DIR);

let twinklyClient = new TwinklyClient(settings.device.ip, settings.device.mac || undefined);

function refreshClient() {
  twinklyClient.closeRealtimeSocket();
  twinklyClient = new TwinklyClient(settings.device.ip, settings.device.mac || undefined);
}

function updateSettings(partial: Partial<AppSettings>) {
  settings = { ...settings, ...partial };
  saveSettings(DATA_DIR, settings);
  libraryService.setConfig(settings.device);
  refreshClient();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ----------------------- helpers -----------------------

/**
 * Build the raster -> native LED order mapping for the currently configured
 * panel layout (panel sizes, panel grid, orientations and cable-chain order).
 *
 * We do not read the coordinates back from the hardware because Twinkly
 * Squares firmware stores a low-resolution / panel-level synthesis of the
 * layout. Using our own high-resolution synthesized coordinates guarantees
 * that movies, real-time previews and drawings are transformed with exactly
 * the same layout that the test pattern uses.
 */
function getCurrentDeviceMapping(): number[] {
  const { gridCols, gridRows, panelCols, panelRows, panelOrientations, panelChain } = settings.device;
  const { width, height } = gridDimensions(settings.device);
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

// ----------------------- device routes -----------------------

app.get('/api/status', async (req, res) => {
  try {
    const [gestalt, mode, status] = await Promise.all([
      twinklyClient.gestalt().then((g) => ({ ok: true, data: g })).catch((e) => ({ ok: false, error: e.message })),
      twinklyClient.getMode().then((m) => ({ ok: true, data: m })).catch((e) => ({ ok: false, error: e.message })),
      twinklyClient.status().then((s) => ({ ok: true, data: s })).catch((e) => ({ ok: false, error: e.message })),
    ]);
    const dims = gridDimensions(settings.device);
    res.json({
      gestalt,
      mode,
      status,
      settings: settings.device,
      configured: { leds: totalLeds(settings.device), width: dims.width, height: dims.height },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const { ip, mac, panelCols, panelRows, gridCols, gridRows, panelOrientations, panelChain } = req.body;
  const device: DeviceConfig = {
    ip: ip || settings.device.ip,
    mac: mac || settings.device.mac,
    panelCols: panelCols ?? settings.device.panelCols,
    panelRows: panelRows ?? settings.device.panelRows,
    gridCols: gridCols ?? settings.device.gridCols,
    gridRows: gridRows ?? settings.device.gridRows,
    panelOrientations: panelOrientations ?? settings.device.panelOrientations,
    panelChain: panelChain ?? settings.device.panelChain,
  };
  updateSettings({ device });
  res.json(settings);
});

app.get('/api/device/brightness', async (req, res) => {
  try {
    const b = await twinklyClient.getBrightness();
    res.json(b);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/device/brightness', async (req, res) => {
  try {
    const { value, absolute = true, enabled = true } = req.body;
    const r = await twinklyClient.setBrightness(value, absolute, enabled);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/device/mode', async (req, res) => {
  try {
    const { mode, effectId } = req.body;
    const r = await twinklyClient.setMode(mode, effectId);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/device/static-color', async (req, res) => {
  try {
    const { r, g, b } = req.body;
    const result = await twinklyClient.setStaticColor(r, g, b);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/device/layout', async (req, res) => {
  try {
    const layout = await twinklyClient.getLayout();
    res.json(layout);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/device/layout', async (req, res) => {
  try {
    const layout = rectLayoutPayload(
      settings.device.gridCols,
      settings.device.gridRows,
      settings.device.panelCols,
      settings.device.panelRows,
      settings.device.panelOrientations,
      settings.device.panelChain
    );
    const r = await twinklyClient.setLayout(layout);
    res.json({ ...r, layout });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/device/layout', async (req, res) => {
  try {
    const r = await twinklyClient.deleteLayout();
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const DIGIT_3X5: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '001'],
};

function drawPanelNumber(
  raster: Buffer,
  width: number,
  panelX: number,
  panelY: number,
  panelCols: number,
  panelRows: number,
  label: string
) {
  const glyphCols = 3;
  const glyphRows = 5;
  const gap = 1;
  const totalWidth = label.length * glyphCols + (label.length - 1) * gap;
  let startX = panelX + Math.floor((panelCols - totalWidth) / 2);
  let startY = panelY + Math.floor((panelRows - glyphRows) / 2);
  startX = Math.max(panelX, Math.min(startX, panelX + panelCols - totalWidth));
  startY = Math.max(panelY, Math.min(startY, panelY + panelRows - glyphRows));

  for (let ci = 0; ci < label.length; ci++) {
    const glyph = DIGIT_3X5[label[ci]];
    if (!glyph) continue;
    for (let row = 0; row < glyphRows; row++) {
      const line = glyph[row];
      for (let col = 0; col < glyphCols; col++) {
        if (line[col] !== '1') continue;
        const gx = startX + ci * (glyphCols + gap) + col;
        const gy = startY + row;
        const idx = (gy * width + gx) * 3;
        raster[idx] = 255;
        raster[idx + 1] = 255;
        raster[idx + 2] = 255;
      }
    }
  }
}

/**
 * Send a test pattern to the matrix in realtime mode.
 * The optional `panelOrientations` / `panelChain` body fields let you preview a
 * layout before saving it. Each panel shows a red top edge, a green left edge
 * and its cable index number so the physical panels can be identified and
 * oriented.
 */
app.post('/api/device/test-pattern', async (req, res) => {
  try {
    const orientations = req.body?.panelOrientations || settings.device.panelOrientations || [];
    const chain = req.body?.panelChain || settings.device.panelChain || [];
    const { width, height } = gridDimensions(settings.device);

    const coords = normalizeCoords(
      buildRectLayout(
        settings.device.gridCols,
        settings.device.gridRows,
        settings.device.panelCols,
        settings.device.panelRows,
        orientations,
        chain
      )
    );
    const mapping = buildLedToPixelMapping(coords, width, height);

    const raster = Buffer.alloc(width * height * 3);
    const pc = settings.device.panelCols;
    const pr = settings.device.panelRows;

    for (let py = 0; py < settings.device.gridRows; py++) {
      for (let px = 0; px < settings.device.gridCols; px++) {
        const pos = py * settings.device.gridCols + px;
        const cableIdx = chain[pos] ?? pos;
        const label = String(cableIdx + 1);

        for (let y = 0; y < pr; y++) {
          for (let x = 0; x < pc; x++) {
            const gx = px * pc + x;
            const gy = py * pr + y;
            const idx = (gy * width + gx) * 3;
            let r = 0;
            let g = 0;
            const b = 0;
            if (x === 0) g = 255;
            else if (y === 0) r = 255;
            raster[idx] = r;
            raster[idx + 1] = g;
            raster[idx + 2] = b;
          }
        }
        drawPanelNumber(raster, width, px * pc, py * pr, pc, pr, label);
      }
    }

    const frame = rasterToDeviceFrame(raster, mapping);
    await twinklyClient.setMode('rt');
    await twinklyClient.sendRealtimeFrame(frame);
    res.json({ sent: true, width, height });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/device/detect-grid', async (req, res) => {
  try {
    const info = await twinklyClient.gestalt();
    const layout = await twinklyClient.getLayout();
    const dims = estimateGridDimensions(layout.coordinates, info.number_of_led);
    res.json({ leds: info.number_of_led, dims });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/device/movies', async (req, res) => {
  try {
    const movies = await twinklyClient.getMovies();
    res.json(movies);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/device/movies', async (req, res) => {
  try {
    await twinklyClient.setMode('off');
    const result = await twinklyClient.deleteMovies();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/device/playlist', async (req, res) => {
  try {
    await twinklyClient.setMode('off');
    const result = await twinklyClient.deletePlaylist();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------- library routes -----------------------

app.get('/api/library', (req, res) => {
  res.json(libraryService.list());
});

app.post('/api/library/search', async (req, res) => {
  try {
    const { query, type = 'gif', limit = 20, exactSize = false } = req.body;
    const results = await libraryService.search(query, type, limit, exactSize);
    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/library/add-url', async (req, res) => {
  try {
    const { url, name, type, tags } = req.body;
    const item = await libraryService.addFromUrl(url, name, type, tags);
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/library/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const { name, type = 'pixelart', tags } = req.body;
    const item = await libraryService.addFromBuffer(req.file.buffer, name || req.file.originalname, type, undefined, tags);
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/library/:id', (req, res) => {
  const ok = libraryService.delete(req.params.id);
  res.json({ ok });
});

app.get('/api/library/:id/frame/:idx', (req, res) => {
  const file = libraryService.getFramePngPath(req.params.id, parseInt(req.params.idx, 10));
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Frame not found' });
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.resolve(file));
});

// ----------------------- realtime player -----------------------

let rtInterval: NodeJS.Timeout | null = null;

app.post('/api/rt/play/:id', async (req, res) => {
  try {
    if (rtInterval) {
      clearInterval(rtInterval);
      rtInterval = null;
    }

    const item = libraryService.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const bin = libraryService.getProcessedFrames(req.params.id);
    if (!bin) return res.status(404).json({ error: 'Processed frames missing' });

    const n = totalLeds(settings.device);
    const frameSize = n * 3;
    const frames: Buffer[] = [];
    for (let offset = 0; offset < bin.length; offset += frameSize) {
      frames.push(bin.slice(offset, offset + frameSize));
    }
    if (!frames.length) return res.status(400).json({ error: 'No frames' });

    const mapping = getCurrentDeviceMapping();
    const deviceFrames = frames.map((f) => rasterToDeviceFrame(f, mapping));

    await twinklyClient.setMode('rt');

    let frameIdx = 0;
    const delayMs = item.frameDelays?.[0] ? Math.max(50, item.frameDelays[0]) : 200;

    rtInterval = setInterval(async () => {
      try {
        const frame = deviceFrames[frameIdx % deviceFrames.length];
        await twinklyClient.sendRealtimeFrame(frame);
        frameIdx++;
      } catch (e: any) {
        console.error('[rt] error', e.message);
      }
    }, delayMs);

    res.json({ playing: true, frames: deviceFrames.length, delayMs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rt/stop', async (req, res) => {
  if (rtInterval) {
    clearInterval(rtInterval);
    rtInterval = null;
  }
  try {
    await twinklyClient.setMode('movie');
  } catch {}
  res.json({ playing: false });
});

// ----------------------- movie upload routes -----------------------

app.post('/api/movie/upload/:id', async (req, res) => {
  try {
    const item = libraryService.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const bin = libraryService.getProcessedFrames(req.params.id);
    if (!bin) return res.status(404).json({ error: 'Processed frames missing' });

    const mapping = getCurrentDeviceMapping();

    const n = totalLeds(settings.device);
    const frameSize = n * 3;
    const rasterFrames: Buffer[] = [];
    for (let offset = 0; offset < bin.length; offset += frameSize) {
      rasterFrames.push(bin.slice(offset, offset + frameSize));
    }
    const deviceFrames = rasterFrames.map((f) => rasterToDeviceFrame(f, mapping));
    const movieBin = Buffer.concat(deviceFrames);
    const framesCount = deviceFrames.length;
    const delay = item.frameDelays?.[0] || 200;

    await twinklyClient.setMode('movie');
    const upload = await twinklyClient.uploadMovie(movieBin);
    await twinklyClient.setMovieConfig(delay, Math.floor(framesCount), n);

    res.json({ upload, frames: framesCount, delay });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/movie/upload-raw', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const { name, type = 'pixelart' } = req.body;
    const item = await libraryService.addFromBuffer(req.file.buffer, name || req.file.originalname, type);
    const bin = libraryService.getProcessedFrames(item.id)!;

    const mapping = getCurrentDeviceMapping();

    const n = totalLeds(settings.device);
    const frameSize = n * 3;
    const rasterFrames: Buffer[] = [];
    for (let offset = 0; offset < bin.length; offset += frameSize) {
      rasterFrames.push(bin.slice(offset, offset + frameSize));
    }
    const deviceFrames = rasterFrames.map((f) => rasterToDeviceFrame(f, mapping));
    const movieBin = Buffer.concat(deviceFrames);
    const framesCount = deviceFrames.length;
    const delay = item.frameDelays?.[0] || 200;

    await twinklyClient.setMode('movie');
    const upload = await twinklyClient.uploadMovie(movieBin);
    await twinklyClient.setMovieConfig(delay, Math.floor(framesCount), n);

    res.json({ upload, item, frames: framesCount, delay });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------- playlists -----------------------

app.get('/api/playlists', (req, res) => {
  res.json(playlistService.list());
});

app.post('/api/playlists', (req, res) => {
  const { name } = req.body;
  const p = playlistService.create(name);
  res.json(p);
});

app.put('/api/playlists/:id', (req, res) => {
  const updated = playlistService.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

app.delete('/api/playlists/:id', (req, res) => {
  const ok = playlistService.delete(req.params.id);
  res.json({ ok });
});

app.post('/api/playlists/:id/apply', async (req, res) => {
  try {
    const playlist = playlistService.get(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Not found' });

    const entries: { unique_id: string; duration: number }[] = [];
    for (const entry of playlist.entries) {
      const item = libraryService.get(entry.itemId);
      if (!item) continue;
      const bin = libraryService.getProcessedFrames(entry.itemId);
      if (!bin) continue;

      const mapping = getCurrentDeviceMapping();

      const n = totalLeds(settings.device);
      const frameSize = n * 3;
      const rasterFrames: Buffer[] = [];
      for (let offset = 0; offset < bin.length; offset += frameSize) {
        rasterFrames.push(bin.slice(offset, offset + frameSize));
      }
      const deviceFrames = rasterFrames.map((f) => rasterToDeviceFrame(f, mapping));
      const movieBin = Buffer.concat(deviceFrames);
      const framesCount = deviceFrames.length;
      const rawFps = item.frameDelays?.[0] ? Math.round(1000 / item.frameDelays[0]) : 5;
      const fps = Math.max(1, rawFps);
      const deviceName = item.name.slice(0, 32);

      // Generate a fresh device-side unique ID each time. The Twinkly device
      // rejects re-using an existing unique_id for /movies/new, and its
      // DELETE /movies endpoint does not clear movies on this hardware.
      const movieUid = uuidv4();
      try {
        await twinklyClient.setMoviesNew(deviceName, movieUid, 'rgb_raw', n, Math.floor(framesCount), fps);
        await twinklyClient.uploadMovieList(movieBin);
        entries.push({ unique_id: movieUid, duration: Math.round(entry.durationMs / 1000) });
      } catch (e: any) {
        console.warn('[playlist] failed to upload entry', item.id, e.message);
      }
    }

    await twinklyClient.setPlaylist(entries);
    await twinklyClient.setMode('playlist');
    res.json({ applied: entries.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------- drawings -----------------------

app.get('/api/drawings', (req, res) => {
  res.json(drawingService.list());
});

app.post('/api/drawings', (req, res) => {
  const { width, height, name, frameDelay } = req.body;
  const d = drawingService.create(width, height, name, frameDelay);
  res.json(d);
});

app.get('/api/drawings/:id', (req, res) => {
  const d = drawingService.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

app.put('/api/drawings/:id', (req, res) => {
  const d = drawingService.update(req.params.id, req.body);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

app.delete('/api/drawings/:id', (req, res) => {
  const ok = drawingService.delete(req.params.id);
  res.json({ ok });
});

app.post('/api/drawings/:id/frame', (req, res) => {
  const d = drawingService.addFrame(req.params.id, req.body.cloneFromLast ?? true);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

app.get('/api/drawings/:id/download', (req, res) => {
  const d = drawingService.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Disposition', `attachment; filename="${d.name}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(d, null, 2));
});

app.post('/api/drawings/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const json = req.file.buffer.toString('utf8');
    const result = drawingService.importAll(json);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/drawings/:id/preview', async (req, res) => {
  try {
    const d = drawingService.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found' });
    const frameIdx = req.body.frame ?? 0;
    const frame = d.frames[frameIdx] || d.frames[0];
    if (!frame) return res.status(400).json({ error: 'No frames' });

    const rgbToPng = (await import('./services/imageProcessor')).rgbToPng;
    const rgb = Buffer.alloc(d.width * d.height * 3);
    for (let i = 0; i < d.width * d.height; i++) {
      const hex = frame[i] || '#000000';
      rgb[i * 3] = parseInt(hex.slice(1, 3), 16);
      rgb[i * 3 + 1] = parseInt(hex.slice(3, 5), 16);
      rgb[i * 3 + 2] = parseInt(hex.slice(5, 7), 16);
    }
    const png = await rgbToPng(rgb, d.width, d.height);
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/drawings/:id/send', async (req, res) => {
  try {
    const d = drawingService.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found' });

    const mapping = getCurrentDeviceMapping();

    const frameIdx = req.body.frame ?? 0;
    const frame = d.frames[frameIdx] || d.frames[0];
    const rgb = Buffer.alloc(frame.length * 3);
    for (let i = 0; i < frame.length; i++) {
      const hex = frame[i] || '#000000';
      rgb[i * 3] = parseInt(hex.slice(1, 3), 16);
      rgb[i * 3 + 1] = parseInt(hex.slice(3, 5), 16);
      rgb[i * 3 + 2] = parseInt(hex.slice(5, 7), 16);
    }
    const deviceFrame = rasterToDeviceFrame(rgb, mapping);
    await twinklyClient.setMode('rt');
    await twinklyClient.sendRealtimeFrame(deviceFrame);
    res.json({ sent: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------- static & frontend -----------------------

app.use('/library', express.static(path.join(DATA_DIR, 'library')));

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Twinkly backend listening on port ${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  const dims = gridDimensions(settings.device);
  console.log(`Device: ${settings.device.ip} ${dims.width}x${dims.height} (${totalLeds(settings.device)} LEDs)`);
});
