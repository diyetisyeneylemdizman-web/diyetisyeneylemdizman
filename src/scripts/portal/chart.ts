// Gelişim grafiği: tek ölçü için zaman çizgisi (küçük çoklu grafikler hâlinde kullanılır; çift eksen yok).
// 2px çizgi, halkalı noktalar, silik ızgara, son değer etiketi, fare/klavye ile kesişim çizgisi ve açıklama kutusu.

import { h, s, sayi, tarih, tarihKisa } from './lib';

export type Nokta = { x: string; y: number; ev?: boolean };

type Opts = {
  baslik: string;
  birim: string;
  noktalar: Nokta[];
  hedef?: number | null;
  basamak?: number;
};

const RENK = '#4a5543'; // adaçayı-800
const HEDEF_RENK = '#9c5a45'; // terracotta-700
const ZEMIN = '#fffdf9';

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const ayYil = (iso: string) => `${AY[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

function niceStep(range: number, count: number) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export function cizgiGrafik(o: Opts): HTMLElement {
  const fig = h('figure', { class: 'grafik', tabindex: o.noktalar.length > 1 ? '0' : null });
  const cap = h('figcaption', { class: 'grafik-baslik' }, h('span', null, o.baslik), o.birim ? h('span', { class: 'birim' }, ` (${o.birim})`) : null);
  const alanEl = h('div', { class: 'grafik-alan' });
  const ipucu = h('div', { class: 'grafik-ipucu', hidden: true, role: 'status' });
  fig.append(cap, alanEl, ipucu);

  const pts = [...o.noktalar].sort((a, b) => a.x.localeCompare(b.x));
  if (!pts.length) {
    alanEl.append(h('p', { class: 'grafik-bos' }, 'Henüz ölçüm yok.'));
    return fig;
  }

  let secili = -1;
  let cizim: { x: (i: number) => number; y: (v: number) => number; H: number; pad: { t: number; b: number } } | null = null;

  const ciz = () => {
    const W = Math.max(260, Math.round(alanEl.clientWidth || 320));
    const H = 190;
    const pad = { l: 44, r: 58, t: 14, b: 28 };
    const vals = pts.map((p) => p.y).concat(o.hedef ? [o.hedef] : []);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (max - min < 1) {
      min -= 1;
      max += 1;
    }
    const step = niceStep(max - min, 4);
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    const t0 = Date.parse(`${pts[0].x}T00:00:00Z`);
    const t1 = Date.parse(`${pts[pts.length - 1].x}T00:00:00Z`);
    const span = Math.max(1, t1 - t0);
    const x = (i: number) =>
      pts.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + ((Date.parse(`${pts[i].x}T00:00:00Z`) - t0) / span) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
    cizim = { x, y, H, pad };

    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${o.baslik} grafiği` });
    // Izgara ve y ekseni değerleri
    for (let v = min; v <= max + step / 2; v += step) {
      svg.append(
        s('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: '#ece5da', 'stroke-width': 1 }),
        s('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'eksen' }, sayi(v, step < 1 ? 1 : 0)),
      );
    }
    // X ekseni: ilk ve son tarih (+ ortada bir tane)
    const xi = pts.length > 2 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : pts.map((_, i) => i);
    for (const i of [...new Set(xi)])
      svg.append(
        s(
          'text',
          { x: x(i), y: H - 8, 'text-anchor': pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle', class: 'eksen' },
          span > 300 * 86_400_000 ? ayYil(pts[i].x) : tarihKisa(pts[i].x),
        ),
      );
    // Hedef çizgisi
    if (o.hedef && o.hedef >= min && o.hedef <= max) {
      svg.append(
        s('line', { x1: pad.l, x2: W - pad.r, y1: y(o.hedef), y2: y(o.hedef), stroke: HEDEF_RENK, 'stroke-width': 1, opacity: 0.55 }),
        s('text', { x: W - pad.r + 6, y: y(o.hedef) + 4, class: 'eksen' }, `Hedef ${sayi(o.hedef)}`),
      );
    }
    if (pts.length > 1) {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
      svg.append(
        s('path', {
          d: `${d} L${x(pts.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`,
          fill: RENK,
          opacity: 0.08,
        }),
        s('path', { d, fill: 'none', stroke: RENK, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      );
    }
    // Çok sayıda ölçümde noktalar çizgiyi kalabalıklaştırır: yalnızca son nokta ve evde girilenler gösterilir
    const kalabalik = pts.length > 30;
    pts.forEach((p, i) => {
      if (kalabalik && !p.ev && i !== pts.length - 1) return;
      svg.append(
        p.ev
          ? s('circle', { cx: x(i), cy: y(p.y), r: 4, fill: ZEMIN, stroke: RENK, 'stroke-width': 2 })
          : s('circle', { cx: x(i), cy: y(p.y), r: 4, fill: RENK, stroke: ZEMIN, 'stroke-width': 2 }),
      );
    });
    // Son değer etiketi
    const son = pts[pts.length - 1];
    svg.append(
      s('text', { x: x(pts.length - 1) + 9, y: y(son.y) + 4, class: 'son-deger' }, `${sayi(son.y, o.basamak ?? 1)}`),
    );
    // Kesişim çizgisi (fare/klavye)
    const kesit = s('line', { y1: pad.t, y2: H - pad.b, stroke: '#676c64', 'stroke-width': 1, visibility: 'hidden', class: 'kesit' });
    const vurgu = s('circle', { r: 6, fill: RENK, stroke: ZEMIN, 'stroke-width': 2, visibility: 'hidden' });
    svg.append(kesit, vurgu);
    const yakala = s('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
    svg.append(yakala);
    const goster = (i: number) => {
      secili = i;
      const p = pts[i];
      kesit.setAttribute('x1', String(x(i)));
      kesit.setAttribute('x2', String(x(i)));
      kesit.setAttribute('visibility', 'visible');
      vurgu.setAttribute('cx', String(x(i)));
      vurgu.setAttribute('cy', String(y(p.y)));
      vurgu.setAttribute('visibility', 'visible');
      ipucu.replaceChildren(
        h('strong', null, `${sayi(p.y, o.basamak ?? 1)}${o.birim ? ` ${o.birim}` : ''}`),
        h('span', null, `${tarih(p.x)}${p.ev ? ' · evde' : ''}`),
      );
      ipucu.hidden = false;
      const left = Math.min(Math.max(x(i) - 70, 0), W - 140);
      ipucu.style.left = `${left}px`;
      ipucu.style.top = `${Math.max(0, y(p.y) - 62)}px`;
    };
    const gizle = () => {
      kesit.setAttribute('visibility', 'hidden');
      vurgu.setAttribute('visibility', 'hidden');
      ipucu.hidden = true;
    };
    yakala.addEventListener('pointermove', (e) => {
      const r = (svg as SVGSVGElement).getBoundingClientRect();
      const px = (e as PointerEvent).clientX - r.left;
      let best = 0;
      pts.forEach((_, i) => {
        if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
      });
      goster(best);
    });
    yakala.addEventListener('pointerleave', gizle);
    fig.onkeydown = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      goster(Math.min(pts.length - 1, Math.max(0, (secili < 0 ? pts.length : secili) + (e.key === 'ArrowLeft' ? -1 : 1))));
    };
    fig.onblur = gizle;
    alanEl.replaceChildren(svg);
  };

  const ro = new ResizeObserver(() => ciz());
  ro.observe(alanEl);
  requestAnimationFrame(ciz);
  if (pts.length === 1) fig.append(h('p', { class: 'grafik-not' }, 'İkinci ölçümden sonra değişim çizgisi oluşur.'));
  void cizim;
  return fig;
}
