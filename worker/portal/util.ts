// Danışan sistemi — istek/yanıt ve doğrulama yardımcıları

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const fail = (status: number, message: string, extra: Record<string, unknown> = {}): never => {
  throw new HttpError(status, message, extra);
};

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function withSecurity(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > maxBytes) fail(413, 'Gönderilen bilgi çok uzun.');
  const text = await req.text();
  if (text.length > maxBytes) fail(413, 'Gönderilen bilgi çok uzun.');
  try {
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    return fail(400, 'Geçersiz istek.');
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

// ---------------------------------------------------------------- Alan doğrulama

type Opts = { required?: boolean; max?: number; min?: number; label: string };

export function text(v: unknown, o: Opts): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (!s && o.required) fail(400, `${o.label} alanı zorunludur.`, { alan: o.label });
  if (o.max && s.length > o.max) fail(400, `${o.label} en fazla ${o.max} karakter olabilir.`, { alan: o.label });
  if (o.min && s && s.length < o.min) fail(400, `${o.label} en az ${o.min} karakter olmalıdır.`, { alan: o.label });
  return s;
}

/** Çok satırlı serbest metin (satır sonları korunur) */
export function longText(v: unknown, o: Opts): string {
  const s = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (!s && o.required) fail(400, `${o.label} alanı zorunludur.`, { alan: o.label });
  if (o.max && s.length > o.max) fail(400, `${o.label} en fazla ${o.max} karakter olabilir.`, { alan: o.label });
  return s;
}

export function num(v: unknown, o: { min: number; max: number; label: string; required?: boolean }): number | null {
  if (v === null || v === undefined || v === '') {
    if (o.required) fail(400, `${o.label} alanı zorunludur.`, { alan: o.label });
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < o.min || n > o.max)
    fail(400, `${o.label} ${String(o.min).replace('.', ',')}–${String(o.max).replace('.', ',')} arasında olmalıdır.`, {
      alan: o.label,
    });
  return Math.round(n * 10) / 10;
}

export function oneOf<T extends string>(v: unknown, list: readonly T[], label: string, required = true): T | '' {
  if ((v === '' || v === undefined || v === null) && !required) return '';
  if (typeof v !== 'string' || !list.includes(v as T)) fail(400, `${label} için geçerli bir seçim yapın.`, { alan: label });
  return v as T;
}

export function email(v: unknown): string {
  const s = text(v, { required: true, max: 120, label: 'E-posta' }).toLocaleLowerCase('tr').replace(/\s/g, '');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) fail(400, 'Geçerli bir e-posta adresi yazın.', { alan: 'E-posta' });
  return s;
}

/** Türkiye cep telefonu: 5XXXXXXXXX biçimine çevirir */
export function phone(v: unknown, label = 'Telefon'): string {
  const digits = String(v ?? '').replace(/\D/g, '');
  const d = digits.replace(/^(90|0)(?=5\d{9}$)/, '');
  if (!/^5\d{9}$/.test(d)) fail(400, 'Geçerli bir cep telefonu numarası yazın (05XX XXX XX XX).', { alan: label });
  return d;
}

export function isoDate(v: unknown, label: string, required = true): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (required) fail(400, `${label} alanı zorunludur.`, { alan: label });
    return '';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)))
    fail(400, `${label} için geçerli bir tarih seçin.`, { alan: label });
  return s;
}

export function password(v: unknown, minLen = 8): string {
  const s = typeof v === 'string' ? v : '';
  if (s.length < minLen) fail(400, `Şifre en az ${minLen} karakter olmalıdır.`, { alan: 'Şifre' });
  if (s.length > 200) fail(400, 'Şifre çok uzun.', { alan: 'Şifre' });
  if (!/\p{L}/u.test(s) || !/\d/.test(s)) fail(400, 'Şifre en az bir harf ve bir rakam içermelidir.', { alan: 'Şifre' });
  return s;
}

export const bool = (v: unknown) => v === true || v === 'true' || v === 'on' || v === 1 || v === '1';

// ---------------------------------------------------------------- Tarih (Türkiye saati, UTC+3)

const TR_OFFSET = 3 * 60 * 60 * 1000;

/** Türkiye saatine göre bugünün tarihi (YYYY-AA-GG) */
export function todayTR(now = Date.now()): string {
  return new Date(now + TR_OFFSET).toISOString().slice(0, 10);
}

export function nowTRMinutes(now = Date.now()): number {
  const d = new Date(now + TR_OFFSET);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ageOn(birthIso: string, todayIso: string): number {
  const [by, bm, bd] = birthIso.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}
