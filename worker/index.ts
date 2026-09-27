// Cloudflare Worker
// - Sitenin sayfaları "dist" klasöründen doğrudan sunulur; bu dosya yalnızca /api/* adreslerinde çalışır.
// - /api/asistan: site asistanının yapay zekâ bağlantısı.
//
// Yapay zekâ anahtarı Cloudflare panelinde Worker → Settings → Variables and Secrets bölümünde
// "ANTHROPIC_API_KEY" adıyla gizli değişken (Secret) olarak tanımlanır. Anahtar yoksa asistan yalnızca
// hazır cevaplarla çalışır; site bundan etkilenmez.
//
// Gizlilik: Ziyaretçi mesajları yalnızca yanıt üretmek için yapay zekâ servisine iletilir, burada saklanmaz
// ve kayıtlara (log) yazılmaz. Yapay zekâ servisine IP adresi veya kimlik bilgisi gönderilmez.

interface Env {
  ASSETS: { fetch(input: Request | URL | string, init?: RequestInit): Promise<Response> };
  ANTHROPIC_API_KEY?: string;
  /** İsteğe bağlı: farklı bir model kullanmak için */
  ASISTAN_MODEL?: string;
  /** Yalnızca yerel test için */
  ANTHROPIC_BASE_URL?: string;
}

type Action = { label: string; href: string; external?: boolean; primary?: boolean };
type Knowledge = {
  system: string;
  actions: Record<string, Action>;
  services: string[];
  pages: Record<string, string>;
};
type Message = { role: 'user' | 'assistant'; content: string };

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;
const MAX_MESSAGES = 12;
const MAX_USER_CHARS = 600;
const MAX_ASSISTANT_CHARS = 1500;
const MAX_BODY_BYTES = 24_000;
const LIMIT_PER_MINUTE = 8;
const LIMIT_PER_HOUR = 60;

