// Diyetisyen paneli, Takibim ve randevu talepleri — sunucu tarafı (Cloudflare Durable Object, SQLite)
//
// ÖNEMLİ: Bu sunucu danışan bilgilerini OKUYAMAZ.
// - Danışan kayıtları diyetisyenin kendi bilgisayarında, tarayıcıda şifreli olarak durur (sunucuya gelmez).
// - Randevu talebi, ziyaretçinin tarayıcısında diyetisyenin "açık anahtarı" ile şifrelenir; burada yalnızca kapalı
//   zarf olarak bekler. Zarfı yalnızca diyetisyen panelindeki özel anahtar açabilir. Panel talebi aldığında silinir.
// - Takibim: Diyetisyen paneli her danışan için ayrı bir anahtarla şifrelediği özeti buraya bırakır ("posta kutusu").
//   Anahtar QR kodunun içindedir ve yalnızca diyetisyenin bilgisayarında ve danışanın telefonunda bulunur.
//   QR yalnızca bir telefonda kullanılabilir (ilk okutan telefona bağlanır).
// - Burada tutulanlar: erişim anahtarlarının özetleri (SHA-256), şifreli zarflar, bildirim abonelikleri, kötüye
//   kullanımı önlemek için kısa süreli deneme sayaçları (IP adresinin kendisi değil, tuzlanmış özeti).

import { DurableObject } from 'cloudflare:workers';
import { randomBytes, randomId, safeEqual, sha256, vapidAnahtariOlustur, vapidBasligi } from './crypto';
import { HttpError, fail, json, readJson } from './util';
import { sinirlar } from '../../src/data/portal';
import { site } from '../../src/data/site';

export interface PortalEnv {
  /** Diyetisyen panelini sunucuya bağlamak için gizli kod (Cloudflare panelinde Secret) */
  KURULUM_KODU?: string;
}

type Yetki = 'herkes' | 'panel' | 'cihaz';
type Ctx = { req: Request; url: URL; ip: string; params: string[] };
type Isleyici = (c: Ctx) => Promise<Response>;

const GUN = 86_400_000;
const KIMLIK = /^[A-Za-z0-9_-]{16,64}$/;
const BELGE_PARCA = 1_000_000; // SQLite satır sınırı 2 MB; belgeler 1 MB'lık parçalar hâlinde saklanır
const PUSH_HOST = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

const SEMA = `
CREATE TABLE IF NOT EXISTS ayar (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gelen (id TEXT PRIMARY KEY, tarih INTEGER NOT NULL, zarf TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kutu (
  id TEXT PRIMARY KEY,
  eslesme TEXT,
  cihaz TEXT,
  eslesti INTEGER,
  riza TEXT,
  veri TEXT,
  guncellendi INTEGER NOT NULL,
  olusturma INTEGER NOT NULL,
  son_bakis INTEGER,
  kapatildi INTEGER
);
CREATE TABLE IF NOT EXISTS kutu_belge (
  kutu_id TEXT NOT NULL,
  belge_id TEXT NOT NULL,
  sira INTEGER NOT NULL,
  veri BLOB NOT NULL,
  PRIMARY KEY (kutu_id, belge_id, sira)
);
CREATE TABLE IF NOT EXISTS abone (endpoint TEXT PRIMARY KEY, ad TEXT NOT NULL, olusturma INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bildirim_kodu (ozet TEXT PRIMARY KEY, bitis INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS deneme (anahtar TEXT NOT NULL, zaman INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS deneme_idx ON deneme (anahtar, zaman);
`;

// Önceki deneme sürümünün (sunucuda veri tutan panel) tabloları — yalnızca test verisi içeriyordu, kaldırılır.
const ESKI_TABLOLAR = [
  'users', 'profiles', 'consents', 'measurements', 'packages', 'subscriptions', 'appointments', 'documents',
  'doc_chunks', 'messages', 'message_reads', 'notes', 'sessions', 'tickets', 'attempts', 'audit', 'meta',
];

