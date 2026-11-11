export interface PanelOrientation {
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface DeviceConfig {
  ip: string;
  mac?: string;
  panelCols: number;      // LEDs per panel horizontally
  panelRows: number;      // LEDs per panel vertically
  gridCols: number;       // panels horizontally
  gridRows: number;       // panels vertically
  panelOrientations?: PanelOrientation[]; // per-cable-index correction orientation
  panelChain?: number[];  // logical position -> cable index (which physical panel is here)
}

declare module 'oled-font-5x7';

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
  x: number;              // top-left pixel on the matrix
  y: number;
  width: number;          // pixel width
  height: number;         // pixel height
  maxQueueSize: number;   // oldest message is dropped when exceeded
  defaultColor?: string;  // hex, e.g. #ffffff
  defaultBg?: string;     // hex background color, empty = transparent
  defaultSpeed?: number;  // pixels per second
}

export interface OverlayMessage {
  id?: string;
  text: string;
  color?: string;
  bg?: string;
  speed?: number;         // pixels per second
  loop?: boolean;         // loop indefinitely in the queue
  count?: number;         // play this many times if not looping (default 1)
  addedAt?: string;
}

export interface MatrixConfig {
  id: string;
  name: string;
  device: DeviceConfig;
  topicSuffix?: string;   // appended under baseTopic (defaults to id)
  overlays: OverlayArea[];
}

export interface TwinklyGestalt {
  product_name: string;
  product_version?: string;
  hardware_version: string;
  bytes_per_led?: number;
  flash_size?: number;
  led_type?: number;
  product_code?: string;
  device_name?: string;
  rssi?: number;
  uptime?: string;
  hw_id?: string;
  mac?: string;
  uuid?: string;
  max_supported_led?: number;
  base_leds_number?: number;
  number_of_led: number;
  led_profile: 'RGB' | 'RGBW' | string;
  frame_rate?: number;
  measured_frame_rate?: number;
  movie_capacity?: number;
  copyright?: string;
  fw_family?: string;
  wire_type?: number;
  code: number;
}

export interface LayoutCoord {
  x: number;
  y: number;
  z: number;
}

export interface LayoutPayload {
  source: 'linear' | '2d' | '3d';
  synthesized: boolean;
  coordinates: LayoutCoord[];
  aspectXY?: number;
  aspectXZ?: number;
  uuid?: string;
}

export interface MovieFrame {
  /** flat RGB array in raster order */
  pixels: Uint8Array;
  width: number;
  height: number;
}

export interface LibraryItem {
  id: string;
  name: string;
  type: 'gif' | 'pixelart' | 'drawing';
  sourceUrl?: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  /** Frame durations in ms */
  frameDelays?: number[];
  /** Persisted processed frames (relative paths) */
  frameFiles?: string[];
  /** Original downloaded file path */
  originalPath?: string;
  /** Processed device-ready frame binary path */
  processedPath?: string;
  createdAt: string;
  tags?: string[];
}

export interface AppSettings {
  matrices: MatrixConfig[];
  mqtt: MqttSettings;
  activeMatrixId?: string;
  lastUsed?: string;
}

export interface Playlist {
  id: string;
  name: string;
  entries: PlaylistEntry[];
  repeat: boolean;
}

export interface PlaylistEntry {
  itemId: string;
  durationMs: number;
}

export interface Drawing {
  id: string;
  name: string;
  width: number;
  height: number;
  frames: string[][]; // hex colors per pixel, flat arrays per frame
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
