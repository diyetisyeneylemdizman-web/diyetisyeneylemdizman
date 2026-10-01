// Danışan sistemi — veritabanı ve tüm işlemler (Cloudflare Durable Object, SQLite)
//
// Tüm danışan ve yönetici işlemleri bu nesnede çalışır; veriler tek bir SQLite veritabanında durur.
// - Sağlık verileri (profil sağlık bilgileri, ölçümler, notlar, mesaj içerikleri, belgeler) AES-256-GCM ile şifrelidir.
// - Her önemli işlem (giriş, profil görüntüleme, ölçüm ekleme, belge indirme…) "kayitlar" tablosuna yazılır.
// - "PORTAL_MODU" = "deneme" iken yeni kayıt yalnızca KURULUM_KODU ile yapılabilir; gerçek danışan verisi girilmemelidir.

import { DurableObject } from 'cloudflare:workers';
import {
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  hashPassword,
  importDataKey,
  randomBytes,
  randomId,
  safeEqual,
  sha256,
  verifyPassword,
  verifyTotp,
  base32,
} from './crypto';
import {
  HttpError,
  addDays,
  ageOn,
  bool,
  cookie,
  email as vEmail,
  fail,
  isoDate,
  json,
  longText,
  nowTRMinutes,
  num,
  oneOf,
  parseCookies,
  password as vPassword,
  phone as vPhone,
  readJson,
  text,
  todayTR,
} from './util';
import {
  aktiviteSecenekleri,
  belgeSiniri,
  danisanOlcumAlanlari,
  gebelikSecenekleri,
  hastalikSecenekleri,
  hedefSecenekleri,
  kaynakSecenekleri,
  olcumAlanlari,
  oturumSuresi,
  paketDurumlari,
  portalBelgeleri,
  randevuDurumlari,
  sehirler,
  type BelgeTuru,
} from '../../src/data/portal';
import { site } from '../../src/data/site';

export interface PortalEnv {
  /** 32 baytlık veri şifreleme anahtarı (base64) — Cloudflare panelinde Secret */
  VERI_ANAHTARI?: string;
  /** Yönetici kurulumu ve deneme kayıtları için kod — Cloudflare panelinde Secret */
  KURULUM_KODU?: string;
  /** "deneme" veya "canli" (wrangler.jsonc → vars) */
  PORTAL_MODU?: string;
}

type Role = 'danisan' | 'yonetici';
type UserRow = {
  id: string;
  role: Role;
  email: string;
  phone: string;
  name: string;
  pass_hash: string;
  pass_salt: string;
  totp_enc: string | null;
  totp_last: number;
  status: string;
  created_at: number;
  last_login: number | null;
  minor: number;
};

type Profile = {
  dogumTarihi: string;
  cinsiyet: string;
  sehir: string;
  meslek: string;
  boy: number | null;
  hedefKilo: number | null;
  hedef: string;
  aktivite: string;
  kaynak: string;
  saglik: {
    hastaliklar: string[];
    digerHastalik: string;
    ilaclar: string;
    alerjiler: string;
    intoleranslar: string;
    gebelik: string;
    ameliyatlar: string;
    notlar: string;
  };
  veli: { ad: string; telefon: string } | null;
};

type Ctx = { req: Request; url: URL; ip: string; params: string[]; user: UserRow | null };
type Handler = (c: Ctx) => Promise<Response>;

