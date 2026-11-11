import axios from 'axios';

export interface PanelOrientation {
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface MqttSettings {
  enabled: boolean;
  brokerHost: string;
  brokerPort: number;
  username: string;
  password: string;
  baseTopic: string;
}

export interface OverlayArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maxQueueSize: number;
  defaultColor?: string;
  defaultBg?: string;
  defaultSpeed?: number;
}

export interface MatrixConfig {
  id: string;
  name: string;
  device: {
    ip: string;
    mac?: string;
    panelCols: number;
    panelRows: number;
    gridCols: number;
    gridRows: number;
    panelOrientations?: PanelOrientation[];
    panelChain?: number[];
  };
  topicSuffix?: string;
  overlays: OverlayArea[];
}

export interface DeviceSettings {
  matrices: MatrixConfig[];
  mqtt: MqttSettings;
  activeMatrixId?: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  type: 'gif' | 'pixelart' | 'drawing';
  sourceUrl?: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  frameDelays?: number[];
  createdAt: string;
  tags?: string[];
}

export interface Playlist {
  id: string;
  name: string;
  entries: { itemId: string; durationMs: number }[];
  repeat: boolean;
}

export interface Drawing {
  id: string;
  name: string;
  width: number;
  height: number;
  frames: string[][];
  frameDelay: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  title: string;
  image: string;
  thumbnail: string;
  source: string;
  width?: number;
  height?: number;
}

export const api = {
  getStatus: () => axios.get('/api/status'),
  getSettings: () => axios.get<DeviceSettings>('/api/settings'),
  updateSettings: (settings: Partial<DeviceSettings>) => axios.put('/api/settings', settings),

  // MQTT / matrices
  listMatrices: () => axios.get<MatrixConfig[]>('/api/matrices'),
  createMatrix: (data: Partial<MatrixConfig>) => axios.post<MatrixConfig>('/api/matrices', data),
  updateMatrix: (id: string, data: Partial<MatrixConfig>) => axios.put<MatrixConfig>(`/api/matrices/${id}`, data),
  deleteMatrix: (id: string) => axios.delete(`/api/matrices/${id}`),
  setActiveMatrix: (id: string) => axios.put('/api/settings', { activeMatrixId: id }),

  getMqttConfig: () => axios.get<MqttSettings>('/api/mqtt'),
  setMqttConfig: (cfg: Partial<MqttSettings>) => axios.put('/api/mqtt', cfg),

  startComposer: (matrixId: string, base?: { type: string; id?: string }) => axios.post(`/api/composer/${matrixId}/start`, base || {}),
  stopComposer: (matrixId: string) => axios.post(`/api/composer/${matrixId}/stop`),
  getComposerStatus: (matrixId: string) => axios.get(`/api/composer/${matrixId}/status`),
  pushOverlay: (matrixId: string, areaId: string, payload: { text: string; color?: string; bg?: string; speed?: number; loop?: boolean; count?: number }) =>
    axios.post(`/api/composer/${matrixId}/overlay/${areaId}`, payload),
  clearOverlays: (matrixId: string, areaId?: string) => axios.post(`/api/composer/${matrixId}/clear`, { areaId }),

  getBrightness: () => axios.get('/api/device/brightness'),
  setBrightness: (value: number) => axios.post('/api/device/brightness', { value }),
  setMode: (mode: string) => axios.post('/api/device/mode', { mode }),
  setStaticColor: (r: number, g: number, b: number) => axios.post('/api/device/static-color', { r, g, b }),

  getLayout: () => axios.get('/api/device/layout'),
  setLayout: () => axios.post('/api/device/layout', {}),
  deleteLayout: () => axios.delete('/api/device/layout'),
  detectGrid: () => axios.post('/api/device/detect-grid'),
  sendTestPattern: (panelOrientations?: PanelOrientation[], panelChain?: number[]) =>
    axios.post('/api/device/test-pattern', { panelOrientations, panelChain }),

  listLibrary: () => axios.get<LibraryItem[]>('/api/library'),
  searchLibrary: (query: string, type: 'gif' | 'pixelart', limit = 20, exactSize = false) =>
    axios.post<SearchResult[]>('/api/library/search', { query, type, limit, exactSize }),
  addLibraryUrl: (url: string, name: string, type: 'gif' | 'pixelart', tags?: string[]) =>
    axios.post<LibraryItem>('/api/library/add-url', { url, name, type, tags }),
  uploadLibraryFile: (file: File, type: 'gif' | 'pixelart' = 'pixelart', name?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    if (name) form.append('name', name);
    return axios.post<LibraryItem>('/api/library/upload', form);
  },
  deleteLibraryItem: (id: string) => axios.delete(`/api/library/${id}`),

  playRt: (id: string) => axios.post(`/api/rt/play/${id}`),
  stopRt: () => axios.post('/api/rt/stop'),

  uploadMovie: (id: string) => axios.post(`/api/movie/upload/${id}`),
  uploadRawMovie: (file: File, name?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    return axios.post('/api/movie/upload-raw', form);
  },

  listPlaylists: () => axios.get<Playlist[]>('/api/playlists'),
  createPlaylist: (name: string) => axios.post<Playlist>('/api/playlists', { name }),
  updatePlaylist: (id: string, data: Partial<Playlist>) => axios.put(`/api/playlists/${id}`, data),
  deletePlaylist: (id: string) => axios.delete(`/api/playlists/${id}`),
  applyPlaylist: (id: string) => axios.post(`/api/playlists/${id}/apply`),

  listDrawings: () => axios.get<Drawing[]>('/api/drawings'),
  createDrawing: (width: number, height: number, name: string, frameDelay: number) =>
    axios.post<Drawing>('/api/drawings', { width, height, name, frameDelay }),
  updateDrawing: (id: string, data: Partial<Drawing>) => axios.put(`/api/drawings/${id}`, data),
  getDrawing: (id: string) => axios.get<Drawing>(`/api/drawings/${id}`),
  deleteDrawing: (id: string) => axios.delete(`/api/drawings/${id}`),
  addDrawingFrame: (id: string) => axios.post(`/api/drawings/${id}/frame`, {}),
  downloadDrawing: (id: string) => axios.get(`/api/drawings/${id}/download`, { responseType: 'blob' }),
  importDrawings: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return axios.post('/api/drawings/import', form);
  },
  previewDrawing: (id: string, frame?: number) => axios.post(`/api/drawings/${id}/preview`, { frame }, { responseType: 'blob' }),
  sendDrawing: (id: string, frame?: number) => axios.post(`/api/drawings/${id}/send`, { frame }),
};
