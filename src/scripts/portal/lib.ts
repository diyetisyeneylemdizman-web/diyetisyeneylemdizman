// Danışan ve diyetisyen panelleri için ortak tarayıcı yardımcıları.
// Tüm dinamik metinler textContent ile eklenir (innerHTML kullanılmaz) — kullanıcı verisi sayfada kod olarak çalışamaz.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public alan?: string,
  ) {
    super(message);
  }
}

const BASE = '/api/portal';

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: { 'X-Portal-Istek': '1' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError(0, 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
  }
  const data = res.headers.get('Content-Type')?.includes('json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) throw new ApiError(res.status, (data as any).hata ?? 'İşlem tamamlanamadı.', (data as any).alan);
  return data as T;
}

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any> | null;

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** Güvenli element oluşturucu: h('p', { class: 'x' }, 'metin') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag: string, props?: Props, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el: Element, props?: Props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign((el as HTMLElement).dataset, v);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else if (k === 'checked' && 'checked' in el) (el as HTMLInputElement).checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

// ---------------------------------------------------------------- Biçimlendirme

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AYLAR_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function tarih(v: string | number | null | undefined, gun = false): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = typeof v === 'number' ? new Date(v + 3 * 3600_000) : new Date(`${v}T00:00:00Z`);
  const s = `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return gun ? `${s} ${GUNLER[d.getUTCDay()]}` : s;
}

export function tarihKisa(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${AYLAR_KISA[d.getUTCMonth()]}`;
}

export function tarihSaat(ms: number): string {
  const d = new Date(ms + 3 * 3600_000);
  return `${tarih(ms)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function sayi(n: number | null | undefined, basamak = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: basamak });
}

export function para(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} TL`;
}

export function bugun(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function gunFarki(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function sure(gun: number): string {
  if (gun < 14) return `${gun} günde`;
  if (gun < 60) return `${Math.round(gun / 7)} haftada`;
  return `${Math.round(gun / 30)} ayda`;
}

export function boyut(bayt: number): string {
  if (bayt < 1024 * 1024) return `${Math.max(1, Math.round(bayt / 1024))} KB`;
  return `${sayi(bayt / 1024 / 1024, 1)} MB`;
}

export function telefonGoster(p: string): string {
  return p ? `0${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6, 8)} ${p.slice(8, 10)}` : '';
}

export function whatsapp(telefon: string, metin: string): string {
  return `https://wa.me/90${telefon}?text=${encodeURIComponent(metin)}`;
}

export const turAdi = (t: string) => (t === 'online' ? 'Online' : 'Yüz yüze');

// ---------------------------------------------------------------- Formlar

/** Form alanlarını nesneye çevirir. "saglik.alerjiler" → { saglik: { alerjiler } }, "x[]" → dizi */
export function formNesnesi(form: HTMLFormElement): Record<string, any> {
  const out: Record<string, any> = {};
  const set = (path: string, value: any, list: boolean) => {
    const keys = path.split('.');
    let o = out;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    const last = keys[keys.length - 1];
    if (list) (o[last] ??= []).push(value);
    else o[last] = value;
  };
  for (const el of form.elements as unknown as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]) {
    if (!el.name || el.disabled) continue;
    const list = el.name.endsWith('[]');
    const name = list ? el.name.slice(0, -2) : el.name;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      if (el.type === 'checkbox' && !list) set(name, el.checked, false);
      else if (el.checked) set(name, el.value, list);
      else if (list) {
        const keys = name.split('.');
        let o = out;
        for (const k of keys.slice(0, -1)) o = o[k] ??= {};
        o[keys[keys.length - 1]] ??= [];
      }
      continue;
    }
    set(name, el.value, list);
  }
  return out;
}

/** Sunucudan gelen hatayı formun üstünde gösterir, ilgili alanı işaretler */
export function formHatasi(form: HTMLElement, err: unknown) {
  const box = form.querySelector<HTMLElement>('[data-form-hata]');
  const e = err instanceof ApiError ? err : new ApiError(0, 'Beklenmeyen bir hata oluştu.');
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
  if (e.alan) {
    const input = form.querySelector<HTMLElement>(`[data-alan="${CSS.escape(e.alan)}"]`);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus({ preventScroll: false });
    }
  }
  if (box) {
    box.textContent = e.message;
    box.hidden = false;
    if (!e.alan) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else toast(e.message, 'hata');
}

