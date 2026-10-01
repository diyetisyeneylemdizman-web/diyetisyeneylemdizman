// Tarayıcı tarafı şifreleme (WebCrypto). Sunucuya giden her kişisel veri burada şifrelenir.
//
// - Diyetisyen paneli kayıtları: paroladan türetilen anahtar (PBKDF2-SHA256, 600.000 tur) + AES-256-GCM.
// - Randevu talebi: diyetisyenin açık anahtarıyla "mühürlenir" (ECDH P-256 + HKDF-SHA256 + AES-256-GCM).
//   Mührü yalnızca diyetisyen panelindeki özel anahtar açabilir.
// - Takibim: her danışan için rastgele 256 bit anahtar (AES-256-GCM). Anahtar QR kodunun içindedir.

const te = new TextEncoder();
const td = new TextDecoder();

export const PAROLA_TURU = 600_000;

export function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const rastgele = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** URL'de kullanılabilir rastgele kimlik */
export const kimlik = (bayt = 12) => b64url(rastgele(bayt));

const birlestir = (...parcalar: Uint8Array[]) => {
  const out = new Uint8Array(parcalar.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of parcalar) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// TypeScript 5.7+ BufferSource uyumu için
const bs = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

export async function aesAnahtari(ham: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bs(ham), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Şifreler: çıktı = iv (12 bayt) ‖ şifreli metin */
export async function sifrele(anahtar: CryptoKey, veri: Uint8Array, ek?: string): Promise<Uint8Array> {
  const iv = rastgele(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bs(iv), ...(ek ? { additionalData: bs(te.encode(ek)) } : {}) },
    anahtar,
    bs(veri),
  );
  return birlestir(iv, new Uint8Array(ct));
}

export async function coz(anahtar: CryptoKey, veri: Uint8Array, ek?: string): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bs(veri.subarray(0, 12)), ...(ek ? { additionalData: bs(te.encode(ek)) } : {}) },
    anahtar,
    bs(veri.subarray(12)),
  );
  return new Uint8Array(pt);
}

export const jsonSifrele = async (anahtar: CryptoKey, deger: unknown, ek?: string) =>
  b64(await sifrele(anahtar, te.encode(JSON.stringify(deger)), ek));

export const jsonCoz = async <T>(anahtar: CryptoKey, deger: string, ek?: string): Promise<T> =>
  JSON.parse(td.decode(await coz(anahtar, unb64(deger), ek))) as T;

/** Paroladan AES anahtarı türetir */
export async function parolaAnahtari(parola: string, tuz: Uint8Array, tur = PAROLA_TURU): Promise<CryptoKey> {
  const temel = await crypto.subtle.importKey('raw', bs(te.encode(parola.normalize('NFC'))), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bs(tuz), iterations: tur },
    temel,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sha256(metin: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', bs(te.encode(metin)))));
}

// ---------------------------------------------------------------- Mühürlü zarf (randevu talebi)

export interface Zarf {
  epk: JsonWebKey;
  iv: string;
  veri: string;
}

export async function ecdhAnahtarCifti(): Promise<{ acik: JsonWebKey; ozel: JsonWebKey }> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const acik = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const ozel = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { acik: { kty: 'EC', crv: 'P-256', x: acik.x, y: acik.y }, ozel };
}

async function zarfAnahtari(ozel: CryptoKey, acik: CryptoKey): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: acik }, ozel, 256);
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: bs(te.encode('diyetisyeneylemdizman-randevu-1')) },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const ecdhAcik = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

/** Veriyi alıcının açık anahtarıyla mühürler (yalnızca alıcı açabilir) */
export async function muhurle(aliciAcik: JsonWebKey, deger: unknown): Promise<Zarf> {
  const gecici = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const anahtar = await zarfAnahtari(gecici.privateKey, await ecdhAcik(aliciAcik));
  const iv = rastgele(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, anahtar, bs(te.encode(JSON.stringify(deger))));
  const epk = await crypto.subtle.exportKey('jwk', gecici.publicKey);
  return { epk: { kty: 'EC', crv: 'P-256', x: epk.x, y: epk.y }, iv: b64(iv), veri: b64(new Uint8Array(ct)) };
}

export async function muhurAc<T>(ozelJwk: JsonWebKey, zarf: Zarf): Promise<T> {
  const ozel = await crypto.subtle.importKey('jwk', ozelJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const anahtar = await zarfAnahtari(ozel, await ecdhAcik(zarf.epk));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(unb64(zarf.iv)) }, anahtar, bs(unb64(zarf.veri)));
  return JSON.parse(td.decode(pt)) as T;
}

// ---------------------------------------------------------------- Takibim bağlantısı (QR / link)
// QR: #q=<kutu(16) ‖ jeton(16) ‖ anahtar(32)>  — kod gerekmez (klinikte ekrandan okutulur)
// Link: #b=<tuz(16) ‖ sifreli(...)>         — 6 haneli kodla açılır (WhatsApp'tan gönderilir, kod sözlü söylenir)

export interface TakipAnahtari {
  kutu: string;
  jeton: string;
  anahtar: string; // b64url 32 bayt
}

const LINK_TURU = 200_000;

function paketle(t: TakipAnahtari): Uint8Array {
  return birlestir(unb64(t.kutu), unb64(t.jeton), unb64(t.anahtar));
}

function ac(b: Uint8Array): TakipAnahtari {
  if (b.length !== 64) throw new Error('bozuk');
  return { kutu: b64url(b.subarray(0, 16)), jeton: b64url(b.subarray(16, 32)), anahtar: b64url(b.subarray(32, 64)) };
}

export function yeniTakipAnahtari(): TakipAnahtari {
  return { kutu: b64url(rastgele(16)), jeton: b64url(rastgele(16)), anahtar: b64url(rastgele(32)) };
}

export const qrParcasi = (t: TakipAnahtari) => `q=${b64url(paketle(t))}`;

export async function linkParcasi(t: TakipAnahtari, kod: string): Promise<string> {
  const tuz = rastgele(16);
  const k = await parolaAnahtari(kod, tuz, LINK_TURU);
  return `b=${b64url(birlestir(tuz, await sifrele(k, paketle(t))))}`;
}

/** Adres çubuğundaki #q=... veya #b=... parçasını okur. Kodlu bağlantıda kod gerekir. */
export function parcaTuru(hash: string): 'qr' | 'link' | null {
  if (/^#?q=[A-Za-z0-9_-]{80,90}$/.test(hash)) return 'qr';
  if (/^#?b=[A-Za-z0-9_-]{120,200}$/.test(hash)) return 'link';
  return null;
}

export async function parcaCoz(hash: string, kod?: string): Promise<TakipAnahtari> {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('q=')) return ac(unb64(h.slice(2)));
  const b = unb64(h.slice(2));
  const k = await parolaAnahtari(kod ?? '', b.subarray(0, 16), LINK_TURU);
  return ac(await coz(k, b.subarray(16)));
}

export const altiHane = () => String(100000 + (new Uint32Array(rastgele(4).buffer)[0] % 900000));
