// Cloudflare Worker — Instagram Reels bölümü
//
// Sitenin sayfaları "dist" klasöründen doğrudan sunulur; bu dosya yalnızca /api/* adreslerinde çalışır:
//   /api/reels               → son Reels videolarının listesi (JSON)
//   /api/reels/gorsel/<id>   → videonun önizleme görseli (sitemizden sunulur)
//
// Nasıl çalışır?
// - Her 3 saatte bir (wrangler.jsonc → triggers) Instagram hesabındaki son videolar Instagram API'den alınır,
//   önizleme görselleri indirilip saklanır. Ziyaretçiler görselleri sitemizden görür; ziyaretçi bilgisi Instagram'a
//   gönderilmez. Videoya tıklayan ziyaretçi Instagram'da izler.
// - Instagram erişim anahtarı Cloudflare panelinde Worker → Settings → Variables and Secrets bölümünde
//   "INSTAGRAM_TOKEN" adıyla gizli değişken (Secret) olarak tanımlanır. Anahtar kodda veya GitHub'da durmaz.
// - Anahtar 60 gün geçerlidir; bu dosya anahtarı haftada bir kendiliğinden yeniler. Anahtar yoksa ya da çalışmazsa
//   sitede "Instagram'da izleyin" bağlantısı görünür; site bundan etkilenmez.
// - Panelde anahtar değiştirilirse (yeni anahtar girilirse) yenisi otomatik olarak kullanılmaya başlanır.

import { DurableObject } from 'cloudflare:workers';

interface Env {
  ASSETS: { fetch(input: Request | URL | string, init?: RequestInit): Promise<Response> };
  REELS: DurableObjectNamespace<ReelsStore>;
  /** Instagram erişim anahtarı (Cloudflare panelinde Secret) */
  INSTAGRAM_TOKEN?: string;
  /** Yalnızca yerel test için: Instagram API adresi */
  IG_API_BASE?: string;
}

type Reel = { id: string; url: string; caption: string; date: string; img: string };
type ReelList = { updatedAt: string; items: Reel[] };
type IgMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
};
type TokenRecord = { value: string; from: string; at: number };
type StoredImage = { type: string; data: ArrayBuffer };

const KEEP = 12; // sitede gösterilebilecek en fazla video
const REFRESH_EVERY = 7 * 24 * 60 * 60 * 1000; // anahtar haftada bir yenilenir (60 gün geçerli)
const FIRST_TRY_GAP = 10 * 60 * 1000; // ilk kurulumda en fazla 10 dakikada bir deneme
const MAX_IMAGE_BYTES = 1_500_000;
const FIELDS = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp';

const apiBase = (env: Env) => (env.IG_API_BASE || 'https://graph.instagram.com').replace(/\/$/, '');