export function formTemizle(form: HTMLElement) {
  const box = form.querySelector<HTMLElement>('[data-form-hata]');
  if (box) {
    box.textContent = '';
    box.hidden = true;
  }
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
}

/** Gönderim sırasında butonu kilitler */
export async function mesgul<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>): Promise<T | undefined> {
  if (btn?.disabled) return;
  const old = btn?.textContent ?? '';
  if (btn) {
    btn.disabled = true;
    btn.dataset.eski = old;
    btn.setAttribute('aria-busy', 'true');
  }
  try {
    return await fn();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }
}

// ---------------------------------------------------------------- Bildirim ve pencere

export function toast(mesaj: string, tur: 'tamam' | 'hata' = 'tamam') {
  let wrap = document.querySelector<HTMLElement>('.toast-wrap');
  if (!wrap) {
    wrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.append(wrap);
  }
  const t = h('div', { class: `toast ${tur}` }, mesaj);
  wrap.append(t);
  setTimeout(() => t.classList.add('gidiyor'), tur === 'hata' ? 6000 : 3500);
  setTimeout(() => t.remove(), tur === 'hata' ? 6600 : 4100);
}

/** Basit onay/form penceresi. İçerikteki form gönderilince onKaydet çağrılır; true dönerse pencere kapanır. */
export function pencere(opts: {
  baslik: string;
  icerik: Node;
  kaydet?: string;
  tehlikeli?: boolean;
  onKaydet?: (form: HTMLFormElement) => Promise<boolean | void>;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const form = h(
      'form',
      { class: 'pencere-form', novalidate: true },
      h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
      opts.icerik,
      h(
        'div',
        { class: 'pencere-butonlar' },
        h('button', { type: 'button', class: 'btn btn-outline btn-sm', 'data-kapat': true }, 'Vazgeç'),
        h('button', { type: 'submit', class: `btn ${opts.tehlikeli ? 'btn-tehlike' : 'btn-primary'} btn-sm` }, opts.kaydet ?? 'Kaydet'),
      ),
    );
    const dlg = h('dialog', { class: 'pencere', 'aria-label': opts.baslik }, h('h2', null, opts.baslik), form);
    document.body.append(dlg);
    let sonuc = false;
    const kapat = () => {
      dlg.close();
      dlg.remove();
      resolve(sonuc);
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      kapat();
    });
    form.querySelector('[data-kapat]')!.addEventListener('click', kapat);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      formTemizle(form);
      const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
      await mesgul(btn, async () => {
        try {
          const r = opts.onKaydet ? await opts.onKaydet(form) : true;
          if (r !== false) {
            sonuc = true;
            kapat();
          }
        } catch (err) {
          formHatasi(form, err);
        }
      });
    });
    dlg.showModal();
    form.querySelector<HTMLElement>('input, select, textarea')?.focus();
  });
}

/** Alan oluşturucu: etiket + input */
export function alan(label: string, input: HTMLElement, ipucu?: string): HTMLElement {
  const id = input.id || `a-${Math.random().toString(36).slice(2, 9)}`;
  input.id = id;
  if (!input.dataset.alan) input.dataset.alan = label.replace(/\s*\(.*\)$/, '');
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, ipucu ? h('p', { class: 'hint' }, ipucu) : null);
}

/** Deneme sürümü bandı ve sistem hazır mı kontrolü */
export async function durumBandi(): Promise<{ mod: string; hazir: boolean } | null> {
  try {
    const d = await api<{ mod: string; hazir: boolean }>('GET', '/durum');
    const bant = document.querySelector<HTMLElement>('[data-deneme-bandi]');
    if (bant && d.mod === 'deneme') bant.hidden = false;
    return d;
  } catch {
    return null;
  }
}
