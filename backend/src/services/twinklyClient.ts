import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import * as dgram from 'dgram';
import { TwinklyGestalt, LayoutPayload } from '../types';
import { makeChallengeResponse } from '../utils/rc4';

const REALTIME_PORT = 7777;
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4h advertised lifetime

type DeviceResponse = Record<string, any> & { code: number };

export type LedProfile = 'RGB' | 'RGBW';
export type Mode = 'off' | 'color' | 'demo' | 'effect' | 'movie' | 'playlist' | 'rt';

export class TwinklyClient {
  private axios: AxiosInstance;
  private token: string | null = null;
  private tokenAt = 0;
  private frameVersion = 3;
  private realTimeSocket: dgram.Socket | null = null;

  constructor(
    public readonly ip: string,
    public readonly mac?: string,
    private profile: LedProfile = 'RGB'
  ) {
    this.axios = axios.create({
      baseURL: `http://${ip}/xled/v1`,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  get baseUrl() {
    return `http://${this.ip}/xled/v1`;
  }

  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() - this.tokenAt < TOKEN_TTL_MS - 30000) {
      return this.token;
    }
    await this.login();
    if (!this.token) throw new Error('Login failed');
    return this.token;
  }

  async login(): Promise<void> {
    const challenge = crypto.randomBytes(32);
    const b64Challenge = challenge.toString('base64');

    const loginRes = await axios.post<DeviceResponse>(`${this.baseUrl}/login`, {
      challenge: b64Challenge,
    });

    if (loginRes.data.code !== 1000 || !loginRes.data.authentication_token) {
      throw new Error(`Login error: ${JSON.stringify(loginRes.data)}`);
    }

    this.token = loginRes.data.authentication_token as string;

    // Optional validation: check challenge-response matches MAC-based secret
    if (this.mac && loginRes.data['challenge-response']) {
      const expected = makeChallengeResponse(challenge, this.mac);
      if (expected !== loginRes.data['challenge-response']) {
        // Don't fail; many consumers don't need/care, but log a warning.
        console.warn('[twinkly] challenge-response mismatch');
      }
    }

    await axios.post<DeviceResponse>(
      `${this.baseUrl}/verify`,
      { 'challenge-response': loginRes.data['challenge-response'] },
      { headers: { 'X-Auth-Token': this.token } }
    );

    this.tokenAt = Date.now();
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureToken();
    return { 'X-Auth-Token': token };
  }

  private async get<T = DeviceResponse>(path: string, full = false): Promise<T | DeviceResponse> {
    const headers = await this.authHeaders();
    try {
      const res = await this.axios.get<T>(path, { headers });
      return res.data;
    } catch (err: any) {
      // Retry once on 401
      if (err.response?.status === 401) {
        await this.login();
        const headers2 = await this.authHeaders();
        const res = await this.axios.get<T>(path, { headers: headers2 });
        return res.data;
      }
      throw err;
    }
  }

  private async post<T = DeviceResponse>(path: string, body?: any, extraHeaders?: Record<string, string>, raw?: boolean): Promise<T | DeviceResponse> {
    const tokenHeaders = await this.authHeaders();
    const headers = { ...tokenHeaders, ...extraHeaders };
    try {
      const res = raw
        ? await axios.post<T>(`${this.baseUrl}${path}`, body, { headers })
        : await this.axios.post<T>(path, body, { headers });
      return res.data;
    } catch (err: any) {
      if (err.response?.status === 401) {
        await this.login();
        const tokenHeaders2 = await this.authHeaders();
        const headers2 = { ...tokenHeaders2, ...extraHeaders };
        const res = raw
          ? await axios.post<T>(`${this.baseUrl}${path}`, body, { headers: headers2 })
          : await this.axios.post<T>(path, body, { headers: headers2 });
        return res.data;
      }
      throw err;
    }
  }

  async status(): Promise<DeviceResponse> {
    const res = await axios.get<DeviceResponse>(`${this.baseUrl}/status`);
    return res.data;
  }

  async gestalt(): Promise<TwinklyGestalt> {
    const res = await axios.get<TwinklyGestalt>(`${this.baseUrl}/gestalt`);
    this.profile = (res.data.led_profile as LedProfile) || this.profile;
    if (res.data.number_of_led) this.ledCount = res.data.number_of_led;
    return res.data;
  }

  async getMode(): Promise<{ mode: Mode; shop_mode?: number; code: number }> {
    return (await this.get('/led/mode')) as any;
  }

  async setMode(mode: Mode, effectId?: number): Promise<DeviceResponse> {
    const body: any = { mode };
    if (effectId !== undefined) body.effect_id = effectId;
    return this.post('/led/mode', body);
  }

  async getBrightness(): Promise<{ value: number; mode: string; code: number }> {
    return (await this.get('/led/out/brightness')) as any;
  }

  async setBrightness(value: number, absolute = true, enabled = true): Promise<DeviceResponse> {
    const body: any = { mode: enabled ? 'enabled' : 'disabled' };
    if (value !== undefined) {
      body.value = value;
      body.type = absolute ? 'A' : 'R';
    }
    return this.post('/led/out/brightness', body);
  }

  async getLayout(): Promise<LayoutPayload & { code: number; uuid?: string; source: string }> {
    return (await this.get('/led/layout/full')) as any;
  }

  async setLayout(payload: LayoutPayload): Promise<{ code: number; parsed_coordinates: number }> {
    return this.post('/led/layout/full', payload) as any;
  }

  async deleteLayout(): Promise<DeviceResponse> {
    const headers = await this.authHeaders();
    const res = await this.axios.delete<DeviceResponse>('/led/layout/full', { headers });
    return res.data;
  }

  async getMovieConfig(): Promise<{
    frame_delay: number;
    leds_number: number;
    frames_number: number;
    loop_type?: number;
    sync?: any;
    code: number;
  }> {
    return (await this.get('/led/movie/config')) as any;
  }

  async setMovieConfig(frameDelay: number, framesNumber: number, ledsNumber: number): Promise<DeviceResponse> {
    return this.post('/led/movie/config', {
      frame_delay: frameDelay,
      frames_number: framesNumber,
      leds_number: ledsNumber,
    });
  }

  async uploadMovie(binary: Buffer): Promise<{ code: number; frames_number: number }> {
    return this.post(
      '/led/movie/full',
      binary,
      { 'Content-Type': 'application/octet-stream' },
      true
    ) as any;
  }

  async getMovies(): Promise<{
    movies: { id: number; unique_id: string; name: string }[];
    available_frames: number;
    max_capacity: number;
    code: number;
  }> {
    return (await this.get('/movies')) as any;
  }

  async deleteMovies(): Promise<DeviceResponse> {
    const headers = await this.authHeaders();
    const res = await this.axios.delete<DeviceResponse>('/movies', { headers });
    return res.data;
  }

  async setMoviesNew(
    name: string,
    uid: string,
    descriptorType: 'rgb_raw' | 'rgbw_raw' | 'aww_raw',
    ledsPerFrame: number,
    framesNumber: number,
    fps: number
  ): Promise<DeviceResponse> {
    return this.post('/movies/new', {
      name,
      unique_id: uid,
      descriptor_type: descriptorType,
      leds_per_frame: ledsPerFrame,
      frames_number: framesNumber,
      fps,
    });
  }

  async uploadMovieList(binary: Buffer): Promise<DeviceResponse> {
    return this.post(
      '/movies/full',
      binary,
      { 'Content-Type': 'application/octet-stream' },
      true
    ) as any;
  }

  async setMoviesCurrent(id: number): Promise<DeviceResponse> {
    return this.post('/movies/current', { id });
  }

  async getPlaylist(): Promise<{ entries: { unique_id: string; duration: number }[]; code: number }> {
    return (await this.get('/playlist')) as any;
  }

  async setPlaylist(entries: { unique_id: string; duration: number }[]): Promise<DeviceResponse> {
    return this.post('/playlist', { entries });
  }

  async deletePlaylist(): Promise<DeviceResponse> {
    const headers = await this.authHeaders();
    const res = await this.axios.delete<DeviceResponse>('/playlist', { headers });
    return res.data;
  }

  async setPlaylistCurrent(id: number): Promise<DeviceResponse> {
    return this.post('/playlist/current', { id });
  }

  async setStaticColor(r: number, g: number, b: number): Promise<DeviceResponse> {
    const info = await this.gestalt();
    const n = info.number_of_led;
    const buf = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      buf[i * 3] = r;
      buf[i * 3 + 1] = g;
      buf[i * 3 + 2] = b;
    }
    await this.setMode('movie');
    await this.uploadMovie(buf);
    await this.setMovieConfig(1000, 1, n);
    return { code: 1000 };
  }