async function fingerprint(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Açıklamanın ilk dolu satırını, etiketler (#) olmadan kısaltır. */
function shortCaption(caption = '') {
  const first = caption.split('\n').find((line) => line.trim()) ?? '';
  const clean = first.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 90) return clean;
  return clean.slice(0, 88).replace(/\s+\S*$/, '') + '…';
}

const isVideo = (m: IgMedia) =>
  Boolean(m.permalink) && (m.media_product_type === 'REELS' || (m.media_type === 'VIDEO' && m.media_product_type !== 'STORY'));

/** Reels verisini ve anahtarı saklayan kalıcı depo (Cloudflare Durable Object). */
export class ReelsStore extends DurableObject<Env> {
  async list(): Promise<ReelList | null> {
    return (await this.ctx.storage.get<ReelList>('list')) ?? null;
  }

  async image(id: string): Promise<StoredImage | null> {
    return (await this.ctx.storage.get<StoredImage>(`img:${id}`)) ?? null;
  }

  /** Henüz hiç veri yoksa (ilk kurulum) eşitlemeyi dener; sık denemeyi önler. */
  async ensure(): Promise<string> {
    if (await this.list()) return 'var';
    const last = (await this.ctx.storage.get<number>('lastAttempt')) ?? 0;
    if (Date.now() - last < FIRST_TRY_GAP) return 'bekle';
    return this.sync();
  }

  /** Geçerli anahtarı verir; gerekirse Instagram'dan yeniler. */
  private async token(): Promise<string | null> {
    const secret = this.env.INSTAGRAM_TOKEN?.trim();
    if (!secret) return null;
    const from = await fingerprint(secret);
    let rec = await this.ctx.storage.get<TokenRecord>('token');
    if (!rec || rec.from !== from) {
      rec = { value: secret, from, at: Date.now() };
      await this.ctx.storage.put('token', rec);
    }
    if (Date.now() - rec.at > REFRESH_EVERY) {
      try {
        const url = `${apiBase(this.env)}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(rec.value)}`;
        const res = await fetch(url);
        const body = (await res.json().catch(() => ({}))) as { access_token?: string };
        if (res.ok && body.access_token) {
          rec = { value: body.access_token, from, at: Date.now() };
          await this.ctx.storage.put('token', rec);
          console.log('Instagram anahtarı yenilendi');
        } else {
          console.log('Instagram anahtarı yenilenemedi', res.status);
        }
      } catch (err) {
        console.log('Instagram anahtarı yenilenemedi', String(err));
      }
    }
    return rec.value;
  }

  /** Instagram'dan son videoları alır, görselleri saklar ve listeyi günceller. */
  async sync(): Promise<string> {
    await this.ctx.storage.put('lastAttempt', Date.now());
    const token = await this.token();
    if (!token) return 'anahtar yok';

    let media: IgMedia[] = [];
    try {
      const res = await fetch(`${apiBase(this.env)}/me/media?fields=${FIELDS}&limit=30&access_token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        console.log('Instagram listesi alınamadı', res.status, (await res.text()).slice(0, 300));
        return 'hata';
      }
      media = ((await res.json()) as { data?: IgMedia[] }).data ?? [];
    } catch (err) {
      console.log('Instagram listesi alınamadı', String(err));
      return 'hata';
    }

    const videos = media.filter(isVideo).slice(0, KEEP);
    const stored = new Set((await this.ctx.storage.get<string[]>('imgIds')) ?? []);
    const items: Reel[] = [];
    for (const m of videos) {
      // Önizleme görseli henüz saklanmadıysa indir (geçici bir hatada bir kez daha dene)
      for (let attempt = 0; attempt < 2 && !stored.has(m.id) && m.thumbnail_url; attempt++) {
        try {
          const res = await fetch(m.thumbnail_url);
          const type = res.headers.get('content-type') ?? '';
          if (res.ok && type.startsWith('image/')) {
            const data = await res.arrayBuffer();
            if (data.byteLength > MAX_IMAGE_BYTES) break;
            await this.ctx.storage.put(`img:${m.id}`, { type, data } satisfies StoredImage);
            stored.add(m.id);
          } else if (res.status < 500) {
            break;
          }
        } catch (err) {
          console.log('Önizleme görseli alınamadı', m.id, String(err));
        }
      }
      items.push({
        id: m.id,
        url: m.permalink!,
        caption: shortCaption(m.caption),
        date: m.timestamp ?? '',
        img: stored.has(m.id) ? `/api/reels/gorsel/${m.id}` : '',
      });
    }

    // Listeden çıkan videoların görsellerini sil
    const keep = new Set(items.map((i) => i.id));
    for (const id of [...stored]) {
      if (!keep.has(id)) {
        await this.ctx.storage.delete(`img:${id}`);
        stored.delete(id);
      }
    }
    await this.ctx.storage.put('imgIds', [...stored]);
    await this.ctx.storage.put('list', { updatedAt: new Date().toISOString(), items } satisfies ReelList);
    return `tamam (${items.length} video)`;
  }
}

const store = (env: Env) => env.REELS.get(env.REELS.idFromName('instagram'));

async function reelsList(request: Request, env: Env, ctx: ExecutionContext) {
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/reels', request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const s = store(env);
  const list = await s.list();
  if (!list && env.INSTAGRAM_TOKEN) ctx.waitUntil(s.ensure().then((r) => console.log('Reels ilk eşitleme:', r)));
  const res = Response.json(list ?? { updatedAt: null, items: [] }, {
    headers: {
      'Cache-Control': `public, max-age=${list ? 600 : 60}`,
      'X-Robots-Tag': 'noindex',
    },
  });
  if (list) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function reelImage(id: string, request: Request, env: Env, ctx: ExecutionContext) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const img = await store(env).image(id);
  if (!img) return new Response('Bulunamadı', { status: 404 });
  const res = new Response(img.data, {
    headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=86400', 'X-Robots-Tag': 'noindex' },
  });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (url.pathname === '/api/reels') return reelsList(request, env, ctx);
      const img = url.pathname.match(/^\/api\/reels\/gorsel\/(\d{1,30})$/);
      if (img) return reelImage(img[1], request, env, ctx);
    }
    // Diğer tüm adresler: statik site (bulunamayan sayfalar için 404 sayfası)
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(store(env).sync().then((r) => console.log('Reels eşitleme:', r)));
  },
} satisfies ExportedHandler<Env>;