const CLIENT_COOKIE = '__Host-dp_danisan';
const ADMIN_COOKIE = '__Host-dp_yonetim';
const CHUNK = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const AUDIT_KEEP_DAYS = 730;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, role TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, totp_enc TEXT, totp_last INTEGER NOT NULL DEFAULT -1,
    status TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER, minor INTEGER NOT NULL DEFAULT 0)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_phone ON users(phone) WHERE role = 'danisan'`,
  `CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, data_enc TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, type TEXT NOT NULL, version TEXT NOT NULL,
    accepted_at INTEGER NOT NULL, withdrawn_at INTEGER, ip TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS consents_user ON consents(user_id)`,
  `CREATE TABLE IF NOT EXISTS measurements (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, data_enc TEXT NOT NULL, source TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS measurements_user ON measurements(user_id, date)`,
  `CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', items TEXT NOT NULL DEFAULT '[]',
    duration TEXT NOT NULL DEFAULT '', price REAL, show_price INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, package_id TEXT, package_name TEXT NOT NULL, price REAL,
    status TEXT NOT NULL, start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '',
    payment_note TEXT NOT NULL DEFAULT '', note_enc TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    reminded INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(user_id)`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, type TEXT NOT NULL,
    status TEXT NOT NULL, note_enc TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    reminded INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS appointments_date ON appointments(date, time)`,
  `CREATE INDEX IF NOT EXISTS appointments_user ON appointments(user_id)`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL,
    size INTEGER NOT NULL, chunks INTEGER NOT NULL, uploaded_by TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS documents_user ON documents(user_id)`,
  `CREATE TABLE IF NOT EXISTS doc_chunks (doc_id TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (doc_id, idx))`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, user_id TEXT, title TEXT NOT NULL, body_enc TEXT NOT NULL, kind TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS message_reads (message_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY (message_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS notes (user_id TEXT PRIMARY KEY, body_enc TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, ip TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS tickets (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, first_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT, role TEXT NOT NULL, action TEXT NOT NULL,
    target TEXT, detail TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS audit_at ON audit(at)`,
  `CREATE INDEX IF NOT EXISTS audit_target ON audit(target, at)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

/** Kayıtlarda görünen işlem adları */
export const AUDIT_LABELS: Record<string, string> = {
  kayit: 'Üye kaydı',
  giris: 'Giriş',
  giris_basarisiz: 'Başarısız giriş denemesi',
  cikis: 'Çıkış',
  onay: 'Metin onayı',
  riza_geri_cek: 'Açık rıza geri çekildi',
  silme_talebi: 'Hesap silme talebi',
  silme_talebi_iptal: 'Silme talebi geri alındı',
  profil_guncelle: 'Profil güncellendi',
  sifre_degistir: 'Şifre değiştirildi',
  sifre_yenile: 'Şifre bağlantıyla yenilendi',
  olcum_ekle: 'Ölçüm eklendi',
  olcum_guncelle: 'Ölçüm güncellendi',
  olcum_sil: 'Ölçüm silindi',
  paket_talebi: 'Paket talebi',
  randevu_talebi: 'Randevu talebi',
  randevu_iptal: 'Randevu iptali',
  belge_yukle: 'Belge yüklendi',
  belge_indir: 'Belge açıldı',
  belge_sil: 'Belge silindi',
  belge_guncelle: 'Belge güncellendi',
  veri_indir: 'Veriler indirildi',
  yonetici_kurulum: 'Yönetici kurulumu',
  yonetici_giris: 'Yönetici girişi',
  yonetici_giris_basarisiz: 'Başarısız yönetici girişi',
  iki_adim_sifirla: 'İki adımlı doğrulama sıfırlandı',
  danisan_goruntule: 'Danışan dosyası görüntülendi',
  danisan_durum: 'Hesap durumu değiştirildi',
  not_guncelle: 'Diyetisyen notu güncellendi',
  mesaj_gonder: 'Mesaj gönderildi',
  toplu_mesaj: 'Tüm danışanlara duyuru',
  sifre_baglantisi: 'Şifre yenileme bağlantısı oluşturuldu',
  abonelik_kaydet: 'Paket kaydı güncellendi',
  randevu_kaydet: 'Randevu güncellendi',
  paket_kaydet: 'Paket tanımı kaydedildi',
  paket_sil: 'Paket tanımı silindi',
  hesap_sil: 'Hesap ve veriler silindi',
};

const cleanList = (v: unknown, max = 30, maxLen = 120): string[] =>
  Array.isArray(v)
    ? v
        .filter((x) => typeof x === 'string')
        .map((x) => (x as string).replace(/\s+/g, ' ').trim().slice(0, maxLen))
        .filter(Boolean)
        .slice(0, max)
    : [];

function parseMultipartSize(req: Request) {
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > belgeSiniri.enFazlaBayt + 64 * 1024) fail(413, 'Dosya en fazla 10 MB olabilir.');
}

function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return 'image/webp';
  return null;
}

function safeFilename(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return base || 'belge';
}

export class PortalStore extends DurableObject<PortalEnv> {
  private sql: SqlStorage;
  private keyPromise: Promise<CryptoKey | null> | null = null;
  private routes: [string, RegExp, Handler, 'none' | 'danisan' | 'danisan-onayli' | 'yonetici'][];

  constructor(ctx: DurableObjectState, env: PortalEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    for (const q of SCHEMA) this.sql.exec(q);
    if (!this.meta('ip_salt')) this.setMeta('ip_salt', randomId(16));

    const r = (m: string, p: string, h: Handler, auth: 'none' | 'danisan' | 'danisan-onayli' | 'yonetici') =>
      [m, new RegExp(`^/api/portal${p}$`), h.bind(this), auth] as [string, RegExp, Handler, typeof auth];
    const ID = '([A-Za-z0-9_-]{8,40})';
    this.routes = [
      r('GET', '/durum', this.status, 'none'),
      r('POST', '/kayit', this.register, 'none'),
      r('POST', '/giris', this.login, 'none'),
      r('POST', '/cikis', this.logout, 'none'),
      r('POST', '/sifre-yenile', this.resetPassword, 'none'),
      r('GET', '/ben', this.me, 'danisan'),
      r('POST', '/onay', this.acceptDocs, 'danisan'),
      r('POST', '/riza-geri-cek', this.withdrawConsent, 'danisan'),
      r('POST', '/silme-talebi', this.deletionRequest, 'danisan'),
      r('POST', '/silme-talebi/iptal', this.cancelDeletion, 'danisan'),
      r('GET', '/verilerim', this.exportData, 'danisan'),
      r('POST', '/sifre-degistir', this.changePassword, 'danisan'),
      r('GET', '/panel', this.panel, 'danisan-onayli'),
      r('PUT', '/profil', this.updateProfile, 'danisan-onayli'),
      r('POST', '/olcum', this.addOwnMeasurement, 'danisan-onayli'),
      r('DELETE', `/olcum/${ID}`, this.deleteOwnMeasurement, 'danisan-onayli'),
      r('POST', '/paket-talebi', this.packageRequest, 'danisan-onayli'),
      r('GET', '/musait', this.availability, 'danisan-onayli'),
      r('POST', '/randevu', this.appointmentRequest, 'danisan-onayli'),
      r('POST', `/randevu/${ID}/iptal`, this.cancelOwnAppointment, 'danisan-onayli'),
      r('POST', '/belge', this.uploadOwnDocument, 'danisan-onayli'),
      r('GET', `/belge/${ID}`, this.downloadOwnDocument, 'danisan-onayli'),
      r('POST', `/mesaj/${ID}/okundu`, this.markRead, 'danisan-onayli'),

      r('GET', '/yonetim/durum', this.adminStatus, 'none'),
      r('POST', '/yonetim/kurulum', this.adminSetup, 'none'),
      r('POST', '/yonetim/kurulum/dogrula', this.adminSetupVerify, 'none'),
      r('POST', '/yonetim/iki-adim-sifirla', this.adminReset2fa, 'none'),
      r('POST', '/yonetim/giris', this.adminLogin, 'none'),
      r('POST', '/yonetim/giris/dogrula', this.adminLoginVerify, 'none'),
      r('POST', '/yonetim/cikis', this.adminLogout, 'none'),
      r('GET', '/yonetim/ben', this.adminMe, 'yonetici'),
      r('POST', '/yonetim/sifre-degistir', this.changePassword, 'yonetici'),
      r('GET', '/yonetim/ozet', this.adminOverview, 'yonetici'),
      r('GET', '/yonetim/danisanlar', this.adminClients, 'yonetici'),
      r('GET', `/yonetim/danisan/${ID}`, this.adminClient, 'yonetici'),
      r('PUT', `/yonetim/danisan/${ID}/durum`, this.adminSetStatus, 'yonetici'),
      r('PUT', `/yonetim/danisan/${ID}/not`, this.adminSetNote, 'yonetici'),
      r('POST', `/yonetim/danisan/${ID}/olcum`, this.adminAddMeasurement, 'yonetici'),
      r('PUT', `/yonetim/olcum/${ID}`, this.adminUpdateMeasurement, 'yonetici'),
      r('DELETE', `/yonetim/olcum/${ID}`, this.adminDeleteMeasurement, 'yonetici'),
      r('POST', `/yonetim/danisan/${ID}/belge`, this.adminUploadDocument, 'yonetici'),
      r('GET', `/yonetim/belge/${ID}`, this.adminDownloadDocument, 'yonetici'),
      r('PUT', `/yonetim/belge/${ID}`, this.adminUpdateDocument, 'yonetici'),
      r('DELETE', `/yonetim/belge/${ID}`, this.adminDeleteDocument, 'yonetici'),
      r('POST', `/yonetim/danisan/${ID}/mesaj`, this.adminSendMessage, 'yonetici'),
      r('POST', '/yonetim/toplu-mesaj', this.adminBroadcast, 'yonetici'),
      r('POST', `/yonetim/danisan/${ID}/sifre-baglantisi`, this.adminResetLink, 'yonetici'),
      r('POST', `/yonetim/danisan/${ID}/abonelik`, this.adminAddSubscription, 'yonetici'),
      r('PUT', `/yonetim/abonelik/${ID}`, this.adminUpdateSubscription, 'yonetici'),
      r('POST', `/yonetim/danisan/${ID}/randevu`, this.adminAddAppointment, 'yonetici'),
      r('PUT', `/yonetim/randevu/${ID}`, this.adminUpdateAppointment, 'yonetici'),
      r('GET', '/yonetim/randevular', this.adminAppointments, 'yonetici'),
      r('GET', '/yonetim/paketler', this.adminPackages, 'yonetici'),
      r('POST', '/yonetim/paketler', this.adminSavePackage, 'yonetici'),
      r('PUT', `/yonetim/paketler/${ID}`, this.adminSavePackage, 'yonetici'),
      r('DELETE', `/yonetim/paketler/${ID}`, this.adminDeletePackage, 'yonetici'),
      r('GET', '/yonetim/kayitlar', this.adminAudit, 'yonetici'),
      r('POST', `/yonetim/danisan/${ID}/sil`, this.adminDeleteClient, 'yonetici'),
    ];
  }

  // ============================================================== Genel

  async fetch(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const ip = req.headers.get('X-Istemci-IP') ?? '';
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.headers.get('X-Portal-Istek') !== '1') fail(403, 'İzin verilmeyen istek.');
        const origin = req.headers.get('Origin');
        if (origin && origin !== url.origin) fail(403, 'İzin verilmeyen istek.');
      }
      let matched = false;
      for (const [method, re, handler, auth] of this.routes) {
        const m = url.pathname.match(re);
        if (!m) continue;
        matched = true;
        if (method !== req.method) continue;
        const c: Ctx = { req, url, ip, params: m.slice(1), user: null };
        if (auth !== 'none') {
          await this.requireKey();
          c.user = await this.sessionUser(req, auth === 'yonetici' ? 'yonetici' : 'danisan');
          if (!c.user) fail(401, 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.');
          if (auth === 'danisan-onayli' && this.missingConsents(c.user!).length)
            fail(428, 'Devam etmek için güncel metinleri onaylamanız gerekiyor.');
        }
        return await handler(c);
      }
      return json({ hata: matched ? 'Bu işlem desteklenmiyor.' : 'Bulunamadı.' }, matched ? 405 : 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ hata: e.message, ...e.extra }, e.status);
      console.error('Danışan sistemi hatası:', e);
      return json({ hata: 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.' }, 500);
    }
  }

  private meta(key: string): string | null {
    const row = this.sql.exec('SELECT value FROM meta WHERE key = ?', key).toArray()[0];
    return row ? String(row.value) : null;
  }

  private setMeta(key: string, value: string) {
    this.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  private get mode(): 'deneme' | 'canli' {
    return this.env.PORTAL_MODU === 'canli' ? 'canli' : 'deneme';
  }

  private key(): Promise<CryptoKey | null> {
    this.keyPromise ??= importDataKey(this.env.VERI_ANAHTARI);
    return this.keyPromise;
  }

  private async requireKey(): Promise<CryptoKey> {
    const k = await this.key();
    if (!k) fail(503, 'Danışan sistemi henüz kurulmadı (veri anahtarı eksik).');
    return k as CryptoKey;
  }

  private audit(actor: string | null, role: string, action: string, target: string | null, detail = '', ip = '') {
    this.sql.exec(
      'INSERT INTO audit (at, actor, role, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
      Date.now(),
      actor,
      role,
      action,
      target,
      detail.slice(0, 300),
      ip,
    );
  }

  private user(id: string, role?: Role): UserRow | null {
    const row = this.sql.exec('SELECT * FROM users WHERE id = ?', id).toArray()[0] as unknown as UserRow | undefined;
    if (!row || (role && row.role !== role)) return null;
    return row;
  }

  private clientOr404(id: string): UserRow {
    const u = this.user(id, 'danisan');
    if (!u) fail(404, 'Danışan bulunamadı.');
    return u as UserRow;
  }

  // ---------------------------------------------------------- Oturum

  private async sessionUser(req: Request, role: Role): Promise<UserRow | null> {
    const token = parseCookies(req)[role === 'yonetici' ? ADMIN_COOKIE : CLIENT_COOKIE];
    if (!token || token.length > 100) return null;
    const hash = await sha256(token);
    const s = this.sql
      .exec('SELECT user_id FROM sessions WHERE token_hash = ? AND role = ? AND expires_at > ?', hash, role, Date.now())
      .toArray()[0];
    if (!s) return null;
    const u = this.user(String(s.user_id), role);
    if (!u || (role === 'yonetici' && u.status !== 'aktif')) return null;
    return u;
  }

  private async createSession(u: UserRow, ip: string): Promise<string> {
    const token = randomId(32);
    const ms = u.role === 'yonetici' ? oturumSuresi.yoneticiSaat * 3600_000 : oturumSuresi.danisanGun * DAY;
    this.sql.exec(
      'INSERT INTO sessions (token_hash, user_id, role, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?)',
      await sha256(token),
      u.id,
      u.role,
      Date.now(),
      Date.now() + ms,
      ip,
    );
    this.sql.exec('UPDATE users SET last_login = ? WHERE id = ?', Date.now(), u.id);
    return cookie(u.role === 'yonetici' ? ADMIN_COOKIE : CLIENT_COOKIE, token, Math.floor(ms / 1000));
  }

  private async endSession(req: Request, role: Role) {
    const token = parseCookies(req)[role === 'yonetici' ? ADMIN_COOKIE : CLIENT_COOKIE];
    if (token) this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
    return cookie(role === 'yonetici' ? ADMIN_COOKIE : CLIENT_COOKIE, '', 0);
  }

  // ---------------------------------------------------------- Deneme sınırlama (kaba kuvvet saldırılarına karşı)

  private checkLocked(keys: string[]) {
    const now = Date.now();
    for (const k of keys) {
      const row = this.sql.exec('SELECT locked_until FROM attempts WHERE key = ?', k).toArray()[0];
      if (row && Number(row.locked_until) > now) {
        const dk = Math.ceil((Number(row.locked_until) - now) / 60000);
        fail(429, `Çok fazla hatalı deneme yapıldı. Lütfen ${dk} dakika sonra tekrar deneyin.`);
      }
    }
  }

  private registerFailure(keys: string[], max = 5, lockMin = 15) {
    const now = Date.now();
    for (const k of keys) {
      const row = this.sql.exec('SELECT count, first_at FROM attempts WHERE key = ?', k).toArray()[0];
      const fresh = !row || now - Number(row.first_at) > 60 * 60 * 1000;
      const count = fresh ? 1 : Number(row!.count) + 1;
      const locked = count >= max ? now + lockMin * 60_000 : 0;
      this.sql.exec(
        `INSERT INTO attempts (key, count, first_at, locked_until) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET count = excluded.count, first_at = excluded.first_at, locked_until = excluded.locked_until`,
        k,
        count >= max ? 0 : count,
        fresh || count >= max ? now : Number(row!.first_at),
        locked,
      );
    }
  }

  private clearFailures(keys: string[]) {
    for (const k of keys) this.sql.exec('DELETE FROM attempts WHERE key = ?', k);
  }

  // ---------------------------------------------------------- Onaylar (KVKK metinleri)

  private missingConsents(u: UserRow): BelgeTuru[] {
    if (u.role !== 'danisan') return [];
    const out: BelgeTuru[] = [];
    for (const type of Object.keys(portalBelgeleri) as BelgeTuru[]) {
      const ok = this.sql
        .exec(
          'SELECT 1 FROM consents WHERE user_id = ? AND type = ? AND version = ? AND withdrawn_at IS NULL LIMIT 1',
          u.id,
          type,
          portalBelgeleri[type].surum,
        )
        .toArray()[0];
      if (!ok) out.push(type);
    }
    return out;
  }

  private addConsent(userId: string, type: string, version: string, ip: string) {
    this.sql.exec(
      'INSERT INTO consents (user_id, type, version, accepted_at, ip) VALUES (?, ?, ?, ?, ?)',
      userId,
      type,
      version,
      Date.now(),
      ip,
    );
  }

  // ---------------------------------------------------------- Profil

  private emptyProfile(): Profile {
    return {
      dogumTarihi: '',
      cinsiyet: '',
      sehir: '',
      meslek: '',
      boy: null,
      hedefKilo: null,
      hedef: '',
      aktivite: '',
      kaynak: '',
      saglik: {
        hastaliklar: [],
        digerHastalik: '',
        ilaclar: '',
        alerjiler: '',
        intoleranslar: '',
        gebelik: 'Yok',
        ameliyatlar: '',
        notlar: '',
      },
      veli: null,
    };
  }

  private parseProfile(b: Record<string, unknown>, partialOf?: Profile): Profile {
    const s = (b.saglik ?? {}) as Record<string, unknown>;
    const base = partialOf ?? this.emptyProfile();
    const today = todayTR();
    const dogumTarihi = isoDate(b.dogumTarihi, 'Doğum tarihi');
    const yas = ageOn(dogumTarihi, today);
    if (yas < 2 || yas > 110) fail(400, 'Doğum tarihini kontrol edin.', { alan: 'Doğum tarihi' });
    const hastaliklar = cleanList(s.hastaliklar).filter((h) => hastalikSecenekleri.includes(h));
    return {
      ...base,
      dogumTarihi,
      cinsiyet: oneOf(b.cinsiyet, ['Kadın', 'Erkek'], 'Cinsiyet'),
      sehir: oneOf(b.sehir, sehirler, 'Yaşadığınız şehir'),
      meslek: text(b.meslek, { max: 80, label: 'Meslek' }),
      boy: num(b.boy, { min: 80, max: 230, label: 'Boy', required: true }),
      hedefKilo: num(b.hedefKilo, { min: 20, max: 350, label: 'Hedef kilo' }),
      hedef: oneOf(b.hedef, hedefSecenekleri, 'Hedefiniz'),
      aktivite: oneOf(b.aktivite, aktiviteSecenekleri, 'Günlük hareket düzeyi'),
      kaynak: partialOf ? base.kaynak : oneOf(b.kaynak, kaynakSecenekleri, 'Bizi nereden duydunuz', false),
      saglik: {
        hastaliklar,
        digerHastalik: text(s.digerHastalik, { max: 300, label: 'Diğer hastalıklar' }),
        ilaclar: longText(s.ilaclar, { max: 600, label: 'Kullandığınız ilaç ve takviyeler' }),
        alerjiler: longText(s.alerjiler, { max: 400, label: 'Besin alerjileri' }),
        intoleranslar: longText(s.intoleranslar, { max: 400, label: 'Besin intoleransları' }),
        gebelik: oneOf(s.gebelik ?? 'Yok', gebelikSecenekleri, 'Gebelik / emzirme'),
        ameliyatlar: longText(s.ameliyatlar, { max: 400, label: 'Geçirilmiş ameliyatlar' }),
        notlar: longText(s.notlar, { max: 1000, label: 'Eklemek istedikleriniz' }),
      },
    };
  }

  private async profileOf(userId: string): Promise<Profile> {
    const row = this.sql.exec('SELECT data_enc FROM profiles WHERE user_id = ?', userId).toArray()[0];
    return decryptJson<Profile>(await this.requireKey(), row ? String(row.data_enc) : null, this.emptyProfile());
  }

  private async saveProfile(userId: string, p: Profile) {
    const enc = await encryptJson(await this.requireKey(), p);
    this.sql.exec(
      'INSERT INTO profiles (user_id, data_enc, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data_enc = excluded.data_enc, updated_at = excluded.updated_at',
      userId,
      enc,
      Date.now(),
    );
  }

  // ---------------------------------------------------------- Ölçümler

  private parseMeasurement(b: Record<string, unknown>, allowed: readonly string[]): Record<string, number> {
    const out: Record<string, number> = {};
    const values = (b.degerler ?? {}) as Record<string, unknown>;
    for (const f of olcumAlanlari) {
      if (!allowed.includes(f.key)) continue;
      const v = num(values[f.key], { min: f.min, max: f.max, label: f.label });
      if (v !== null) out[f.key] = v;
    }
    if (!Object.keys(out).length) fail(400, 'En az bir ölçüm değeri girin.');
    return out;
  }

  private async measurementsOf(userId: string) {
    const key = await this.requireKey();
    const rows = this.sql
      .exec('SELECT id, date, data_enc, source, created_at FROM measurements WHERE user_id = ? ORDER BY date, created_at', userId)
      .toArray();
    const out = [];
    for (const r of rows) {
      out.push({
        id: String(r.id),
        tarih: String(r.date),
        kaynak: String(r.source),
        degerler: await decryptJson<Record<string, number>>(key, String(r.data_enc), {}),
      });
    }
    return out;
  }

  private async insertMeasurement(userId: string, date: string, values: Record<string, number>, source: string, by: string) {
    const id = randomId(12);
    this.sql.exec(
      'INSERT INTO measurements (id, user_id, date, data_enc, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      userId,
      date,
      await encryptJson(await this.requireKey(), values),
      source,
      by,
      Date.now(),
    );
    return id;
  }

  // ---------------------------------------------------------- Paketler, abonelikler, randevular, belgeler, mesajlar

  private packagesList(activeOnly: boolean) {
    const rows = this.sql
      .exec(`SELECT * FROM packages ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY sort, created_at`)
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      ad: String(r.name),
      ozet: String(r.summary),
      icerik: JSON.parse(String(r.items)) as string[],
      sure: String(r.duration),
      fiyat: r.price === null ? null : Number(r.price),
      fiyatGoster: Number(r.show_price) === 1,
      aktif: Number(r.active) === 1,
      sira: Number(r.sort),
    }));
  }

  private async subscriptionsOf(userId: string, forAdmin: boolean) {
    const key = await this.requireKey();
    const rows = this.sql.exec('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC', userId).toArray();
    const out = [];
    for (const r of rows) {
      out.push({
        id: String(r.id),
        paketId: r.package_id ? String(r.package_id) : null,
        paketAdi: String(r.package_name),
        fiyat: r.price === null ? null : Number(r.price),
        durum: String(r.status),
        baslangic: String(r.start_date),
        bitis: String(r.end_date),
        odemeNotu: String(r.payment_note),
        not: await decryptJson<string>(key, r.note_enc ? String(r.note_enc) : null, ''),
        tarih: Number(r.created_at),
        ...(forAdmin ? {} : {}),
      });
    }
    return out;
  }

  private async appointmentsOf(userId: string) {
    const key = await this.requireKey();
    const rows = this.sql.exec('SELECT * FROM appointments WHERE user_id = ? ORDER BY date DESC, time DESC', userId).toArray();
    const out = [];
    for (const r of rows) {
      out.push({
        id: String(r.id),
        tarih: String(r.date),
        saat: String(r.time),
        tur: String(r.type),
        durum: String(r.status),
        not: await decryptJson<string>(key, r.note_enc ? String(r.note_enc) : null, ''),
        olusturan: String(r.created_by),
      });
    }
    return out;
  }

  private documentsOf(userId: string, onlyVisible: boolean) {
    return this.sql
      .exec(
        `SELECT id, title, filename, mime, size, uploaded_by, visible, created_at FROM documents WHERE user_id = ? ${onlyVisible ? 'AND visible = 1' : ''} ORDER BY created_at DESC`,
        userId,
      )
      .toArray()
      .map((r) => ({
        id: String(r.id),
        baslik: String(r.title),
        dosyaAdi: String(r.filename),
        tur: belgeSiniri.turler[String(r.mime)] ?? '',
        boyut: Number(r.size),
        yukleyen: String(r.uploaded_by),
        gorunur: Number(r.visible) === 1,
        tarih: Number(r.created_at),
      }));
  }

  private async messagesOf(u: UserRow) {
    const key = await this.requireKey();
    const rows = this.sql
      .exec(
        `SELECT m.id, m.title, m.body_enc, m.kind, m.created_at, r.read_at FROM messages m
         LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ?
         WHERE m.user_id = ? OR (m.user_id IS NULL AND m.created_at >= ?)
         ORDER BY m.created_at DESC LIMIT 100`,
        u.id,
        u.id,
        u.created_at,
      )
      .toArray();
    const out = [];
    for (const r of rows) {
      out.push({
        id: String(r.id),
        baslik: String(r.title),
        metin: await decryptJson<string>(key, String(r.body_enc), ''),
        tur: String(r.kind),
        tarih: Number(r.created_at),
        okundu: r.read_at !== null,
      });
    }
    return out;
  }

  private async insertMessage(userId: string | null, title: string, body: string, kind: string, by: string) {
    const id = randomId(12);
    this.sql.exec(
      'INSERT INTO messages (id, user_id, title, body_enc, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      userId,
      title,
      await encryptJson(await this.requireKey(), body),
      kind,
      by,
      Date.now(),
    );
    return id;
  }

  private async storeDocument(userId: string, req: Request, by: 'yonetici' | 'danisan') {
    parseMultipartSize(req);
    const form = await req.formData().catch(() => fail(400, 'Dosya okunamadı.'));
    const file = form.get('dosya');
    if (!file || typeof file === 'string') fail(400, 'Bir dosya seçin.');
    const f = file as File;
    if (f.size > belgeSiniri.enFazlaBayt) fail(413, 'Dosya en fazla 10 MB olabilir.');
    if (f.size === 0) fail(400, 'Dosya boş.');
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime || !belgeSiniri.turler[mime]) fail(415, 'Yalnızca PDF, JPG, PNG veya WEBP dosyaları yüklenebilir.');
    const title = text(form.get('baslik') ?? f.name, { max: 120, label: 'Belge adı' }) || safeFilename(f.name);
    const visible = by === 'danisan' ? true : bool(form.get('gorunur') ?? 'true');
    const key = await this.requireKey();
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) chunks.push(await encryptBytes(key, bytes.subarray(i, i + CHUNK)));
    const id = randomId(12);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'INSERT INTO documents (id, user_id, title, filename, mime, size, chunks, uploaded_by, visible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        userId,
        title,
        safeFilename(f.name),
        mime,
        bytes.length,
        chunks.length,
        by,
        visible ? 1 : 0,
        Date.now(),
      );
      chunks.forEach((c, idx) => this.sql.exec('INSERT INTO doc_chunks (doc_id, idx, data) VALUES (?, ?, ?)', id, idx, c));
    });
    return id;
  }

  private async documentResponse(docId: string, userId: string | null) {
    const doc = this.sql.exec('SELECT * FROM documents WHERE id = ?', docId).toArray()[0];
    if (!doc || (userId && (String(doc.user_id) !== userId || Number(doc.visible) !== 1))) fail(404, 'Belge bulunamadı.');
    const key = await this.requireKey();
    const parts = this.sql.exec('SELECT data FROM doc_chunks WHERE doc_id = ? ORDER BY idx', docId).toArray();
    const out = new Uint8Array(Number(doc!.size));
    let off = 0;
    for (const p of parts) {
      const plain = await decryptBytes(key, p.data as ArrayBuffer);
      out.set(plain, off);
      off += plain.length;
    }
    const name = String(doc!.filename);
    const mime = String(doc!.mime);
    // Görseller tam kısıtlı (sandbox) açılır. PDF'te "sandbox" tarayıcının PDF görüntüleyicisini kapattığı için
    // yalnızca çerçeve yasağı uygulanır; yükleme sırasında dosyanın gerçekten PDF olduğu zaten doğrulanır.
    const csp = mime === 'application/pdf'
      ? "frame-ancestors 'none'"
      : "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'";
    return new Response(out, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="belge"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Content-Security-Policy': csp,
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  private deleteDocument(docId: string) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM doc_chunks WHERE doc_id = ?', docId);
      this.sql.exec('DELETE FROM documents WHERE id = ?', docId);
    });
  }

  // ---------------------------------------------------------- Randevu uygunluğu

  private slotsFor(date: string): string[] {
    const d = new Date(`${date}T00:00:00Z`);
    const h = site.hours[(d.getUTCDay() + 6) % 7];
    if (!h?.open || !h.close) return [];
    const md = date.slice(5);
    if (site.closedDates.includes(md) || site.closedDates.includes(date)) return [];
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const out: string[] = [];
    const today = todayTR();
    const now = nowTRMinutes();
    for (let m = toMin(h.open); m + 60 <= toMin(h.close); m += 60) {
      if (date === today && m < now + 60) continue;
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    return out;
  }

  private takenSlots(date: string): Set<string> {
    return new Set(
      this.sql
        .exec("SELECT time FROM appointments WHERE date = ? AND status IN ('talep', 'onaylandi')", date)
        .toArray()
        .map((r) => String(r.time)),
    );
  }

  private checkBookable(date: string, time: string) {
    const today = todayTR();
    if (date < today || date > addDays(today, site.bookingDaysAhead)) fail(400, 'Bu tarih için randevu talebi oluşturulamaz.');
    if (!this.slotsFor(date).includes(time)) fail(400, 'Seçilen gün veya saat çalışma saatleri dışında.');
    if (this.takenSlots(date).has(time)) fail(409, 'Bu saat dolu. Lütfen başka bir saat seçin.');
  }

  // ============================================================== Herkese açık uçlar

  private async status(_c: Ctx) {
    const hazir = Boolean(await this.key());
    const admin = this.sql.exec("SELECT 1 FROM users WHERE role = 'yonetici' AND status = 'aktif' LIMIT 1").toArray()[0];
    return json({ mod: this.mode, hazir, yoneticiVar: Boolean(admin), belgeler: portalBelgeleri });
  }

  private async register(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    this.checkLocked([`kayit:${c.ip}`]);
    if (this.mode === 'deneme') {
      const code = typeof b.denemeKodu === 'string' ? b.denemeKodu.trim() : '';
      if (!this.env.KURULUM_KODU || !code || !safeEqual(code, this.env.KURULUM_KODU)) {
        this.registerFailure([`kayit:${c.ip}`], 10, 30);
        fail(403, 'Deneme sürümünde kayıt için geçerli deneme kodu gerekir.', { alan: 'Deneme kodu' });
      }
    }
    const ad = text(b.ad, { required: true, max: 60, label: 'Ad', min: 2 });
    const soyad = text(b.soyad, { required: true, max: 60, label: 'Soyad', min: 2 });
    const eposta = vEmail(b.eposta);
    const telefon = vPhone(b.telefon);
    const sifre = vPassword(b.sifre);
    const profile = this.parseProfile(b);
    const kilo = num(b.kilo, { min: 20, max: 350, label: 'Kilo', required: true })!;
    const bel = num(b.bel, { min: 40, max: 250, label: 'Bel çevresi' });

    const onay = (b.onaylar ?? {}) as Record<string, unknown>;
    if (!bool(onay.aydinlatma)) fail(400, 'Aydınlatma metnini okuduğunuzu onaylayın.', { alan: 'Aydınlatma' });
    if (!bool(onay.acikRiza)) fail(400, 'Danışan paneli için sağlık verilerine ilişkin açık rıza gereklidir.', { alan: 'Açık rıza' });
    if (!bool(onay.sozlesme)) fail(400, 'Kullanım sözleşmesini onaylayın.', { alan: 'Sözleşme' });
    const minor = ageOn(profile.dogumTarihi, todayTR()) < 18;
    if (minor) {
      const veli = (b.veli ?? {}) as Record<string, unknown>;
      if (!bool(onay.veli)) fail(400, '18 yaşından küçükler için veli veya vasi onayı gereklidir.', { alan: 'Veli onayı' });
      profile.veli = {
        ad: text(veli.ad, { required: true, max: 120, label: 'Veli adı soyadı', min: 3 }),
        telefon: vPhone(veli.telefon, 'Veli telefonu'),
      };
    }

    if (this.sql.exec('SELECT 1 FROM users WHERE email = ?', eposta).toArray()[0])
      fail(409, 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı deneyin.', { alan: 'E-posta' });
    if (this.sql.exec("SELECT 1 FROM users WHERE phone = ? AND role = 'danisan'", telefon).toArray()[0])
      fail(409, 'Bu telefon numarasıyla zaten bir hesap var. Giriş yapmayı deneyin.', { alan: 'Telefon' });

    const { hash, salt } = await hashPassword(sifre);
    const key = await this.requireKey();
    const profileEnc = await encryptJson(key, profile);
    const firstValues: Record<string, number> = { kilo };
    if (bel) firstValues.bel = bel;
    const firstEnc = await encryptJson(key, firstValues);
    const id = randomId(12);
    const now = Date.now();
    const today = todayTR();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'INSERT INTO users (id, role, email, phone, name, pass_hash, pass_salt, status, created_at, minor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        'danisan',
        eposta,
        telefon,
        `${ad} ${soyad}`,
        hash,
        salt,
        'aktif',
        now,
        minor ? 1 : 0,
      );
      this.sql.exec('INSERT INTO profiles (user_id, data_enc, updated_at) VALUES (?, ?, ?)', id, profileEnc, now);
      this.sql.exec(
        'INSERT INTO measurements (id, user_id, date, data_enc, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        randomId(12),
        id,
        today,
        firstEnc,
        'kayit',
        id,
        now,
      );
      for (const type of Object.keys(portalBelgeleri) as BelgeTuru[]) this.addConsent(id, type, portalBelgeleri[type].surum, c.ip);
      if (minor) this.addConsent(id, 'veli', portalBelgeleri.acikRiza.surum, c.ip);
      this.audit(id, 'danisan', 'kayit', id, '', c.ip);
    });
    const u = this.user(id)!;
    const setCookie = await this.createSession(u, c.ip);
    return json({ tamam: true }, 201, { 'Set-Cookie': setCookie });
  }

  private async login(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    const kimlik = text(b.kimlik, { required: true, max: 120, label: 'E-posta veya telefon' }).toLocaleLowerCase('tr');
    const sifre = typeof b.sifre === 'string' ? b.sifre : '';
    const keys = [`g:${kimlik}`, `gip:${c.ip}`];
    this.checkLocked(keys);
    let u: UserRow | undefined;
    if (kimlik.includes('@')) {
      u = this.sql.exec("SELECT * FROM users WHERE email = ? AND role = 'danisan'", kimlik.replace(/\s/g, '')).toArray()[0] as unknown as UserRow;
    } else {
      const d = kimlik.replace(/\D/g, '').replace(/^(90|0)(?=5\d{9}$)/, '');
      u = this.sql.exec("SELECT * FROM users WHERE phone = ? AND role = 'danisan'", d).toArray()[0] as unknown as UserRow;
    }
    const ok = u ? await verifyPassword(sifre, u.pass_hash, u.pass_salt) : (await hashPassword(sifre || 'x'), false);
    if (!ok) {
      this.registerFailure(keys, 5, 15);
      this.audit(u?.id ?? null, 'danisan', 'giris_basarisiz', u?.id ?? null, '', c.ip);
      fail(401, 'E-posta/telefon veya şifre hatalı.');
    }
    this.clearFailures([`g:${kimlik}`]);
    if (u!.status === 'pasif') fail(403, 'Hesabınız pasif durumda. Lütfen diyetisyeninizle iletişime geçin.');
    const setCookie = await this.createSession(u!, c.ip);
    this.audit(u!.id, 'danisan', 'giris', u!.id, '', c.ip);
    return json({ tamam: true }, 200, { 'Set-Cookie': setCookie });
  }

  private async logout(c: Ctx) {
    const u = (await this.key()) ? await this.sessionUser(c.req, 'danisan') : null;
    const setCookie = await this.endSession(c.req, 'danisan');
    if (u) this.audit(u.id, 'danisan', 'cikis', u.id, '', c.ip);
    return json({ tamam: true }, 200, { 'Set-Cookie': setCookie });
  }

  private async resetPassword(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    const token = typeof b.bilet === 'string' ? b.bilet : '';
    this.checkLocked([`sy:${c.ip}`]);
    const row = token
      ? this.sql
          .exec("SELECT user_id FROM tickets WHERE token_hash = ? AND kind = 'sifre' AND expires_at > ?", await sha256(token), Date.now())
          .toArray()[0]
      : undefined;
    if (!row) {
      this.registerFailure([`sy:${c.ip}`], 10, 30);
      fail(400, 'Bağlantının süresi dolmuş veya bağlantı geçersiz. Diyetisyeninizden yeni bir bağlantı isteyin.');
    }
    const sifre = vPassword(b.sifre);
    const { hash, salt } = await hashPassword(sifre);
    const userId = String(row!.user_id);
    this.sql.exec('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, userId);
    this.sql.exec('DELETE FROM tickets WHERE user_id = ? AND kind = ?', userId, 'sifre');
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', userId);
    this.clearFailures([`sy:${c.ip}`]);
    this.audit(userId, 'danisan', 'sifre_yenile', userId, '', c.ip);
    return json({ tamam: true });
  }

  // ============================================================== Danışan uçları

  private async me(c: Ctx) {
    const u = c.user!;
    return json({
      mod: this.mode,
      kullanici: { ad: u.name, eposta: u.email, telefon: u.phone, durum: u.status, kayit: u.created_at },
      onayGerekli: this.missingConsents(u),
      belgeler: portalBelgeleri,
    });
  }

  private async acceptDocs(c: Ctx) {
    const u = c.user!;
    const b = await readJson(c.req);
    const types = cleanList(b.turler, 5).filter((t): t is BelgeTuru => t in portalBelgeleri);
    const missing = this.missingConsents(u);
    for (const t of missing) if (!types.includes(t)) fail(400, `${portalBelgeleri[t].baslik} onaylanmadı.`);
    for (const t of missing) this.addConsent(u.id, t, portalBelgeleri[t].surum, c.ip);
    if (u.status === 'riza_geri_cekildi') this.sql.exec("UPDATE users SET status = 'aktif' WHERE id = ?", u.id);
    this.audit(u.id, 'danisan', 'onay', u.id, missing.join(','), c.ip);
    return json({ tamam: true });
  }

  private async withdrawConsent(c: Ctx) {
    const u = c.user!;
    this.sql.exec("UPDATE consents SET withdrawn_at = ? WHERE user_id = ? AND type = 'acikRiza' AND withdrawn_at IS NULL", Date.now(), u.id);
    this.sql.exec("UPDATE users SET status = 'riza_geri_cekildi' WHERE id = ?", u.id);
    this.audit(u.id, 'danisan', 'riza_geri_cek', u.id, '', c.ip);
    return json({ tamam: true });
  }

  private async deletionRequest(c: Ctx) {
    const u = c.user!;
    this.sql.exec("UPDATE users SET status = 'silme_talebi' WHERE id = ?", u.id);
    this.audit(u.id, 'danisan', 'silme_talebi', u.id, '', c.ip);
    return json({ tamam: true });
  }

  private async cancelDeletion(c: Ctx) {
    const u = c.user!;
    if (u.status === 'silme_talebi') this.sql.exec("UPDATE users SET status = 'aktif' WHERE id = ?", u.id);
    this.audit(u.id, 'danisan', 'silme_talebi_iptal', u.id, '', c.ip);
    return json({ tamam: true });
  }

  private async exportData(c: Ctx) {
    const u = c.user!;
    const data = {
      aciklama: 'Diyetisyen Eylem Dizman danışan panelinde sizinle ilgili tutulan veriler (KVKK md. 11).',
      olusturma: new Date().toISOString(),
      hesap: { ad: u.name, eposta: u.email, telefon: u.phone, durum: u.status, kayit: new Date(u.created_at).toISOString() },
      profil: await this.profileOf(u.id),
      olcumler: await this.measurementsOf(u.id),
      paketler: await this.subscriptionsOf(u.id, false),
      randevular: await this.appointmentsOf(u.id),
      belgeler: this.documentsOf(u.id, true).map(({ baslik, dosyaAdi, tarih }) => ({ baslik, dosyaAdi, tarih })),
      mesajlar: await this.messagesOf(u),
      onaylar: this.sql
        .exec('SELECT type, version, accepted_at, withdrawn_at FROM consents WHERE user_id = ? ORDER BY accepted_at', u.id)
        .toArray(),
    };
    this.audit(u.id, 'danisan', 'veri_indir', u.id, '', c.ip);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="verilerim-${todayTR()}.json"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  private async changePassword(c: Ctx) {
    const u = c.user!;
    const b = await readJson(c.req);
    const eski = typeof b.eski === 'string' ? b.eski : '';
    this.checkLocked([`sd:${u.id}`]);
    if (!(await verifyPassword(eski, u.pass_hash, u.pass_salt))) {
      this.registerFailure([`sd:${u.id}`], 5, 15);
      fail(400, 'Mevcut şifre hatalı.', { alan: 'Mevcut şifre' });
    }
    const yeni = vPassword(b.yeni, u.role === 'yonetici' ? 12 : 8);
    const { hash, salt } = await hashPassword(yeni);
    this.sql.exec('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, u.id);
    const cookieName = u.role === 'yonetici' ? ADMIN_COOKIE : CLIENT_COOKIE;
    const current = parseCookies(c.req)[cookieName];
    const keep = current ? await sha256(current) : '';
    this.sql.exec('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', u.id, keep);
    this.audit(u.id, u.role, 'sifre_degistir', u.id, '', c.ip);
    return json({ tamam: true });
  }

  private async panel(c: Ctx) {
    const u = c.user!;
    return json({
      mod: this.mode,
      kullanici: { ad: u.name, eposta: u.email, telefon: u.phone, durum: u.status, kayit: u.created_at },
      profil: await this.profileOf(u.id),
      olcumler: await this.measurementsOf(u.id),
      paketler: this.packagesList(true).map(({ fiyat, fiyatGoster, ...p }) => ({ ...p, fiyat: fiyatGoster ? fiyat : null })),
      aboneliklerim: await this.subscriptionsOf(u.id, false),
      randevular: await this.appointmentsOf(u.id),
      belgeler: this.documentsOf(u.id, true),
      mesajlar: await this.messagesOf(u),
      takvim: { saatler: site.hours, kapali: site.closedDates, ileriGun: site.bookingDaysAhead, bugun: todayTR() },
      whatsapp: site.whatsappNumber,
    });
  }

  private async updateProfile(c: Ctx) {
    const u = c.user!;
    const b = await readJson(c.req);
    const current = await this.profileOf(u.id);
    const p = this.parseProfile(b, current);
    if (u.minor && ageOn(p.dogumTarihi, todayTR()) >= 18) p.veli = current.veli;
    await this.saveProfile(u.id, p);
    this.audit(u.id, 'danisan', 'profil_guncelle', u.id, '', c.ip);
    return json({ tamam: true, profil: p });
  }

  private async addOwnMeasurement(c: Ctx) {
    const u = c.user!;
    const b = await readJson(c.req);
    const date = isoDate(b.tarih, 'Tarih');
    if (date > todayTR()) fail(400, 'İleri bir tarih için ölçüm girilemez.');
    const values = this.parseMeasurement(b, danisanOlcumAlanlari);
    const id = await this.insertMeasurement(u.id, date, values, 'danisan', u.id);
    this.audit(u.id, 'danisan', 'olcum_ekle', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async deleteOwnMeasurement(c: Ctx) {
    const u = c.user!;
    const res = this.sql.exec(
      "DELETE FROM measurements WHERE id = ? AND user_id = ? AND source = 'danisan'",
      c.params[0],
      u.id,
    );
    if (!res.rowsWritten) fail(404, 'Yalnızca kendi eklediğiniz ölçümleri silebilirsiniz.');
    this.audit(u.id, 'danisan', 'olcum_sil', u.id, c.params[0], c.ip);
    return json({ tamam: true });
  }

  private async packageRequest(c: Ctx) {
    const u = c.user!;
    const b = await readJson(c.req);
    const pkg = this.sql.exec('SELECT * FROM packages WHERE id = ? AND active = 1', String(b.paketId ?? '')).toArray()[0];
    if (!pkg) fail(404, 'Paket bulunamadı.');
    const open = this.sql
      .exec("SELECT 1 FROM subscriptions WHERE user_id = ? AND package_id = ? AND status IN ('talep', 'odeme')", u.id, String(pkg!.id))
      .toArray()[0];
    if (open) fail(409, 'Bu paket için bekleyen bir talebiniz zaten var.');
    const note = longText(b.not, { max: 500, label: 'Not' });
    const id = randomId(12);
    this.sql.exec(
      'INSERT INTO subscriptions (id, user_id, package_id, package_name, price, status, note_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      u.id,
      String(pkg!.id),
      String(pkg!.name),
      pkg!.price === null ? null : Number(pkg!.price),
      'talep',
      note ? await encryptJson(await this.requireKey(), note) : null,
      Date.now(),
      Date.now(),
    );
    this.audit(u.id, 'danisan', 'paket_talebi', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async availability(c: Ctx) {
    const date = isoDate(c.url.searchParams.get('tarih'), 'Tarih');
    const taken = this.takenSlots(date);
    const today = todayTR();
    const inRange = date >= today && date <= addDays(today, site.bookingDaysAhead);
    return json({ tarih: date, saatler: inRange ? this.slotsFor(date).map((s) => ({ saat: s, dolu: taken.has(s) })) : [] });
  }

  private async appointmentRequest(c: Ctx) {
    const u = c.user!;
    const b = await readJson(c.req);
    const date = isoDate(b.tarih, 'Tarih');
    const time = text(b.saat, { required: true, max: 5, label: 'Saat' });
    const type = oneOf(b.tur, ['yuz-yuze', 'online'], 'Görüşme türü');
    const note = longText(b.not, { max: 500, label: 'Not' });
    const open = this.sql
      .exec("SELECT COUNT(*) AS n FROM appointments WHERE user_id = ? AND status = 'talep'", u.id)
      .toArray()[0];
    if (Number(open?.n ?? 0) >= 3) fail(409, 'Onay bekleyen 3 randevu talebiniz var. Lütfen onaylanmasını bekleyin.');
    this.checkBookable(date, time);
    const id = randomId(12);
    this.sql.exec(
      'INSERT INTO appointments (id, user_id, date, time, type, status, note_enc, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      u.id,
      date,
      time,
      type,
      'talep',
      note ? await encryptJson(await this.requireKey(), note) : null,
      'danisan',
      Date.now(),
      Date.now(),
    );
    this.audit(u.id, 'danisan', 'randevu_talebi', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async cancelOwnAppointment(c: Ctx) {
    const u = c.user!;
    const res = this.sql.exec(
      "UPDATE appointments SET status = 'iptal', updated_at = ? WHERE id = ? AND user_id = ? AND status IN ('talep', 'onaylandi') AND date >= ?",
      Date.now(),
      c.params[0],
      u.id,
      todayTR(),
    );
    if (!res.rowsWritten) fail(404, 'Randevu bulunamadı veya iptal edilemez.');
    this.audit(u.id, 'danisan', 'randevu_iptal', u.id, c.params[0], c.ip);
    return json({ tamam: true });
  }

  private async uploadOwnDocument(c: Ctx) {
    const u = c.user!;
    const count = Number(
      this.sql.exec("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND uploaded_by = 'danisan'", u.id).toArray()[0]?.n ?? 0,
    );
    if (count >= 20) fail(409, 'En fazla 20 belge yükleyebilirsiniz. Gereksiz olanları diyetisyeninizden sildirebilirsiniz.');
    const id = await this.storeDocument(u.id, c.req, 'danisan');
    this.audit(u.id, 'danisan', 'belge_yukle', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async downloadOwnDocument(c: Ctx) {
    const u = c.user!;
    const res = await this.documentResponse(c.params[0], u.id);
    this.audit(u.id, 'danisan', 'belge_indir', u.id, c.params[0], c.ip);
    return res;
  }

  private async markRead(c: Ctx) {
    const u = c.user!;
    const m = this.sql
      .exec('SELECT 1 FROM messages WHERE id = ? AND (user_id = ? OR user_id IS NULL)', c.params[0], u.id)
      .toArray()[0];
    if (!m) fail(404, 'Mesaj bulunamadı.');
    this.sql.exec('INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)', c.params[0], u.id, Date.now());
    return json({ tamam: true });
  }

  // ============================================================== Yönetici: kurulum ve giriş

  private async adminStatus(_c: Ctx) {
    const admin = this.sql.exec("SELECT 1 FROM users WHERE role = 'yonetici' AND status = 'aktif' LIMIT 1").toArray()[0];
    return json({ mod: this.mode, hazir: Boolean(await this.key()), kurulumGerekli: !admin, kodTanimli: Boolean(this.env.KURULUM_KODU) });
  }

  private checkSetupCode(code: unknown, ip: string) {
    this.checkLocked([`kurulum:${ip}`]);
    const c = typeof code === 'string' ? code.trim() : '';
    if (!this.env.KURULUM_KODU || !c || !safeEqual(c, this.env.KURULUM_KODU)) {
      this.registerFailure([`kurulum:${ip}`], 5, 60);
      fail(403, 'Kurulum kodu hatalı.', { alan: 'Kurulum kodu' });
    }
  }

  private async newTotp(userId: string, email: string) {
    const secret = base32(randomBytes(20));
    this.sql.exec(
      'UPDATE users SET totp_enc = ?, totp_last = -1 WHERE id = ?',
      await encryptJson(await this.requireKey(), secret),
      userId,
    );
    const ticket = randomId(24);
    this.sql.exec(
      'INSERT INTO tickets (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)',
      await sha256(ticket),
      userId,
      'kurulum',
      Date.now() + 15 * 60_000,
    );
    const label = encodeURIComponent(`Eylem Dizman Paneli:${email}`);
    return {
      bilet: ticket,
      anahtar: secret.replace(/(.{4})/g, '$1 ').trim(),
      otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Eylem Dizman Paneli')}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  private async adminSetup(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    this.checkSetupCode(b.kod, c.ip);
    if (this.sql.exec("SELECT 1 FROM users WHERE role = 'yonetici' AND status = 'aktif'").toArray()[0])
      fail(409, 'Yönetici hesabı zaten kurulmuş. Giriş sayfasını kullanın.');
    const ad = text(b.ad, { required: true, max: 80, label: 'Ad Soyad', min: 3 });
    const eposta = vEmail(b.eposta);
    const sifre = vPassword(b.sifre, 12);
    const { hash, salt } = await hashPassword(sifre);
    this.sql.exec("DELETE FROM users WHERE role = 'yonetici' AND status = 'kurulum'");
    if (this.sql.exec('SELECT 1 FROM users WHERE email = ?', eposta).toArray()[0]) fail(409, 'Bu e-posta başka bir hesapta kayıtlı.');
    const id = randomId(12);
    this.sql.exec(
      'INSERT INTO users (id, role, email, phone, name, pass_hash, pass_salt, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      'yonetici',
      eposta,
      '',
      ad,
      hash,
      salt,
      'kurulum',
      Date.now(),
    );
    this.clearFailures([`kurulum:${c.ip}`]);
    return json(await this.newTotp(id, eposta));
  }

  private async adminSetupVerify(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    const ticket = typeof b.bilet === 'string' ? b.bilet : '';
    const row = ticket
      ? this.sql
          .exec("SELECT user_id FROM tickets WHERE token_hash = ? AND kind = 'kurulum' AND expires_at > ?", await sha256(ticket), Date.now())
          .toArray()[0]
      : undefined;
    if (!row) fail(400, 'Kurulum süresi doldu. Lütfen baştan başlayın.');
    const u = this.user(String(row!.user_id), 'yonetici');
    if (!u || !u.totp_enc) fail(400, 'Kurulum süresi doldu. Lütfen baştan başlayın.');
    this.checkLocked([`kd:${u!.id}`]);
    const secret = await decryptJson<string>(await this.requireKey(), u!.totp_enc, '');
    const counter = await verifyTotp(secret, String(b.kod ?? ''), -1);
    if (counter === null) {
      this.registerFailure([`kd:${u!.id}`], 8, 15);
      fail(400, 'Doğrulama kodu hatalı. Telefonunuzdaki uygulamada görünen 6 haneli kodu yazın.', { alan: 'Doğrulama kodu' });
    }
    this.sql.exec("UPDATE users SET status = 'aktif', totp_last = ? WHERE id = ?", counter, u!.id);
    this.sql.exec("DELETE FROM tickets WHERE user_id = ? AND kind = 'kurulum'", u!.id);
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', u!.id);
    this.audit(u!.id, 'yonetici', 'yonetici_kurulum', null, '', c.ip);
    const setCookie = await this.createSession({ ...u!, status: 'aktif' }, c.ip);
    return json({ tamam: true }, 200, { 'Set-Cookie': setCookie });
  }

  private async adminReset2fa(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    this.checkSetupCode(b.kod, c.ip);
    const eposta = vEmail(b.eposta);
    const u = this.sql.exec("SELECT * FROM users WHERE email = ? AND role = 'yonetici'", eposta).toArray()[0] as unknown as
      | UserRow
      | undefined;
    const ok = u ? await verifyPassword(String(b.sifre ?? ''), u.pass_hash, u.pass_salt) : false;
    if (!ok) {
      this.registerFailure([`kurulum:${c.ip}`], 5, 60);
      fail(403, 'E-posta veya şifre hatalı.');
    }
    this.audit(u!.id, 'yonetici', 'iki_adim_sifirla', null, '', c.ip);
    return json(await this.newTotp(u!.id, u!.email));
  }

  private async adminLogin(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    const eposta = text(b.eposta, { required: true, max: 120, label: 'E-posta' }).toLocaleLowerCase('tr').replace(/\s/g, '');
    const keys = [`y:${eposta}`, `yip:${c.ip}`];
    this.checkLocked(keys);
    const u = this.sql.exec("SELECT * FROM users WHERE email = ? AND role = 'yonetici' AND status = 'aktif'", eposta).toArray()[0] as unknown as
      | UserRow
      | undefined;
    const ok = u ? await verifyPassword(String(b.sifre ?? ''), u.pass_hash, u.pass_salt) : (await hashPassword('x'), false);
    if (!ok) {
      this.registerFailure(keys, 5, 30);
      this.audit(u?.id ?? null, 'yonetici', 'yonetici_giris_basarisiz', null, '', c.ip);
      fail(401, 'E-posta veya şifre hatalı.');
    }
    const ticket = randomId(24);
    this.sql.exec(
      'INSERT INTO tickets (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)',
      await sha256(ticket),
      u!.id,
      'giris',
      Date.now() + 5 * 60_000,
    );
    return json({ adim: 'dogrulama', bilet: ticket });
  }

  private async adminLoginVerify(c: Ctx) {
    await this.requireKey();
    const b = await readJson(c.req);
    const ticket = typeof b.bilet === 'string' ? b.bilet : '';
    const row = ticket
      ? this.sql
          .exec("SELECT user_id FROM tickets WHERE token_hash = ? AND kind = 'giris' AND expires_at > ?", await sha256(ticket), Date.now())
          .toArray()[0]
      : undefined;
    if (!row) fail(400, 'Giriş süresi doldu. Lütfen e-posta ve şifrenizle yeniden giriş yapın.');
    const u = this.user(String(row!.user_id), 'yonetici')!;
    const keys = [`yd:${u.id}`];
    this.checkLocked(keys);
    const secret = await decryptJson<string>(await this.requireKey(), u.totp_enc, '');
    const counter = await verifyTotp(secret, String(b.kod ?? ''), u.totp_last);
    if (counter === null) {
      this.registerFailure(keys, 5, 30);
      this.audit(u.id, 'yonetici', 'yonetici_giris_basarisiz', null, 'dogrulama kodu', c.ip);
      fail(400, 'Doğrulama kodu hatalı.', { alan: 'Doğrulama kodu' });
    }
    this.clearFailures([...keys, `y:${u.email}`]);
    this.sql.exec('UPDATE users SET totp_last = ? WHERE id = ?', counter, u.id);
    this.sql.exec("DELETE FROM tickets WHERE user_id = ? AND kind = 'giris'", u.id);
    const setCookie = await this.createSession(u, c.ip);
    this.audit(u.id, 'yonetici', 'yonetici_giris', null, '', c.ip);
    return json({ tamam: true }, 200, { 'Set-Cookie': setCookie });
  }

  private async adminLogout(c: Ctx) {
    const setCookie = await this.endSession(c.req, 'yonetici');
    return json({ tamam: true }, 200, { 'Set-Cookie': setCookie });
  }

  private async adminMe(c: Ctx) {
    const u = c.user!;
    return json({ mod: this.mode, ad: u.name, eposta: u.email, whatsapp: site.whatsappNumber, belgeler: portalBelgeleri });
  }

  // ============================================================== Yönetici: danışanlar

  private async adminOverview(_c: Ctx) {
    const key = await this.requireKey();
    const today = todayTR();
    const tomorrow = addDays(today, 1);
    const count = (q: string, ...p: SqlStorageValue[]) => Number(this.sql.exec(q, ...p).toArray()[0]?.n ?? 0);
    const apptRows = this.sql
      .exec(
        `SELECT a.*, u.name, u.phone FROM appointments a JOIN users u ON u.id = a.user_id
         WHERE (a.status = 'talep' AND a.date >= ?) OR (a.status = 'onaylandi' AND a.date BETWEEN ? AND ?)
         ORDER BY a.date, a.time LIMIT 100`,
        today,
        today,
        addDays(today, 7),
      )
      .toArray();
    const randevular = [];
    for (const r of apptRows)
      randevular.push({
        id: String(r.id),
        danisanId: String(r.user_id),
        ad: String(r.name),
        telefon: String(r.phone),
        tarih: String(r.date),
        saat: String(r.time),
        tur: String(r.type),
        durum: String(r.status),
        not: await decryptJson<string>(key, r.note_enc ? String(r.note_enc) : null, ''),
      });
    const paketTalepleri = this.sql
      .exec(
        `SELECT s.id, s.user_id, s.package_name, s.status, s.price, s.created_at, u.name, u.phone FROM subscriptions s
         JOIN users u ON u.id = s.user_id WHERE s.status IN ('talep', 'odeme') ORDER BY s.created_at`,
      )
      .toArray()
      .map((r) => ({
        id: String(r.id),
        danisanId: String(r.user_id),
        ad: String(r.name),
        telefon: String(r.phone),
        paket: String(r.package_name),
        durum: String(r.status),
        fiyat: r.price === null ? null : Number(r.price),
        tarih: Number(r.created_at),
      }));
    const bitenPaketler = this.sql
      .exec(
        `SELECT s.id, s.user_id, s.package_name, s.end_date, u.name, u.phone FROM subscriptions s JOIN users u ON u.id = s.user_id
         WHERE s.status = 'aktif' AND s.end_date != '' AND s.end_date BETWEEN ? AND ? ORDER BY s.end_date`,
        today,
        addDays(today, 7),
      )
      .toArray()
      .map((r) => ({
        id: String(r.id),
        danisanId: String(r.user_id),
        ad: String(r.name),
        telefon: String(r.phone),
        paket: String(r.package_name),
        bitis: String(r.end_date),
      }));
    const talepler = this.sql
      .exec("SELECT id, name, phone, status FROM users WHERE role = 'danisan' AND status IN ('silme_talebi', 'riza_geri_cekildi')")
      .toArray()
      .map((r) => ({ id: String(r.id), ad: String(r.name), telefon: String(r.phone), durum: String(r.status) }));
    return json({
      bugun: today,
      yarin: tomorrow,
      sayilar: {
        danisan: count("SELECT COUNT(*) AS n FROM users WHERE role = 'danisan'"),
        aktifPaket: count("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'aktif'"),
        bekleyenRandevu: count("SELECT COUNT(*) AS n FROM appointments WHERE status = 'talep' AND date >= ?", today),
        bekleyenPaket: count("SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('talep', 'odeme')"),
      },
      randevular,
      paketTalepleri,
      bitenPaketler,
      talepler,
    });
  }

  private async adminClients(c: Ctx) {
    const q = (c.url.searchParams.get('q') ?? '').trim().toLocaleLowerCase('tr').slice(0, 60);
    const rows = this.sql
      .exec(
        `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, u.last_login,
           (SELECT package_name || '|' || status FROM subscriptions s WHERE s.user_id = u.id ORDER BY
              CASE status WHEN 'aktif' THEN 0 WHEN 'odeme' THEN 1 WHEN 'talep' THEN 2 ELSE 3 END, s.created_at DESC LIMIT 1) AS pkg,
           (SELECT MAX(date) FROM measurements m WHERE m.user_id = u.id) AS last_measure,
           (SELECT MIN(date || ' ' || time) FROM appointments a WHERE a.user_id = u.id AND a.status IN ('talep','onaylandi') AND a.date >= ?) AS next_appt
         FROM users u WHERE u.role = 'danisan' ORDER BY u.created_at DESC`,
        todayTR(),
      )
      .toArray();
    const list = rows
      .map((r) => {
        const [paket, paketDurum] = r.pkg ? String(r.pkg).split('|') : ['', ''];
        return {
          id: String(r.id),
          ad: String(r.name),
          eposta: String(r.email),
          telefon: String(r.phone),
          durum: String(r.status),
          kayit: Number(r.created_at),
          sonGiris: r.last_login === null ? null : Number(r.last_login),
          paket,
          paketDurum,
          sonOlcum: r.last_measure ? String(r.last_measure) : '',
          sonrakiRandevu: r.next_appt ? String(r.next_appt) : '',
        };
      })
      .filter(
        (d) =>
          !q ||
          d.ad.toLocaleLowerCase('tr').includes(q) ||
          d.eposta.includes(q) ||
          d.telefon.includes(q.replace(/\D/g, '') || '§'),
      );
    return json({ danisanlar: list });
  }

  private async adminClient(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const key = await this.requireKey();
    const note = this.sql.exec('SELECT body_enc, updated_at FROM notes WHERE user_id = ?', u.id).toArray()[0];
    const consents = this.sql
      .exec('SELECT type, version, accepted_at, withdrawn_at FROM consents WHERE user_id = ? ORDER BY accepted_at DESC', u.id)
      .toArray()
      .map((r) => ({
        tur: String(r.type),
        surum: String(r.version),
        tarih: Number(r.accepted_at),
        geriCekme: r.withdrawn_at === null ? null : Number(r.withdrawn_at),
      }));
    const msgs = this.sql
      .exec('SELECT id, title, body_enc, kind, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', u.id)
      .toArray();
    const mesajlar = [];
    for (const m of msgs)
      mesajlar.push({
        id: String(m.id),
        baslik: String(m.title),
        metin: await decryptJson<string>(key, String(m.body_enc), ''),
        tur: String(m.kind),
        tarih: Number(m.created_at),
        okundu: Boolean(
          this.sql.exec('SELECT 1 FROM message_reads WHERE message_id = ? AND user_id = ?', String(m.id), u.id).toArray()[0],
        ),
      });
    this.audit(c.user!.id, 'yonetici', 'danisan_goruntule', u.id, '', c.ip);
    return json({
      danisan: {
        id: u.id,
        ad: u.name,
        eposta: u.email,
        telefon: u.phone,
        durum: u.status,
        kayit: u.created_at,
        sonGiris: u.last_login,
        resit: !u.minor,
      },
      profil: await this.profileOf(u.id),
      olcumler: await this.measurementsOf(u.id),
      abonelikler: await this.subscriptionsOf(u.id, true),
      randevular: await this.appointmentsOf(u.id),
      belgeler: this.documentsOf(u.id, false),
      mesajlar,
      not: note ? await decryptJson<string>(key, String(note.body_enc), '') : '',
      notTarihi: note ? Number(note.updated_at) : null,
      onaylar: consents,
      eksikOnaylar: this.missingConsents(u),
      paketler: this.packagesList(false),
    });
  }

  private async adminSetStatus(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const b = await readJson(c.req);
    const durum = oneOf(b.durum, ['aktif', 'pasif'], 'Durum');
    this.sql.exec('UPDATE users SET status = ? WHERE id = ?', durum, u.id);
    if (durum === 'pasif') this.sql.exec('DELETE FROM sessions WHERE user_id = ?', u.id);
    this.audit(c.user!.id, 'yonetici', 'danisan_durum', u.id, durum, c.ip);
    return json({ tamam: true });
  }

  private async adminSetNote(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const b = await readJson(c.req);
    const body = longText(b.not, { max: 8000, label: 'Not' });
    this.sql.exec(
      'INSERT INTO notes (user_id, body_enc, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET body_enc = excluded.body_enc, updated_at = excluded.updated_at',
      u.id,
      await encryptJson(await this.requireKey(), body),
      Date.now(),
    );
    this.audit(c.user!.id, 'yonetici', 'not_guncelle', u.id, '', c.ip);
    return json({ tamam: true });
  }

  private async adminAddMeasurement(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const b = await readJson(c.req);
    const date = isoDate(b.tarih, 'Tarih');
    if (date > todayTR()) fail(400, 'İleri bir tarih için ölçüm girilemez.');
    const values = this.parseMeasurement(b, olcumAlanlari.map((f) => f.key));
    const id = await this.insertMeasurement(u.id, date, values, 'klinik', c.user!.id);
    this.audit(c.user!.id, 'yonetici', 'olcum_ekle', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async adminUpdateMeasurement(c: Ctx) {
    const row = this.sql.exec('SELECT user_id FROM measurements WHERE id = ?', c.params[0]).toArray()[0];
    if (!row) fail(404, 'Ölçüm bulunamadı.');
    const b = await readJson(c.req);
    const date = isoDate(b.tarih, 'Tarih');
    const values = this.parseMeasurement(b, olcumAlanlari.map((f) => f.key));
    this.sql.exec(
      'UPDATE measurements SET date = ?, data_enc = ? WHERE id = ?',
      date,
      await encryptJson(await this.requireKey(), values),
      c.params[0],
    );
    this.audit(c.user!.id, 'yonetici', 'olcum_guncelle', String(row!.user_id), c.params[0], c.ip);
    return json({ tamam: true });
  }

  private async adminDeleteMeasurement(c: Ctx) {
    const row = this.sql.exec('SELECT user_id FROM measurements WHERE id = ?', c.params[0]).toArray()[0];
    if (!row) fail(404, 'Ölçüm bulunamadı.');
    this.sql.exec('DELETE FROM measurements WHERE id = ?', c.params[0]);
    this.audit(c.user!.id, 'yonetici', 'olcum_sil', String(row!.user_id), c.params[0], c.ip);
    return json({ tamam: true });
  }

  private async adminUploadDocument(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const id = await this.storeDocument(u.id, c.req, 'yonetici');
    this.audit(c.user!.id, 'yonetici', 'belge_yukle', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async adminDownloadDocument(c: Ctx) {
    const doc = this.sql.exec('SELECT user_id FROM documents WHERE id = ?', c.params[0]).toArray()[0];
    const res = await this.documentResponse(c.params[0], null);
    this.audit(c.user!.id, 'yonetici', 'belge_indir', doc ? String(doc.user_id) : null, c.params[0], c.ip);
    return res;
  }

  private async adminUpdateDocument(c: Ctx) {
    const doc = this.sql.exec('SELECT user_id FROM documents WHERE id = ?', c.params[0]).toArray()[0];
    if (!doc) fail(404, 'Belge bulunamadı.');
    const b = await readJson(c.req);
    const title = text(b.baslik, { required: true, max: 120, label: 'Belge adı' });
    this.sql.exec('UPDATE documents SET title = ?, visible = ? WHERE id = ?', title, bool(b.gorunur) ? 1 : 0, c.params[0]);
    this.audit(c.user!.id, 'yonetici', 'belge_guncelle', String(doc!.user_id), c.params[0], c.ip);
    return json({ tamam: true });
  }

  private async adminDeleteDocument(c: Ctx) {
    const doc = this.sql.exec('SELECT user_id FROM documents WHERE id = ?', c.params[0]).toArray()[0];
    if (!doc) fail(404, 'Belge bulunamadı.');
    this.deleteDocument(c.params[0]);
    this.audit(c.user!.id, 'yonetici', 'belge_sil', String(doc!.user_id), c.params[0], c.ip);
    return json({ tamam: true });
  }

  private async adminSendMessage(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const b = await readJson(c.req);
    const title = text(b.baslik, { required: true, max: 120, label: 'Başlık' });
    const body = longText(b.metin, { required: true, max: 3000, label: 'Mesaj' });
    const id = await this.insertMessage(u.id, title, body, 'mesaj', c.user!.id);
    this.audit(c.user!.id, 'yonetici', 'mesaj_gonder', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async adminBroadcast(c: Ctx) {
    const b = await readJson(c.req);
    const title = text(b.baslik, { required: true, max: 120, label: 'Başlık' });
    const body = longText(b.metin, { required: true, max: 3000, label: 'Mesaj' });
    const id = await this.insertMessage(null, title, body, 'duyuru', c.user!.id);
    const n = Number(this.sql.exec("SELECT COUNT(*) AS n FROM users WHERE role = 'danisan' AND status = 'aktif'").toArray()[0]?.n ?? 0);
    this.audit(c.user!.id, 'yonetici', 'toplu_mesaj', null, id, c.ip);
    return json({ tamam: true, id, alici: n }, 201);
  }

  private async adminResetLink(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const token = randomId(32);
    this.sql.exec("DELETE FROM tickets WHERE user_id = ? AND kind = 'sifre'", u.id);
    this.sql.exec(
      'INSERT INTO tickets (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)',
      await sha256(token),
      u.id,
      'sifre',
      Date.now() + 48 * 3600_000,
    );
    this.audit(c.user!.id, 'yonetici', 'sifre_baglantisi', u.id, '', c.ip);
    return json({ baglanti: `${c.url.origin}/danisan/sifre-yenile/#${token}`, gecerlilik: '48 saat' });
  }

  private parseSubscription(b: Record<string, unknown>) {
    const durum = oneOf(b.durum, Object.keys(paketDurumlari) as (keyof typeof paketDurumlari)[], 'Durum');
    const baslangic = isoDate(b.baslangic, 'Başlangıç', false);
    const bitis = isoDate(b.bitis, 'Bitiş', false);
    if (baslangic && bitis && bitis < baslangic) fail(400, 'Bitiş tarihi başlangıçtan önce olamaz.');
    return {
      durum,
      baslangic,
      bitis,
      fiyat: num(b.fiyat, { min: 0, max: 1_000_000, label: 'Tutar' }),
      odemeNotu: text(b.odemeNotu, { max: 300, label: 'Ödeme notu' }),
    };
  }

  private async adminAddSubscription(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const b = await readJson(c.req);
    const pkg = this.sql.exec('SELECT * FROM packages WHERE id = ?', String(b.paketId ?? '')).toArray()[0];
    if (!pkg) fail(404, 'Paket bulunamadı.');
    const s = this.parseSubscription(b);
    const id = randomId(12);
    this.sql.exec(
      'INSERT INTO subscriptions (id, user_id, package_id, package_name, price, status, start_date, end_date, payment_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      u.id,
      String(pkg!.id),
      String(pkg!.name),
      s.fiyat ?? (pkg!.price === null ? null : Number(pkg!.price)),
      s.durum,
      s.baslangic,
      s.bitis,
      s.odemeNotu,
      Date.now(),
      Date.now(),
    );
    this.audit(c.user!.id, 'yonetici', 'abonelik_kaydet', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async adminUpdateSubscription(c: Ctx) {
    const row = this.sql.exec('SELECT user_id FROM subscriptions WHERE id = ?', c.params[0]).toArray()[0];
    if (!row) fail(404, 'Kayıt bulunamadı.');
    const s = this.parseSubscription(await readJson(c.req));
    this.sql.exec(
      'UPDATE subscriptions SET status = ?, start_date = ?, end_date = ?, price = ?, payment_note = ?, updated_at = ?, reminded = 0 WHERE id = ?',
      s.durum,
      s.baslangic,
      s.bitis,
      s.fiyat,
      s.odemeNotu,
      Date.now(),
      c.params[0],
    );
    this.audit(c.user!.id, 'yonetici', 'abonelik_kaydet', String(row!.user_id), c.params[0], c.ip);
    return json({ tamam: true });
  }

  private async adminAddAppointment(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const b = await readJson(c.req);
    const date = isoDate(b.tarih, 'Tarih');
    const time = text(b.saat, { required: true, max: 5, label: 'Saat' });
    if (!/^\d{2}:\d{2}$/.test(time)) fail(400, 'Saati SS:DD biçiminde yazın.');
    const type = oneOf(b.tur, ['yuz-yuze', 'online'], 'Görüşme türü');
    const note = longText(b.not, { max: 500, label: 'Not' });
    const id = randomId(12);
    this.sql.exec(
      'INSERT INTO appointments (id, user_id, date, time, type, status, note_enc, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      u.id,
      date,
      time,
      type,
      'onaylandi',
      note ? await encryptJson(await this.requireKey(), note) : null,
      'yonetici',
      Date.now(),
      Date.now(),
    );
    this.audit(c.user!.id, 'yonetici', 'randevu_kaydet', u.id, id, c.ip);
    return json({ tamam: true, id }, 201);
  }

  private async adminUpdateAppointment(c: Ctx) {
    const row = this.sql.exec('SELECT * FROM appointments WHERE id = ?', c.params[0]).toArray()[0];
    if (!row) fail(404, 'Randevu bulunamadı.');
    const b = await readJson(c.req);
    const durum = oneOf(b.durum, Object.keys(randevuDurumlari) as (keyof typeof randevuDurumlari)[], 'Durum');
    const date = b.tarih ? isoDate(b.tarih, 'Tarih') : String(row!.date);
    const time = b.saat ? text(b.saat, { max: 5, label: 'Saat' }) : String(row!.time);
    if (!/^\d{2}:\d{2}$/.test(time)) fail(400, 'Saati SS:DD biçiminde yazın.');
    const changed = date !== String(row!.date) || time !== String(row!.time);
    this.sql.exec(
      'UPDATE appointments SET status = ?, date = ?, time = ?, updated_at = ?, reminded = ? WHERE id = ?',
      durum,
      date,
      time,
      Date.now(),
      changed ? 0 : Number(row!.reminded),
      c.params[0],
    );
    this.audit(c.user!.id, 'yonetici', 'randevu_kaydet', String(row!.user_id), `${c.params[0]} ${durum}`, c.ip);
    return json({ tamam: true });
  }

  private async adminAppointments(c: Ctx) {
    const key = await this.requireKey();
    const from = isoDate(c.url.searchParams.get('bas') || todayTR(), 'Başlangıç');
    const to = isoDate(c.url.searchParams.get('bit') || addDays(from, 30), 'Bitiş');
    const rows = this.sql
      .exec(
        `SELECT a.*, u.name, u.phone FROM appointments a JOIN users u ON u.id = a.user_id
         WHERE a.date BETWEEN ? AND ? ORDER BY a.date, a.time LIMIT 500`,
        from,
        to,
      )
      .toArray();
    const list = [];
    for (const r of rows)
      list.push({
        id: String(r.id),
        danisanId: String(r.user_id),
        ad: String(r.name),
        telefon: String(r.phone),
        tarih: String(r.date),
        saat: String(r.time),
        tur: String(r.type),
        durum: String(r.status),
        not: await decryptJson<string>(key, r.note_enc ? String(r.note_enc) : null, ''),
      });
    return json({ randevular: list, bas: from, bit: to });
  }

  private async adminPackages(_c: Ctx) {
    return json({ paketler: this.packagesList(false) });
  }

  private async adminSavePackage(c: Ctx) {
    const b = await readJson(c.req);
    const id = c.params[0] ?? randomId(10);
    const ad = text(b.ad, { required: true, max: 100, label: 'Paket adı' });
    const ozet = longText(b.ozet, { max: 600, label: 'Açıklama' });
    const icerik = cleanList(b.icerik, 20, 160);
    const sure = text(b.sure, { max: 60, label: 'Süre' });
    const fiyat = num(b.fiyat, { min: 0, max: 1_000_000, label: 'Fiyat' });
    const now = Date.now();
    if (c.params[0]) {
      const res = this.sql.exec(
        'UPDATE packages SET name = ?, summary = ?, items = ?, duration = ?, price = ?, show_price = ?, active = ?, sort = ?, updated_at = ? WHERE id = ?',
        ad,
        ozet,
        JSON.stringify(icerik),
        sure,
        fiyat,
        bool(b.fiyatGoster) ? 1 : 0,
        bool(b.aktif) ? 1 : 0,
        Math.round(Number(b.sira ?? 0)) || 0,
        now,
        id,
      );
      if (!res.rowsWritten) fail(404, 'Paket bulunamadı.');
    } else {
      this.sql.exec(
        'INSERT INTO packages (id, name, summary, items, duration, price, show_price, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        ad,
        ozet,
        JSON.stringify(icerik),
        sure,
        fiyat,
        bool(b.fiyatGoster ?? true) ? 1 : 0,
        bool(b.aktif ?? true) ? 1 : 0,
        Math.round(Number(b.sira ?? 0)) || 0,
        now,
        now,
      );
    }
    this.audit(c.user!.id, 'yonetici', 'paket_kaydet', null, id, c.ip);
    return json({ tamam: true, id });
  }

  private async adminDeletePackage(c: Ctx) {
    const used = this.sql.exec('SELECT 1 FROM subscriptions WHERE package_id = ? LIMIT 1', c.params[0]).toArray()[0];
    if (used) this.sql.exec('UPDATE packages SET active = 0, updated_at = ? WHERE id = ?', Date.now(), c.params[0]);
    else this.sql.exec('DELETE FROM packages WHERE id = ?', c.params[0]);
    this.audit(c.user!.id, 'yonetici', 'paket_sil', null, c.params[0], c.ip);
    return json({ tamam: true, pasifYapildi: Boolean(used) });
  }

  private async adminAudit(c: Ctx) {
    const page = Math.max(0, Math.min(500, Number(c.url.searchParams.get('sayfa') ?? 0) || 0));
    const target = c.url.searchParams.get('danisan');
    const rows = this.sql
      .exec(
        `SELECT a.*, ua.name AS actor_name, ut.name AS target_name FROM audit a
         LEFT JOIN users ua ON ua.id = a.actor LEFT JOIN users ut ON ut.id = a.target
         ${target ? 'WHERE a.target = ?' : ''} ORDER BY a.id DESC LIMIT 100 OFFSET ?`,
        ...(target ? [target, page * 100] : [page * 100]),
      )
      .toArray()
      .map((r) => ({
        tarih: Number(r.at),
        kim: r.actor_name ? String(r.actor_name) : r.actor ? '(silinmiş hesap)' : '—',
        rol: String(r.role),
        islem: AUDIT_LABELS[String(r.action)] ?? String(r.action),
        hedef: r.target_name ? String(r.target_name) : r.target ? '(silinmiş hesap)' : '',
        hedefId: r.target ? String(r.target) : '',
        ip: String(r.ip),
      }));
    return json({ kayitlar: rows, sayfa: page });
  }

  private async adminDeleteClient(c: Ctx) {
    const u = this.clientOr404(c.params[0]);
    const b = await readJson(c.req);
    if (String(b.onay ?? '').trim().toLocaleUpperCase('tr') !== 'SİL') fail(400, 'Silmeyi onaylamak için SİL yazın.');
    this.ctx.storage.transactionSync(() => {
      for (const d of this.sql.exec('SELECT id FROM documents WHERE user_id = ?', u.id).toArray())
        this.sql.exec('DELETE FROM doc_chunks WHERE doc_id = ?', String(d.id));
      for (const t of ['documents', 'measurements', 'subscriptions', 'appointments', 'notes', 'profiles', 'sessions', 'tickets', 'consents', 'message_reads'])
        this.sql.exec(`DELETE FROM ${t} WHERE user_id = ?`, u.id);
      this.sql.exec('DELETE FROM messages WHERE user_id = ?', u.id);
      this.sql.exec('DELETE FROM users WHERE id = ?', u.id);
      this.audit(c.user!.id, 'yonetici', 'hesap_sil', u.id, '', c.ip);
    });
    return json({ tamam: true });
  }

  // ============================================================== Zamanlanmış işler (günde bir kez)

  async cron(): Promise<string> {
    const now = Date.now();
    // Eski oturum, bilet ve deneme kayıtlarını temizle; 2 yıldan eski işlem kayıtlarını sil
    this.sql.exec('DELETE FROM sessions WHERE expires_at < ?', now);
    this.sql.exec('DELETE FROM tickets WHERE expires_at < ?', now);
    this.sql.exec('DELETE FROM attempts WHERE locked_until < ? AND first_at < ?', now, now - DAY);
    this.sql.exec('DELETE FROM audit WHERE at < ?', now - AUDIT_KEEP_DAYS * DAY);

    const today = todayTR();
    if (!(await this.key())) return 'veri anahtarı yok';
    if (this.meta('hatirlatma_gunu') === today || nowTRMinutes(now) < 9 * 60) return 'bugün için hatırlatmalar hazır';
    const tomorrow = addDays(today, 1);
    let n = 0;
    const appts = this.sql
      .exec("SELECT id, user_id, time, type FROM appointments WHERE status = 'onaylandi' AND date = ? AND reminded = 0", tomorrow)
      .toArray();
    for (const a of appts) {
      await this.insertMessage(
        String(a.user_id),
        'Randevu hatırlatması',
        `Yarın saat ${String(a.time)} için ${String(a.type) === 'online' ? 'online' : 'yüz yüze'} randevunuz bulunuyor. Randevunuza katılamayacaksanız lütfen önceden haber verin.`,
        'hatirlatma',
        'sistem',
      );
      this.sql.exec('UPDATE appointments SET reminded = 1 WHERE id = ?', String(a.id));
      n++;
    }
    const subs = this.sql
      .exec("SELECT id, user_id, package_name, end_date FROM subscriptions WHERE status = 'aktif' AND end_date = ? AND reminded = 0", addDays(today, 3))
      .toArray();
    for (const s of subs) {
      await this.insertMessage(
        String(s.user_id),
        'Paket süresi',
        `${String(s.package_name)} paketinizin süresi 3 gün sonra (${String(s.end_date).split('-').reverse().join('.')}) doluyor.`,
        'hatirlatma',
        'sistem',
      );
      this.sql.exec('UPDATE subscriptions SET reminded = 1 WHERE id = ?', String(s.id));
      n++;
    }
    this.setMeta('hatirlatma_gunu', today);
    return `${n} hatırlatma`;
  }
}
