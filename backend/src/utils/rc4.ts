/**
 * Pure-JS RC4 implementation matching the algorithm used by Twinkly for
 * challenge-response auth and WiFi password encryption.
 */
export function rc4Encrypt(data: Buffer, key: Buffer): Buffer {
  // Key-scheduling algorithm (KSA)
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;

  let j = 0;
  const keyLen = key.length;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % keyLen]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }

  // Pseudo-random generation algorithm (PRGA)
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    const k = s[(s[i] + s[j]) & 0xff];
    out[n] = data[n] ^ k;
  }
  return out;
}

export function xorRepeat(message: Buffer, key: Buffer): Buffer {
  const out = Buffer.alloc(message.length);
  for (let i = 0; i < message.length; i++) {
    out[i] = message[i] ^ key[i % key.length];
  }
  return out;
}

export function deriveKey(sharedKey: Buffer, macAddress: string): Buffer {
  const mac = Buffer.from(macAddress.replace(/[^0-9a-fA-F]/g, ''), 'hex');
  if (mac.length !== 6) throw new Error(`Invalid MAC address: ${macAddress}`);
  return xorRepeat(sharedKey, mac);
}

export function makeChallengeResponse(
  challenge: Buffer,
  macAddress: string,
  sharedKey = Buffer.from('evenmoresecret!!', 'ascii')
): string {
  const key = deriveKey(sharedKey, macAddress);
  const encrypted = rc4Encrypt(challenge, key);
  return require('crypto').createHash('sha1').update(encrypted).digest('hex');
}

export function encryptWifiPassword(
  password: string,
  macAddress: string,
  sharedKey = Buffer.from('supersecretkey!!', 'ascii')
): string {
  const key = deriveKey(sharedKey, macAddress);
  const data = Buffer.from(password, 'utf8');
  const padded = Buffer.alloc(64, 0x00);
  data.copy(padded);
  const encrypted = rc4Encrypt(padded, key);
  return encrypted.toString('base64');
}