let cachedKnowledge: { data: Knowledge; at: number } | null = null;
const hits = new Map<string, number[]>();

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/asistan' || url.pathname === '/api/asistan/') {
      try {
        return await handleAssistant(request, env, url);
      } catch (err) {
        console.error('asistan: beklenmeyen hata', err instanceof Error ? err.name : 'bilinmiyor');
        return json({ error: 'server' }, 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function handleAssistant(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return json({ ai: Boolean(env.ANTHROPIC_API_KEY) });
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405, { allow: 'GET, POST' });

  // Yalnızca sitenin kendi sayfalarından gelen istekler
  if (hostOf(request.headers.get('origin')) !== url.host) return json({ error: 'origin' }, 403);

  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503);

  if (!allow(request.headers.get('cf-connecting-ip') || 'yerel')) {
    return json({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
  }

  if (Number(request.headers.get('content-length') || '0') > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const messages = cleanMessages((body as { messages?: unknown })?.messages);
  if (!messages) return json({ error: 'bad_request' }, 400);

  const kb = await loadKnowledge(env, url);
  if (!kb) return json({ error: 'knowledge' }, 500);

  const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.ASISTAN_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        system: [{ type: 'text', text: kb.system, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
      signal: ctrl.signal,
    });
  } catch {
    console.error('asistan: yapay zekâ servisine ulaşılamadı');
    return json({ error: 'upstream' }, 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Mesaj içeriği değil, yalnızca durum kodu kaydedilir (ör. 401: anahtar hatalı, 400: kredi bitti olabilir)
    console.error(`asistan: yapay zekâ servisi hata döndürdü (${res.status})`);
    return json({ error: 'upstream' }, res.status === 429 ? 429 : 502);
  }

  const data = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
  const text = (data?.content ?? [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) return json({ error: 'empty' }, 502);

  const { reply, actions } = extractActions(text, kb);
  return json({ reply: reply || 'Aşağıdaki bağlantıdan devam edebilirsiniz.', actions });
}

function hostOf(origin: string | null): string {
  if (!origin) return '';
  try {
    return new URL(origin).host;
  } catch {
    return '';
  }
}

/** Basit hız sınırı (her Cloudflare sunucusunda ayrı tutulur; kötüye kullanımı zorlaştırmak içindir). */
function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const lastMinute = recent.filter((t) => now - t < 60_000).length;
  if (lastMinute >= LIMIT_PER_MINUTE || recent.length >= LIMIT_PER_HOUR) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

/** Gelen konuşmayı doğrular, kısaltır ve yapay zekâ servisinin beklediği biçime getirir. */
function cleanMessages(input: unknown): Message[] | null {
  if (!Array.isArray(input)) return null;
  const out: Message[] = [];
  for (const m of input.slice(-MAX_MESSAGES * 2)) {
    const role = (m as Message)?.role;
    const content = (m as Message)?.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const text = content
      .replace(/\[\[[^\[\]]*\]\]/g, '')
      .trim()
      .slice(0, role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  const trimmed = out.slice(-MAX_MESSAGES);
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();
  if (!trimmed.length || trimmed[trimmed.length - 1].role !== 'user') return null;
  return trimmed;
}

/** Sitenin derlenirken oluşturduğu bilgi dosyasını okur (/asistan-bilgi.json). */
async function loadKnowledge(env: Env, url: URL): Promise<Knowledge | null> {
  if (cachedKnowledge && Date.now() - cachedKnowledge.at < 10 * 60 * 1000) return cachedKnowledge.data;
  try {
    const res = await env.ASSETS.fetch(new URL('/asistan-bilgi.json', url.origin));
    if (!res.ok) return cachedKnowledge?.data ?? null;
    const data = (await res.json()) as Knowledge;
    if (typeof data?.system !== 'string' || !data.actions || !Array.isArray(data.services) || !data.pages) {
      return cachedKnowledge?.data ?? null;
    }
    cachedKnowledge = { data, at: Date.now() };
    return data;
  } catch {
    return cachedKnowledge?.data ?? null;
  }
}

/** Yanıttaki [[...]] etiketlerini ayıklar ve yalnızca izin verilen bağlantılara çevirir. */
function extractActions(text: string, kb: Knowledge): { reply: string; actions: Action[] } {
  const tagRe = /\[\[([^\[\]]{1,160})\]\]/g;
  const tags = [...text.matchAll(tagRe)].map((m) => m[1].trim());
  const reply = text
    .replace(tagRe, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const actions: Action[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const a = resolveTag(tag, kb);
    if (a && !seen.has(a.href)) {
      seen.add(a.href);
      actions.push(a);
    }
    if (actions.length >= 3) break;
  }
  return { reply, actions };
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function resolveTag(tag: string, kb: Knowledge): Action | null {
  const t = tag.trim();
  if (has(kb.actions, t.toLowerCase())) return kb.actions[t.toLowerCase()];
  const i = t.indexOf(':');
  if (i < 0) return null;
  const kind = t.slice(0, i).trim().toLowerCase();
  const value = t.slice(i + 1).trim();
  if (!value) return null;
  if (kind === 'randevu') {
    const name = kb.services.find((s) => s.toLocaleLowerCase('tr') === value.toLocaleLowerCase('tr'));
    if (!name) return has(kb.actions, 'randevu') ? kb.actions.randevu : null;
    return {
      label: `Randevu: ${name}`,
      href: `/randevu-olustur/?hizmet=${encodeURIComponent(name)}#randevu-formu`,
      primary: true,
    };
  }
  if (kind === 'sayfa') {
    const p = value.startsWith('/') ? value : `/${value}`;
    const withSlash = p.endsWith('/') ? p : `${p}/`;
    if (has(kb.pages, p)) return { label: kb.pages[p], href: p };
    if (has(kb.pages, withSlash)) return { label: kb.pages[withSlash], href: withSlash };
  }
  return null;
}