  ledCount = 0;

  /**
   * Send a single frame over UDP realtime protocol v3.
   * Frame buffer must already be in DEVICELED order (3 bytes RGB per LED).
   */
  async sendRealtimeFrame(frame: Buffer): Promise<void> {
    const token = await this.ensureToken();
    const tokenRaw = Buffer.from(token, 'base64');
    if (tokenRaw.length !== 8) {
      throw new Error(`Unexpected token length ${tokenRaw.length}`);
    }

    if (!this.realTimeSocket) {
      this.realTimeSocket = dgram.createSocket('udp4');
    }

    if (this.frameVersion === 3) {
      // Fragment into chunks of up to 900 payload bytes
      const mtuPayload = 900;
      let fragment = 0;
      for (let offset = 0; offset < frame.length; offset += mtuPayload) {
        const chunk = frame.slice(offset, offset + mtuPayload);
        const header = Buffer.concat([
          Buffer.from([0x03]),
          tokenRaw,
          Buffer.from([0x00, 0x00]),
          Buffer.from([fragment]),
        ]);
        const packet = Buffer.concat([header, chunk]);
        await new Promise<void>((resolve, reject) => {
          this.realTimeSocket!.send(packet, REALTIME_PORT, this.ip, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        fragment++;
      }
    } else {
      // Fallback v2
      const header = Buffer.concat([Buffer.from([0x02]), tokenRaw, Buffer.from([0x00])]);
      const packet = Buffer.concat([header, frame]);
      await new Promise<void>((resolve, reject) => {
        this.realTimeSocket!.send(packet, REALTIME_PORT, this.ip, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  closeRealtimeSocket() {
    if (this.realTimeSocket) {
      this.realTimeSocket.close();
      this.realTimeSocket = null;
    }
  }
}
