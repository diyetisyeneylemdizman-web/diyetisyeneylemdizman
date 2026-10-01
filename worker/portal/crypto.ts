// Danışan sistemi — sunucu tarafı şifreleme yardımcıları (Workers WebCrypto)
//
// Sunucu danışan verisini OKUYAMAZ: randevu talepleri ve Takibim verileri tarayıcıda şifrelenip buraya kapalı
// zarf olarak gelir. Burada yalnızca erişim anahtarlarının özetleri (SHA-256) karşılaştırılır ve bildirim (Web Push)
// imzası üretilir.

const te = new TextEncoder();

export function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Tahmin edilemez kimlik (URL'de kullanılabilir) */
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

// ---------------------------------------------------------------- Web Push (VAPID)
// Bildirimler içeriksiz gönderilir: telefona yalnızca "yeni talep var" sinyali gider, kişisel bilgi gitmez.

export async function vapidAnahtariOlustur(): Promise<{ acik: string; ozel: JsonWebKey }> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const acik = b64url((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const ozel = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey;
  return { acik, ozel };
}

export async function vapidBasligi(endpoint: string, ozel: JsonWebKey, acik: string, iletisim: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const bas = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const govde = b64url(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: iletisim })));
  const anahtar = await crypto.subtle.importKey('jwk', ozel, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const imza = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, anahtar, te.encode(`${bas}.${govde}`));
  return `vapid t=${bas}.${govde}.${b64url(imza)}, k=${acik}`;
}