export class PortalStore extends DurableObject<PortalEnv> {
  private sql: SqlStorage;
  private routes: [string, RegExp, Isleyici, Yetki][] = [];

  constructor(ctx: DurableObjectState, env: PortalEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      const eski = this.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").toArray();
      if (eski.length) for (const t of ESKI_TABLOLAR) this.sql.exec(`DROP TABLE IF EXISTS ${t}`);
      this.sql.exec(SEMA);
    });
    this.tanimla();
  }

  // ============================================================== Yönlendirme

  private r(method: string, path: string, handler: Isleyici, yetki: Yetki) {
    const re = new RegExp(`^/api/portal${path.replace(/:[a-z]+/g, '([A-Za-z0-9_-]+)')}$`);
    this.routes.push([method, re, handler, yetki]);
  }

  private tanimla() {
    const r = this.r.bind(this);
    // Genel
    r('GET', '/durum', () => this.durum(), 'herkes');
    r('POST', '/kurulum', (c) => this.kurulum(c), 'herkes');
    // Randevu talepleri
    r('POST', '/randevu', (c) => this.randevuAl(c), 'herkes');
    r('GET', '/gelen', () => this.gelenListe(), 'panel');
    r('DELETE', '/gelen/:id', (c) => this.gelenSil(c), 'panel');
    // Takibim — diyetisyen paneli
    r('GET', '/kutular', () => this.kutular(), 'panel');
    r('PUT', '/kutu/:id', (c) => this.kutuYaz(c), 'panel');
    r('DELETE', '/kutu/:id', (c) => this.kutuSil(c), 'panel');
    r('PUT', '/kutu/:id/belge/:belge', (c) => this.belgeYaz(c), 'panel');
    r('GET', '/kutu/:id/belge/:belge', (c) => this.belgeOku(c.params[0], c.params[1]), 'panel');
    r('DELETE', '/kutu/:id/belge/:belge', (c) => this.belgeSil(c), 'panel');
    // Takibim — danışanın telefonu
    r('POST', '/takip/:id/eslestir', (c) => this.eslestir(c), 'herkes');
    r('GET', '/takip/:id', (c) => this.takipOku(c), 'cihaz');
    r('GET', '/takip/:id/belge/:belge', (c) => this.belgeOku(c.params[0], c.params[1]), 'cihaz');
    r('DELETE', '/takip/:id', (c) => this.takipKapat(c), 'cihaz');
    // Bildirimler
    r('GET', '/bildirim/anahtar', () => this.vapidAcik(), 'herkes');
    r('GET', '/bildirim/son', () => Promise.resolve(json(JSON.parse(this.ayar('son_bildirim') ?? '{}'))), 'herkes');
    r('GET', '/bildirim/aboneler', () => this.aboneler(), 'panel');
    r('POST', '/bildirim/abone', (c) => this.aboneEkle(c, true), 'panel');
    r('POST', '/bildirim/telefon-kodu', () => this.telefonKodu(), 'panel');
    r('POST', '/bildirim/telefon', (c) => this.aboneEkle(c, false), 'herkes');
    r('DELETE', '/bildirim/abone', (c) => this.aboneSil(c), 'herkes');
    r('POST', '/bildirim/dene', () => this.bildir('deneme').then((n) => json({ gonderilen: n })), 'panel');
  }

  async fetch(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const ip = req.headers.get('X-Istemci-IP') ?? '';
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.headers.get('X-Portal-Istek') !== '1') fail(403, 'İzin verilmeyen istek.');
        const origin = req.headers.get('Origin');
        if (origin && origin !== url.origin) fail(403, 'İzin verilmeyen istek.');
      }
      let eslesen = false;
      for (const [method, re, handler, yetki] of this.routes) {
        const m = url.pathname.match(re);
        if (!m) continue;
        eslesen = true;
        if (method !== req.method) continue;
        const params = m.slice(1);
        if (params.some((p) => !KIMLIK.test(p))) fail(404, 'Bulunamadı.');
        if (yetki === 'panel') await this.panelYetkisi(req);
        if (yetki === 'cihaz') await this.cihazYetkisi(req, params[0]);
        return await handler({ req, url, ip, params });
      }
      return json({ hata: eslesen ? 'Bu işlem desteklenmiyor.' : 'Bulunamadı.' }, eslesen ? 405 : 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ hata: e.message, ...e.extra }, e.status);
      console.error('Panel sunucusu hatası:', e);
      return json({ hata: 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.' }, 500);
    }
  }

  // ============================================================== Yardımcılar

  private ayar(anahtar: string): string | null {
    const row = this.sql.exec('SELECT deger FROM ayar WHERE anahtar = ?', anahtar).toArray()[0];
    return row ? String(row.deger) : null;
  }

  private ayarYaz(anahtar: string, deger: string) {
    this.sql.exec(
      'INSERT INTO ayar (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger',
      anahtar,
      deger,
    );
  }

  /** IP adresi saklanmaz; yalnızca rastgele tuzla özetlenmiş hâli kısa süreli sayaçta kullanılır */
  private async ipOzeti(ip: string): Promise<string> {
    let tuz = this.ayar('ip_tuzu');
    if (!tuz) {
      tuz = randomId(16);
      this.ayarYaz('ip_tuzu', tuz);
    }
    return (await sha256(`${tuz}:${ip}`)).slice(0, 22);
  }

  /** Belirli sürede en fazla "sinir" denemeye izin verir */
  private sinirla(anahtar: string, sinir: number, sureMs: number, mesaj: string) {
    const simdi = Date.now();
    const n = Number(
      this.sql.exec('SELECT COUNT(*) AS n FROM deneme WHERE anahtar = ? AND zaman > ?', anahtar, simdi - sureMs).one().n,
    );
    if (n >= sinir) fail(429, mesaj);
    this.sql.exec('INSERT INTO deneme (anahtar, zaman) VALUES (?, ?)', anahtar, simdi);
  }

  private async panelYetkisi(req: Request) {
    const ozet = this.ayar('panel_ozeti');
    const m = (req.headers.get('Authorization') ?? '').match(/^Bearer ([A-Za-z0-9_-]{32,100})$/);
    if (!ozet || !m || !safeEqual(await sha256(m[1]), ozet))
      fail(401, 'Panel sunucuya bağlı değil veya bağlantı anahtarı geçersiz. Ayarlar bölümünden yeniden bağlayın.');
  }

  private async cihazYetkisi(req: Request, kutuId: string) {
    const cihaz = req.headers.get('X-Cihaz') ?? '';
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(cihaz)) fail(403, 'Bu telefon tanınmadı.');
    const k = this.sql.exec('SELECT cihaz, kapatildi FROM kutu WHERE id = ?', kutuId).toArray()[0];
    if (!k) fail(404, 'Takip kaydı bulunamadı. Diyetisyeninizden yeni bir QR kodu isteyin.');
    if (k!.kapatildi) fail(410, 'Bu takip kapatılmış.');
    if (!k!.cihaz || !safeEqual(await sha256(cihaz), String(k!.cihaz))) fail(403, 'Bu takip başka bir telefona tanımlı.');
  }

  // ============================================================== Genel

  private durum() {
    const anahtar = this.ayar('randevu_anahtari');
    return Promise.resolve(
      json({
        randevuKutusu: Boolean(this.ayar('panel_ozeti') && anahtar),
        anahtar: anahtar ? JSON.parse(anahtar) : null,
        kurulumKodu: Boolean(this.env.KURULUM_KODU && this.env.KURULUM_KODU.length >= 12),
        kurulum: Number(this.ayar('kurulum') ?? 0) || null,
      }),
    );
  }

  /** Diyetisyen panelini sunucuya bağlar (ilk kurulum veya yeni bilgisayar). Kurulum kodu gerekir. */
  private async kurulum(c: Ctx) {
    const kod = this.env.KURULUM_KODU;
    if (!kod || kod.length < 12)
      fail(503, 'Kurulum kodu Cloudflare\'de tanımlı değil. Panelde gösterilen adımlarla "KURULUM_KODU" ekleyin.', {
        kod: 'kurulum-kodu-yok',
      });
    this.sinirla(`kurulum:${await this.ipOzeti(c.ip)}`, 5, 15 * 60_000, 'Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.');
    const b = await readJson(c.req);
    if (typeof b.kod !== 'string' || !safeEqual(b.kod.trim(), kod!)) fail(403, 'Kurulum kodu hatalı.', { alan: 'Kurulum kodu' });
    if (typeof b.jeton !== 'string' || !/^[A-Za-z0-9_-]{32,100}$/.test(b.jeton)) fail(400, 'Geçersiz istek.');
    const a = b.anahtar as JsonWebKey | undefined;
    if (!a || a.kty !== 'EC' || a.crv !== 'P-256' || typeof a.x !== 'string' || typeof a.y !== 'string' || 'd' in a)
      fail(400, 'Geçersiz anahtar.');
    // Anahtarın gerçekten geçerli bir P-256 açık anahtarı olduğunu doğrula
    try {
      await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: a!.x, y: a!.y }, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    } catch {
      fail(400, 'Geçersiz anahtar.');
    }
    const ozet = await sha256(b.jeton as string);
    this.ctx.storage.transactionSync(() => {
      this.ayarYaz('panel_ozeti', ozet);
      this.ayarYaz('randevu_anahtari', JSON.stringify({ kty: 'EC', crv: 'P-256', x: a!.x, y: a!.y }));
      this.ayarYaz('kurulum', String(Date.now()));
    });
    await this.vapid();
    return json({ ok: true });
  }

  // ============================================================== Randevu talepleri

  private async randevuAl(c: Ctx) {
    if (!this.ayar('panel_ozeti') || !this.ayar('randevu_anahtari')) fail(503, 'Randevu kutusu kurulmamış.', { kod: 'kurulu-degil' });
    const b = await readJson(c.req, 16 * 1024);
    const z = b.zarf as Record<string, unknown> | undefined;
    const epk = z?.epk as JsonWebKey | undefined;
    if (
      !z ||
      !epk ||
      epk.kty !== 'EC' ||
      epk.crv !== 'P-256' ||
      typeof epk.x !== 'string' ||
      typeof epk.y !== 'string' ||
      typeof z.iv !== 'string' ||
      typeof z.veri !== 'string' ||
      z.iv.length > 40 ||
      z.veri.length > 12_000
    )
      fail(400, 'Geçersiz istek.');
    const ip = await this.ipOzeti(c.ip);
    this.sinirla(`randevu-saat:${ip}`, 4, 3600_000, 'Kısa sürede çok fazla talep gönderildi. Lütfen WhatsApp\'tan yazın.');
    this.sinirla(`randevu-gun:${ip}`, 10, GUN, 'Bugün çok fazla talep gönderildi. Lütfen WhatsApp\'tan yazın.');
    this.sinirla('randevu-genel', 300, GUN, 'Şu anda talep alınamıyor. Lütfen WhatsApp\'tan yazın.');
    const n = Number(this.sql.exec('SELECT COUNT(*) AS n FROM gelen').one().n);
    if (n >= 500) fail(503, 'Şu anda talep alınamıyor. Lütfen WhatsApp\'tan yazın.');
    const zarf = JSON.stringify({ epk: { kty: 'EC', crv: 'P-256', x: epk!.x, y: epk!.y }, iv: z!.iv, veri: z!.veri });
    this.sql.exec('INSERT INTO gelen (id, tarih, zarf) VALUES (?, ?, ?)', randomId(12), Date.now(), zarf);
    this.ctx.waitUntil(this.bildir('randevu').catch((e) => console.error('Bildirim hatası:', e)));
    return json({ ok: true });
  }

  private gelenListe() {
    const rows = this.sql.exec('SELECT id, tarih, zarf FROM gelen ORDER BY tarih').toArray();
    return Promise.resolve(json({ talepler: rows.map((r) => ({ id: r.id, tarih: r.tarih, zarf: JSON.parse(String(r.zarf)) })) }));
  }

  private gelenSil(c: Ctx) {
    this.sql.exec('DELETE FROM gelen WHERE id = ?', c.params[0]);
    return Promise.resolve(json({ ok: true }));
  }

  // ============================================================== Takibim: panel tarafı

  private kutular() {
    const rows = this.sql
      .exec('SELECT id, eslesme, eslesti, riza, guncellendi, olusturma, son_bakis, kapatildi FROM kutu')
      .toArray();
    return Promise.resolve(
      json({
        kutular: rows.map((r) => ({
          id: r.id,
          bekliyor: Boolean(r.eslesme),
          eslesti: r.eslesti,
          riza: r.riza,
          guncellendi: r.guncellendi,
          olusturma: r.olusturma,
          sonBakis: r.son_bakis,
          kapatildi: r.kapatildi,
        })),
      }),
    );
  }

  /** Danışanın şifreli özetini yazar. İlk yazımda QR'daki tek kullanımlık eşleşme jetonu da gelir. */
  private async kutuYaz(c: Ctx) {
    const id = c.params[0];
    const b = await readJson(c.req, sinirlar.takipVerisiBayt * 1.4 + 4096);
    if (typeof b.veri !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b.veri)) fail(400, 'Geçersiz veri.');
    const simdi = Date.now();
    const k = this.sql.exec('SELECT kapatildi FROM kutu WHERE id = ?', id).toArray()[0];
    if (k?.kapatildi) fail(410, 'Danışan takibi kapattı.', { kod: 'kapatildi' });
    if (k) {
      this.sql.exec('UPDATE kutu SET veri = ?, guncellendi = ? WHERE id = ?', b.veri, simdi, id);
    } else {
      if (typeof b.jeton !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(b.jeton))
        fail(404, 'Takip kaydı bulunamadı (QR süresi dolmuş olabilir).', { kod: 'yok' });
      const n = Number(this.sql.exec('SELECT COUNT(*) AS n FROM kutu').one().n);
      if (n >= 3000) fail(507, 'Takip kaydı sınırına ulaşıldı.');
      this.sql.exec(
        'INSERT INTO kutu (id, eslesme, veri, guncellendi, olusturma) VALUES (?, ?, ?, ?, ?)',
        id,
        await sha256(b.jeton as string),
        b.veri,
        simdi,
        simdi,
      );
    }
    return json({ ok: true, guncellendi: simdi });
  }

  private kutuSil(c: Ctx) {
    const id = c.params[0];
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM kutu_belge WHERE kutu_id = ?', id);
      this.sql.exec('DELETE FROM kutu WHERE id = ?', id);
    });
    return Promise.resolve(json({ ok: true }));
  }

  private async belgeYaz(c: Ctx) {
    const [id, belge] = c.params;
    const k = this.sql.exec('SELECT kapatildi FROM kutu WHERE id = ?', id).toArray()[0];
    if (!k) fail(404, 'Takip kaydı bulunamadı.', { kod: 'yok' });
    if (k!.kapatildi) fail(410, 'Danışan takibi kapattı.', { kod: 'kapatildi' });
    const veri = new Uint8Array(await c.req.arrayBuffer());
    if (!veri.length) fail(400, 'Dosya boş.');
    if (veri.length > sinirlar.belgeBayt + 64) fail(413, 'Dosya en fazla 10 MB olabilir.');
    const toplam = Number(
      this.sql
        .exec('SELECT COALESCE(SUM(LENGTH(veri)), 0) AS n FROM kutu_belge WHERE kutu_id = ? AND belge_id != ?', id, belge)
        .one().n,
    );
    if (toplam + veri.length > 80 * 1024 * 1024) fail(507, 'Bu danışanın belge alanı doldu. Eski belgeleri silin.');
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM kutu_belge WHERE kutu_id = ? AND belge_id = ?', id, belge);
      for (let i = 0, sira = 0; i < veri.length; i += BELGE_PARCA, sira++)
        this.sql.exec(
          'INSERT INTO kutu_belge (kutu_id, belge_id, sira, veri) VALUES (?, ?, ?, ?)',
          id,
          belge,
          sira,
          veri.subarray(i, i + BELGE_PARCA),
        );
    });
    return json({ ok: true });
  }

  private belgeOku(id: string, belge: string) {
    const parcalar = this.sql
      .exec('SELECT veri FROM kutu_belge WHERE kutu_id = ? AND belge_id = ? ORDER BY sira', id, belge)
      .toArray();
    if (!parcalar.length) fail(404, 'Belge bulunamadı.');
    const boyut = parcalar.reduce((t, p) => t + (p.veri as ArrayBuffer).byteLength, 0);
    const out = new Uint8Array(boyut);
    let o = 0;
    for (const p of parcalar) {
      out.set(new Uint8Array(p.veri as ArrayBuffer), o);
      o += (p.veri as ArrayBuffer).byteLength;
    }
    return Promise.resolve(
      new Response(out, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }),
    );
  }

  private belgeSil(c: Ctx) {
    this.sql.exec('DELETE FROM kutu_belge WHERE kutu_id = ? AND belge_id = ?', c.params[0], c.params[1]);
    return Promise.resolve(json({ ok: true }));
  }

  // ============================================================== Takibim: danışanın telefonu

  /** QR'ı ilk okutan telefonu kutuya bağlar. Aynı QR başka telefonda kullanılamaz. */
  private async eslestir(c: Ctx) {
    this.sinirla(`eslestir:${await this.ipOzeti(c.ip)}`, 20, 3600_000, 'Çok fazla deneme yapıldı. Bir saat sonra tekrar deneyin.');
    const id = c.params[0];
    const b = await readJson(c.req);
    if (typeof b.cihaz !== 'string' || !/^[A-Za-z0-9_-]{32,100}$/.test(b.cihaz)) fail(400, 'Geçersiz istek.');
    if (typeof b.riza !== 'string' || b.riza.length > 20) fail(400, 'Açık rıza onayı gerekli.');
    const k = this.sql.exec('SELECT eslesme, cihaz, kapatildi FROM kutu WHERE id = ?', id).toArray()[0];
    if (!k) fail(404, 'Bu QR kodunun süresi dolmuş veya kod yenilenmiş. Diyetisyeninizden yeni bir QR kodu isteyin.');
    if (k!.kapatildi) fail(410, 'Bu takip kapatılmış. Diyetisyeninizden yeni bir QR kodu isteyin.');
    const cihazOzeti = await sha256(b.cihaz as string);
    if (k!.cihaz) {
      if (safeEqual(cihazOzeti, String(k!.cihaz))) {
        this.sql.exec('UPDATE kutu SET riza = ? WHERE id = ?', b.riza, id);
        return json({ ok: true });
      }
      fail(409, 'Bu QR kodu başka bir telefonda kullanılmış. Diyetisyeninizden yeni bir QR kodu isteyin.');
    }
    if (typeof b.jeton !== 'string' || !k!.eslesme || !safeEqual(await sha256(b.jeton), String(k!.eslesme)))
      fail(403, 'QR kodu geçersiz. Diyetisyeninizden yeni bir QR kodu isteyin.');
    const simdi = Date.now();
    this.sql.exec(
      'UPDATE kutu SET eslesme = NULL, cihaz = ?, eslesti = ?, riza = ?, son_bakis = ? WHERE id = ?',
      cihazOzeti,
      simdi,
      b.riza,
      simdi,
      id,
    );
    return json({ ok: true });
  }

  private takipOku(c: Ctx) {
    const id = c.params[0];
    const k = this.sql.exec('SELECT veri, guncellendi, son_bakis FROM kutu WHERE id = ?', id).one();
    const simdi = Date.now();
    if (!k.son_bakis || simdi - Number(k.son_bakis) > 3600_000) this.sql.exec('UPDATE kutu SET son_bakis = ? WHERE id = ?', simdi, id);
    return Promise.resolve(json({ veri: k.veri, guncellendi: k.guncellendi }));
  }

  /** Danışan takibi kapatır (açık rızayı geri çeker): veriler ve belgeler silinir, panel bunu görür. */
  private takipKapat(c: Ctx) {
    const id = c.params[0];
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM kutu_belge WHERE kutu_id = ?', id);
      this.sql.exec('UPDATE kutu SET veri = NULL, cihaz = NULL, eslesme = NULL, kapatildi = ? WHERE id = ?', Date.now(), id);
    });
    return Promise.resolve(json({ ok: true }));
  }

  // ============================================================== Bildirimler (Web Push)

  private async vapid(): Promise<{ acik: string; ozel: JsonWebKey }> {
    const acik = this.ayar('vapid_acik');
    const ozel = this.ayar('vapid_ozel');
    if (acik && ozel) return { acik, ozel: JSON.parse(ozel) };
    const yeni = await vapidAnahtariOlustur();
    this.ayarYaz('vapid_acik', yeni.acik);
    this.ayarYaz('vapid_ozel', JSON.stringify(yeni.ozel));
    return yeni;
  }

  private async vapidAcik() {
    if (!this.ayar('panel_ozeti')) fail(503, 'Panel henüz kurulmadı.');
    return json({ anahtar: (await this.vapid()).acik });
  }

  private aboneler() {
    const rows = this.sql.exec('SELECT endpoint, ad, olusturma FROM abone ORDER BY olusturma').toArray();
    return Promise.resolve(
      json({ aboneler: rows.map((r) => ({ ad: r.ad, olusturma: r.olusturma, endpoint: String(r.endpoint) })) }),
    );
  }

  /** Telefonu panele eklemek için 10 dakika geçerli 6 haneli kod */
  private async telefonKodu() {
    const kod = String(100000 + (new Uint32Array(randomBytes(4).buffer)[0] % 900000));
    this.sql.exec('DELETE FROM bildirim_kodu WHERE bitis < ?', Date.now());
    this.sql.exec('INSERT OR REPLACE INTO bildirim_kodu (ozet, bitis) VALUES (?, ?)', await sha256(kod), Date.now() + 10 * 60_000);
    return json({ kod, gecerlilikDakika: 10 });
  }

  private async aboneEkle(c: Ctx, panelden: boolean) {
    const b = await readJson(c.req);
    if (!panelden) {
      this.sinirla(`telefon:${await this.ipOzeti(c.ip)}`, 10, 3600_000, 'Çok fazla deneme yapıldı. Bir saat sonra tekrar deneyin.');
      const kod = typeof b.kod === 'string' ? b.kod.replace(/\D/g, '') : '';
      const ozet = await sha256(kod);
      const row = this.sql.exec('SELECT bitis FROM bildirim_kodu WHERE ozet = ?', ozet).toArray()[0];
      if (!row || Number(row.bitis) < Date.now()) fail(403, 'Kod hatalı veya süresi dolmuş. Panelden yeni kod alın.', { alan: 'Kod' });
      this.sql.exec('DELETE FROM bildirim_kodu WHERE ozet = ?', ozet);
    }
    const endpoint = typeof b.endpoint === 'string' ? b.endpoint : '';
    let host = '';
    try {
      const u = new URL(endpoint);
      if (u.protocol === 'https:') host = u.hostname;
    } catch {
      /* geçersiz */
    }
    if (!host || !PUSH_HOST.test(host) || endpoint.length > 1000) fail(400, 'Bu tarayıcı bildirim için desteklenmiyor.');
    const ad = typeof b.ad === 'string' ? b.ad.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Cihaz' : 'Cihaz';
    const n = Number(this.sql.exec('SELECT COUNT(*) AS n FROM abone').one().n);
    if (n >= 10) fail(400, 'En fazla 10 cihaz eklenebilir. Eski cihazları kaldırın.');
    this.sql.exec(
      'INSERT INTO abone (endpoint, ad, olusturma) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET ad = excluded.ad',
      endpoint,
      ad,
      Date.now(),
    );
    return json({ ok: true });
  }

  private async aboneSil(c: Ctx) {
    const b = await readJson(c.req);
    if (typeof b.endpoint === 'string') this.sql.exec('DELETE FROM abone WHERE endpoint = ?', b.endpoint);
    return json({ ok: true });
  }

  /** Tüm kayıtlı cihazlara içeriksiz bildirim gönderir. Gönderilen sayı döner. */
  private async bildir(tur: 'randevu' | 'deneme'): Promise<number> {
    this.ayarYaz('son_bildirim', JSON.stringify({ tur, zaman: Date.now() }));
    const aboneler = this.sql.exec('SELECT endpoint FROM abone').toArray();
    if (!aboneler.length) return 0;
    const { acik, ozel } = await this.vapid();
    let gonderilen = 0;
    await Promise.all(
      aboneler.map(async (a) => {
        const endpoint = String(a.endpoint);
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              TTL: '86400',
              Urgency: 'high',
              Authorization: await vapidBasligi(endpoint, ozel, acik, `mailto:${site.email}`),
              'Content-Length': '0',
            },
          });
          if (res.status === 404 || res.status === 410) this.sql.exec('DELETE FROM abone WHERE endpoint = ?', endpoint);
          else if (res.ok) gonderilen++;
          else console.error('Bildirim gönderilemedi:', res.status, new URL(endpoint).hostname);
        } catch (e) {
          console.error('Bildirim gönderilemedi:', e);
        }
      }),
    );
    return gonderilen;
  }

  // ============================================================== Zamanlanmış temizlik

  async cron(): Promise<Record<string, number>> {
    const simdi = Date.now();
    const sonuc: Record<string, number> = {};
    sonuc.talep = this.sql.exec('DELETE FROM gelen WHERE tarih < ?', simdi - sinirlar.talepSaklamaGun * GUN).rowsWritten;
    // Okutulmayan QR'lar, uzun süredir bakılmayan ve kapatılmış takipler
    const silinecek = this.sql
      .exec(
        `SELECT id FROM kutu WHERE (eslesme IS NOT NULL AND olusturma < ?)
           OR (kapatildi IS NOT NULL AND kapatildi < ?)
           OR (COALESCE(son_bakis, olusturma) < ? AND guncellendi < ?)`,
        simdi - sinirlar.qrGecerlilikGun * GUN,
        simdi - 90 * GUN,
        simdi - 400 * GUN,
        simdi - 400 * GUN,
      )
      .toArray()
      .map((r) => String(r.id));
    for (const id of silinecek) {
      this.sql.exec('DELETE FROM kutu_belge WHERE kutu_id = ?', id);
      this.sql.exec('DELETE FROM kutu WHERE id = ?', id);
    }
    sonuc.takip = silinecek.length;
    sonuc.deneme = this.sql.exec('DELETE FROM deneme WHERE zaman < ?', simdi - 2 * GUN).rowsWritten;
    this.sql.exec('DELETE FROM bildirim_kodu WHERE bitis < ?', simdi);
    return sonuc;
  }
}
