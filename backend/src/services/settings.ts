import * as fs from 'fs';
import * as path from 'path';
import { DeviceConfig, PanelOrientation } from '../types';
import { defaultPanelOrientations } from './layoutBuilder';

export interface AppSettings {
  device: DeviceConfig;
  lastUsed?: string;
}

export function defaultPanelChain(gridCols: number, gridRows: number): number[] {
  return Array.from({ length: gridCols * gridRows }, (_, i) => i);
}

export function defaultSettings(defaultIp: string): AppSettings {
  return {
    device: {
      ip: defaultIp,
      panelCols: 8,
      panelRows: 8,
      // Default assumes a 4x4 grid of 8x8 panels (1024 LEDs), matching
      // the Twinkly Squares device that reports 1024 LEDs in this setup.
      gridCols: 4,
      gridRows: 4,
      panelOrientations: [],
      panelChain: defaultPanelChain(4, 4),
    },
  };
}

export function loadSettings(dataDir: string, envIp: string): AppSettings {
  const file = path.join(dataDir, 'settings.json');
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AppSettings;
      if (!parsed.device) parsed.device = defaultSettings(envIp).device;
      if (!parsed.device.ip) parsed.device.ip = envIp;
      const expectedCount = parsed.device.gridCols * parsed.device.gridRows;
      if (!Array.isArray(parsed.device.panelOrientations) || parsed.device.panelOrientations.length !== expectedCount) {
        parsed.device.panelOrientations = defaultPanelOrientations(expectedCount);
      }
      if (!Array.isArray(parsed.device.panelChain) || parsed.device.panelChain.length !== expectedCount) {
        parsed.device.panelChain = defaultPanelChain(parsed.device.gridCols, parsed.device.gridRows);
      }
      return parsed;
    } catch (e) {
      console.warn('[settings] failed to load, using defaults', e);
    }
  }
  return defaultSettings(envIp);
}

export function saveSettings(dataDir: string, settings: AppSettings): void {
  const file = path.join(dataDir, 'settings.json');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
}

export function totalLeds(config: DeviceConfig): number {
  return config.gridCols * config.panelCols * config.gridRows * config.panelRows;
}

export function gridDimensions(config: DeviceConfig): { width: number; height: number } {
  return {
    width: config.gridCols * config.panelCols,
    height: config.gridRows * config.panelRows,
  };
}
