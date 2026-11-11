import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DeviceConfig, PanelOrientation, MatrixConfig, MqttSettings, OverlayArea, AppSettings } from '../types';
import { defaultPanelOrientations } from './layoutBuilder';

export function defaultMqttSettings(): MqttSettings {
  return {
    enabled: false,
    brokerHost: '',
    brokerPort: 1883,
    username: '',
    password: '',
    baseTopic: 'twinkly-squares',
  };
}

export function defaultPanelChain(gridCols: number, gridRows: number): number[] {
  return Array.from({ length: gridCols * gridRows }, (_, i) => i);
}

export function ensureDevice(config: DeviceConfig): DeviceConfig {
  const expectedCount = config.gridCols * config.gridRows;
  if (!Array.isArray(config.panelOrientations) || config.panelOrientations.length !== expectedCount) {
    config.panelOrientations = defaultPanelOrientations(expectedCount);
  }
  if (!Array.isArray(config.panelChain) || config.panelChain.length !== expectedCount) {
    config.panelChain = defaultPanelChain(config.gridCols, config.gridRows);
  }
  return config;
}

export function defaultMatrix(id: string, defaultIp: string, name = 'Default'): MatrixConfig {
  return {
    id,
    name,
    device: {
      ip: defaultIp,
      panelCols: 8,
      panelRows: 8,
      gridCols: 4,
      gridRows: 4,
      panelOrientations: defaultPanelOrientations(16),
      panelChain: defaultPanelChain(4, 4),
    },
    topicSuffix: id,
    overlays: [defaultOverlayArea('main', 0, 0, 32, 8)],
  };
}

export function defaultOverlayArea(id: string, x: number, y: number, width: number, height: number): OverlayArea {
  return { id, x, y, width, height, maxQueueSize: 10, defaultColor: '#ffffff', defaultBg: '', defaultSpeed: 8 };
}

export function defaultSettings(defaultIp: string): AppSettings {
  const matrix = defaultMatrix(uuidv4(), defaultIp);
  return {
    matrices: [matrix],
    mqtt: defaultMqttSettings(),
    activeMatrixId: matrix.id,
  };
}

export function loadSettings(dataDir: string, envIp: string): AppSettings {
  const file = path.join(dataDir, 'settings.json');
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as any;

      // Migration from legacy single-device config to matrices.
      if (!Array.isArray(parsed.matrices) || parsed.matrices.length === 0) {
        const legacyDevice: DeviceConfig = parsed.device || defaultSettings(envIp).matrices[0].device;
        legacyDevice.ip = legacyDevice.ip || envIp;
        ensureDevice(legacyDevice);
        const matrix: MatrixConfig = {
          id: uuidv4(),
          name: 'Default',
          device: legacyDevice,
          topicSuffix: 'default',
          overlays: [defaultOverlayArea('main', 0, 0, legacyDevice.gridCols * legacyDevice.panelCols, legacyDevice.gridRows * legacyDevice.panelRows)],
        };
        parsed.matrices = [matrix];
        parsed.activeMatrixId = matrix.id;
        delete parsed.device;
      }

      for (const m of parsed.matrices) {
        ensureDevice(m.device);
        if (!Array.isArray(m.overlays) || m.overlays.length === 0) {
          m.overlays = [defaultOverlayArea('main', 0, 0, m.device.gridCols * m.device.panelCols, m.device.gridRows * m.device.panelRows)];
        }
      }

      if (!parsed.mqtt) parsed.mqtt = defaultMqttSettings();

      // Ensure an active matrix exists.
      const activeExists = parsed.matrices.some((m: MatrixConfig) => m.id === parsed.activeMatrixId);
      if (!activeExists) parsed.activeMatrixId = parsed.matrices[0].id;

      return parsed as AppSettings;
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
