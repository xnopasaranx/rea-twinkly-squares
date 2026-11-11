import * as mqtt from 'mqtt';
import { AppSettings, MatrixConfig, OverlayMessage } from '../types';
import { LibraryService } from './libraryService';
import { DrawingService } from './drawingService';
import { MatrixComposer } from './composerService';

export class MqttService {
  private client: mqtt.MqttClient | null = null;
  private composers: Map<string, MatrixComposer> = new Map();

  constructor(
    private settings: AppSettings,
    private libraryService: LibraryService,
    private drawingService: DrawingService
  ) {}

  onSettingsUpdated(settings: AppSettings) {
    this.settings = settings;
    // Remove composers for matrices that no longer exist.
    const ids = new Set(settings.matrices.map((m) => m.id));
    for (const [id, composer] of this.composers) {
      if (!ids.has(id)) {
        composer.stop();
        this.composers.delete(id);
      }
    }
    // Update existing composers in place.
    for (const matrix of settings.matrices) {
      const composer = this.composers.get(matrix.id);
      if (composer) composer.updateMatrix(matrix);
    }
    this.connect();
  }

  private topic(parts: string[]) {
    const base = this.settings.mqtt.baseTopic.replace(/\/$/, '');
    return [base, ...parts].join('/');
  }

  private isValidConfig(): boolean {
    const m = this.settings.mqtt;
    return m.enabled && !!m.brokerHost && m.brokerPort > 0;
  }

  connect() {
    if (!this.isValidConfig()) {
      this.disconnect();
      return;
    }
    if (this.client?.connected) return;

    this.disconnect();
    const url = `mqtt://${this.settings.mqtt.brokerHost}:${this.settings.mqtt.brokerPort}`;
    const options: Record<string, any> = {
      reconnectPeriod: 5000,
      connectTimeout: 10 * 1000,
    };
    if (this.settings.mqtt.username) options.username = this.settings.mqtt.username;
    if (this.settings.mqtt.password) options.password = this.settings.mqtt.password;

    console.log('[mqtt] connecting to', url);
    try {
      this.client = mqtt.connect(url, options);
    } catch (e: any) {
      console.warn('[mqtt] connection error', e.message);
      return;
    }

    this.client.on('connect', () => {
      console.log('[mqtt] connected');
      this.subscribeAll();
      this.publishStatus();
    });

    this.client.on('message', (topic, payload) => this.handleMessage(topic, payload));

    this.client.on('error', (err) => {
      console.warn('[mqtt] error', err.message);
    });

    this.client.on('close', () => {
      console.log('[mqtt] disconnected');
    });
  }

  disconnect() {
    if (this.client) {
      try {
        this.client.end(true);
      } catch {}
      this.client = null;
    }
  }

  private baseTopicNormalized(): string {
    return this.settings.mqtt.baseTopic.replace(/\/$/, '').replace(/^\//, '');
  }

  private subscribeAll() {
    if (!this.client?.connected) return;
    // Single wildcard subscription catches all configured matrices.
    const topic = `${this.baseTopicNormalized()}/+/overlay/+/set`;
    this.client.subscribe(topic, (err) => {
      if (err) console.warn('[mqtt] subscribe error', err.message);
      else console.log('[mqtt] subscribed', topic);
    });
  }

  private publishStatus() {
    if (!this.client?.connected) return;
    for (const matrix of this.settings.matrices) {
      const suffix = matrix.topicSuffix || matrix.id;
      this.client.publish(
        `${this.baseTopicNormalized()}/${suffix}/status/connected`,
        'true',
        { retain: true }
      );
    }
  }

  private getOrCreateComposer(matrix: MatrixConfig): MatrixComposer {
    let composer = this.composers.get(matrix.id);
    if (!composer) {
      composer = new MatrixComposer(matrix, this.libraryService, this.drawingService);
      this.composers.set(matrix.id, composer);
    }
    return composer;
  }

  private handleMessage(topic: string, payload: Buffer) {
    const base = this.baseTopicNormalized();
    if (!topic.startsWith(`${base}/`)) return;

    const rest = topic.slice(base.length + 1);
    const restParts = rest.split('/');
    // Expected: <suffix>/overlay/<areaId>/set
    if (restParts.length < 4 || restParts[1] !== 'overlay' || restParts[3] !== 'set') return;
    const suffix = restParts[0];
    const areaId = restParts[2];

    let msg: Partial<OverlayMessage> = {};
    try {
      const str = payload.toString();
      const parsed = JSON.parse(str);
      if (typeof parsed === 'string') msg = { text: parsed };
      else msg = parsed;
    } catch {
      msg = { text: payload.toString() };
    }

    if (!msg.text) return;

    const matrix = this.settings.matrices.find((m) => (m.topicSuffix || m.id) === suffix);
    if (!matrix) return;

    const composer = this.getOrCreateComposer(matrix);

    composer.pushOverlay(areaId, msg.text as string, {
      color: msg.color,
      bg: msg.bg,
      speed: msg.speed,
      loop: msg.loop,
      count: msg.count,
    });

    // Start the composer if it is not already running.
    composer.start();
  }

  startComposer(matrixId: string) {
    const matrix = this.settings.matrices.find((m) => m.id === matrixId);
    if (!matrix) throw new Error('Matrix not found');
    const composer = this.getOrCreateComposer(matrix);
    composer.start();
    return composer;
  }

  stopComposer(matrixId: string) {
    const composer = this.composers.get(matrixId);
    if (composer) composer.stop();
  }

  composerStatus(matrixId: string) {
    const matrix = this.settings.matrices.find((m) => m.id === matrixId);
    if (!matrix) return null;
    const composer = this.composers.get(matrixId);
    return {
      running: !!composer,
      queues: composer?.getQueues() || [],
    };
  }
}
