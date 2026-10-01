// Danışan sistemi — şifreleme ve kimlik doğrulama yardımcıları (yalnızca tarayıcı/Workers WebCrypto kullanır)
//
// - Parolalar PBKDF2-SHA256 (100.000 tur, rastgele tuz) ile saklanır; parolanın kendisi hiçbir yerde tutulmaz.
// - Sağlık verileri, belgeler ve notlar AES-256-GCM ile şifrelenir. Anahtar Cloudflare panelindeki
//   VERI_ANAHTARI gizli değişkenindedir; veritabanında durmaz.
// - Yönetici girişinde iki adımlı doğrulama (TOTP, Google Authenticator vb.) kullanılır.

const te = new TextEncoder();
const td = new TextDecoder();

export const PBKDF2_TURU = 100_000; // Cloudflare Workers'ın izin verdiği en yüksek değer

export function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Tahmin edilemez kimlik/anahtar (URL'de kullanılabilir) */
export function randomId(bytes = 16): string {
  return b64url(randomBytes(bytes));
}

export async function sha256(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', te.encode(text)));
}

/** İki metni sabit sürede karşılaştırır (zamanlama saldırılarına karşı) */
export function safeEqual(a: string, b: string): boolean {
  const x = te.encode(a);
  const y = te.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------- Parola

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? unb64(saltB64) : randomBytes(16);
  const key = await crypto.subtle.importKey('raw', te.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_TURU },
    key,
    256,
  );
  return { hash: b64(bits), salt: b64(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const check = await hashPassword(password, salt);
  return safeEqual(check.hash, hash);
}

// ---------------------------------------------------------------- Veri şifreleme (AES-256-GCM)

const KEY_ID = 'k1';

export async function importDataKey(secret: string | undefined): Promise<CryptoKey | null> {
  if (!secret) return null;
  let raw: Uint8Array;
  try {
    raw = unb64(secret.trim());
  } catch {
    return null;
  }
  if (raw.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return `${KEY_ID}:${b64(out)}`;
}

export async function decryptText(key: CryptoKey, value: string): Promise<string> {
  const [, data] = value.split(':', 2);
  const buf = unb64(data);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, key, buf.subarray(12));
  return td.decode(pt);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  return encryptText(key, JSON.stringify(value ?? null));
}

export async function decryptJson<T>(key: CryptoKey, value: string | null | undefined, fallback: T): Promise<T> {
  if (!value) return fallback;
  try {
    return JSON.parse(await decryptText(key, value)) as T;
  } catch {
    return fallback;
  }
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return out;
}

export async function decryptBytes(key: CryptoKey, data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, key, buf.subarray(12)));
}

// ---------------------------------------------------------------- İki adımlı doğrulama (TOTP, RFC 6238)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function unbase32(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function totpAt(secretB32: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', unbase32(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[mac.length - 1] & 15;
  const code =
    (((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3]) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** Kodu kontrol eder; geçerliyse kullanılan sayaç değerini döndürür (aynı kodun tekrar kullanılmaması için) */
export async function verifyTotp(secretB32: string, code: string, lastCounter = -1, now = Date.now()): Promise<number | null> {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(now / 30_000);
  for (const c of [current, current - 1, current + 1]) {
    if (c <= lastCounter) continue;
    if (safeEqual(await totpAt(secretB32, c), clean)) return c;
  }
  return null;
}
