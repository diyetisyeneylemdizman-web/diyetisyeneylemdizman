// İnsan modeli üzerinde vücut haritası: kollar, gövde ve bacaklar (segmental analiz) ayrı ayrı renklenir.
// - "Yağ oranı" görünümü: tek renk tonu, açıktan koyuya (sıralı ölçek).
// - "Değişim" görünümleri: iki uçlu ölçek — iyileşme mavi, kötüleşme kiremit, değişmeyen gri.
// Renk tek başına bilgi taşımaz: her bölgenin değeri ve değişimi (işaretiyle) yanındaki kartta yazılıdır;
// tablo görünümü de vardır. İki uçlu ölçek renk körlüğüne uygun mavi ↔ kiremit çiftidir (doğrulandı).

import { h, s, sayi, tarih } from './lib';
import { SEGMENTLER, type Olcum, type SegmentAdi } from './tipler';

const NOTR = '#e3e0da';

// Sıralı ölçek (yağ oranı): tek ton, açıktan koyuya
const SIRALI = ['#f0d5c9', '#e6b7a3', '#d6957a', '#c0704f', '#9a4a33'];
// İki uçlu ölçek: iyileşme (mavi) ← gri → kötüleşme (kiremit)
const IYI = ['#dbe7f2', '#a9c6e3', '#5f93c4', '#2e6da4'];
const KOTU = ['#f6dfd5', '#ebb29b', '#d98466', '#b4553b'];

// Basit, cinsiyetsiz insan silueti (ön görünüm). Kişinin sağı, ekranda solda kalır.
// Gövde dolgulu bir şekil; kollar ve bacaklar kalın, uçları yuvarlak çizgilerdir. Bölgeler arasında boşluk bırakılır.
type Parca = { d: string; kalinlik?: number };
const PARCALAR: Record<SegmentAdi, Parca> = {
  govde: {
    d: 'M70 66C84 60 116 60 130 66C138 70 140 78 139 90L134 148C132 170 134 188 136 206C137 212 133 216 127 216H73C67 216 63 212 64 206C66 188 68 170 66 148L61 90C60 78 62 70 70 66Z',
  },
  sagKol: { d: 'M50 79C45 98 43 122 41 146L35 213', kalinlik: 17 },
  solKol: { d: 'M150 79C155 98 157 122 159 146L165 213', kalinlik: 17 },
  sagBacak: { d: 'M86 231C85 280 84 330 84 383', kalinlik: 26 },
  solBacak: { d: 'M114 231C115 280 116 330 116 383', kalinlik: 26 },
};

function parcaCiz(p: Parca, renk: string, ek: Record<string, string> = {}): SVGElement {
  return p.kalinlik
    ? s('path', { d: p.d, fill: 'none', stroke: renk, 'stroke-width': p.kalinlik, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...ek })
    : s('path', { d: p.d, fill: renk, ...ek });
}

function basCiz(svg: SVGElement) {
  svg.append(s('circle', { cx: 100, cy: 31, r: 20, fill: NOTR }), s('rect', { x: 93, y: 49, width: 14, height: 13, rx: 4, fill: NOTR }));
}

const renkVer = (el: SVGElement, renk: string) => el.setAttribute(el.getAttribute('fill') === 'none' ? 'stroke' : 'fill', renk);

type Gorunum = 'yag' | 'yagDegisim' | 'kasDegisim';

const sirali = (oran: number) => {
  // %10 → en açık, %45 → en koyu
  const t = Math.min(1, Math.max(0, (oran - 10) / 35));
  return SIRALI[Math.min(SIRALI.length - 1, Math.floor(t * SIRALI.length))];
};

const ikiUclu = (fark: number, iyiYon: 1 | -1, esik: number) => {
  if (Math.abs(fark) < esik) return NOTR;
  // esik–2·esik → 1. ton, 2–3 → 2. ton, 3–4 → 3. ton, 4·esik ve üstü → en koyu ton
  const kade = Math.min(3, Math.floor(Math.abs(fark) / esik) - 1);
  return (fark * iyiYon > 0 ? IYI : KOTU)[kade];
};

const isaret = (n: number, basamak = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${sayi(Math.abs(n), basamak)}`;

export function vucutHaritasi(olcumler: Olcum[]): HTMLElement {
  const sirali_ = [...olcumler].sort((a, b) => (a.tarih + (a.saat ?? '')).localeCompare(b.tarih + (b.saat ?? '')));
  const segmentli = sirali_.filter((o) => o.segment && Object.keys(o.segment).length);
  const son = segmentli[segmentli.length - 1];
  const ilk = segmentli[0];
  const degisimVar = segmentli.length > 1;

  const kap = h('div', { class: 'vucut' });
  if (!son) return genelHarita(sirali_, kap);

  let gorunum: Gorunum = 'yag';
  const secici = h(
    'div',
    { class: 'secici', role: 'group', 'aria-label': 'Harita görünümü' },
    ...(
      [
        ['yag', 'Yağ Oranı'],
        ['yagDegisim', 'Yağ Değişimi'],
        ['kasDegisim', 'Kas Değişimi'],
      ] as [Gorunum, string][]
    )
      .filter(([g]) => g === 'yag' || degisimVar)
      .map(([g, ad]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'secici-dugme',
            'aria-pressed': g === gorunum ? 'true' : 'false',
            onclick: (e: Event) => {
              gorunum = g;
              for (const b of secici.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.currentTarget));
              ciz();
            },
          },
          ad,
        ),
      ),
  );

  const svg = s('svg', { viewBox: '0 0 200 400', class: 'vucut-figur', role: 'img', 'aria-label': 'Vücut haritası' });
  const yollar: Partial<Record<SegmentAdi, SVGElement>> = {};
  basCiz(svg);
  for (const sg of SEGMENTLER) {
    const p = parcaCiz(PARCALAR[sg.ad], NOTR, { 'data-segment': sg.ad });
    p.append(s('title', null, sg.etiket));
    yollar[sg.ad] = p;
    svg.append(p);
  }

  const kartlar: Partial<Record<SegmentAdi, HTMLElement>> = {};
  const vurgula = (ad: SegmentAdi | null) => {
    for (const sg of SEGMENTLER) {
      yollar[sg.ad]?.classList.toggle('vurgu', sg.ad === ad);
      kartlar[sg.ad]?.classList.toggle('vurgu', sg.ad === ad);
    }
  };
  for (const sg of SEGMENTLER) {
    const p = yollar[sg.ad]!;
    p.addEventListener('pointerenter', () => vurgula(sg.ad));
    p.addEventListener('pointerleave', () => vurgula(null));
    p.addEventListener('click', () => kartlar[sg.ad]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  const lejant = h('div', { class: 'vucut-lejant' });
  const solSutun = h('div', { class: 'vucut-sutun sol' });
  const sagSutun = h('div', { class: 'vucut-sutun sag' });

  const ciz = () => {
    for (const sg of SEGMENTLER) {
      const d = son.segment?.[sg.ad];
      const i = ilk.segment?.[sg.ad];
      let renk = NOTR;
      if (d) {
        if (gorunum === 'yag' && d.yagOrani !== undefined) renk = sirali(d.yagOrani);
        if (gorunum === 'yagDegisim' && i?.yagKg !== undefined && d.yagKg !== undefined)
          renk = ikiUclu(d.yagKg - i.yagKg, -1, sg.ad === 'govde' ? 0.3 : 0.1);
        if (gorunum === 'kasDegisim' && i?.kasKg !== undefined && d.kasKg !== undefined)
          renk = ikiUclu(d.kasKg - i.kasKg, 1, sg.ad === 'govde' ? 0.3 : 0.1);
      }
      renkVer(yollar[sg.ad]!, renk);

      const kart = h(
        'div',
        {
          class: 'vucut-kart',
          tabindex: '0',
          onpointerenter: () => vurgula(sg.ad),
          onpointerleave: () => vurgula(null),
          onfocus: () => vurgula(sg.ad),
          onblur: () => vurgula(null),
        },
        h('span', { class: 'vucut-kart-renk', style: `background:${renk}` }),
        h('strong', null, sg.etiket),
        d
          ? h(
              'dl',
              null,
              h('dt', null, 'Yağ'),
              h(
                'dd',
                null,
                `%${sayi(d.yagOrani)} · ${sayi(d.yagKg)} kg`,
                degisimVar && i?.yagKg !== undefined && d.yagKg !== undefined
                  ? h('span', { class: `fark ${d.yagKg - i.yagKg <= 0 ? 'iyi' : 'kotu'}` }, ` ${isaret(d.yagKg - i.yagKg)} kg`)
                  : null,
              ),
              h('dt', null, 'Kas'),
              h(
                'dd',
                null,
                `${sayi(d.kasKg)} kg`,
                degisimVar && i?.kasKg !== undefined && d.kasKg !== undefined
                  ? h('span', { class: `fark ${d.kasKg - i.kasKg >= 0 ? 'iyi' : 'kotu'}` }, ` ${isaret(d.kasKg - i.kasKg)} kg`)
                  : null,
              ),
            )
          : h('p', { class: 'bos' }, 'Ölçüm yok'),
      );
      kartlar[sg.ad] = kart;
    }
    solSutun.replaceChildren(kartlar.sagKol!, kartlar.sagBacak!);
    sagSutun.replaceChildren(kartlar.govde!, kartlar.solKol!, kartlar.solBacak!);

    if (gorunum === 'yag') {
      lejant.replaceChildren(
        h('span', null, 'Yağ oranı: düşük'),
        h('span', { class: 'lejant-cubuk' }, ...SIRALI.map((r) => h('i', { style: `background:${r}` }))),
        h('span', null, 'yüksek'),
      );
    } else {
      lejant.replaceChildren(
        h('span', null, 'İyileşme'),
        h(
          'span',
          { class: 'lejant-cubuk' },
          ...[...IYI].reverse().map((r) => h('i', { style: `background:${r}` })),
          h('i', { style: `background:${NOTR}` }),
          ...KOTU.map((r) => h('i', { style: `background:${r}` })),
        ),
        h('span', null, 'Kötüleşme'),
      );
    }
  };
  ciz();

  const bilgi = degisimVar
    ? `Son ölçüm: ${tarih(son.tarih)} · Değişim, ${tarih(ilk.tarih)} tarihli ilk segmental ölçüme göredir.`
    : `Ölçüm tarihi: ${tarih(son.tarih)}`;

  kap.append(
    h('div', { class: 'vucut-ust' }, degisimVar ? secici : h('span', null), lejant),
    h('div', { class: 'vucut-izgara' }, solSutun, h('div', { class: 'vucut-orta' }, svg, h('p', { class: 'vucut-not' }, 'Sağ ve sol, kişinin kendi sağı ve soludur.')), sagSutun),
    h('p', { class: 'grafik-not' }, bilgi),
    segmentTablosu(son, degisimVar ? ilk : null),
  );
  return kap;
}

/** Segmental ölçüm yoksa (ör. online danışan): figür üzerinde genel değerler */
function genelHarita(olcumler: Olcum[], kap: HTMLElement): HTMLElement {
  const son = olcumler[olcumler.length - 1];
  const ilkBul = (k: keyof Olcum) => olcumler.find((o) => typeof o[k] === 'number');
  const sonBul = (k: keyof Olcum) => [...olcumler].reverse().find((o) => typeof o[k] === 'number');
  const svg = s('svg', { viewBox: '0 0 200 400', class: 'vucut-figur', role: 'img', 'aria-label': 'Vücut figürü' });
  basCiz(svg);
  for (const p of Object.values(PARCALAR)) svg.append(parcaCiz(p, NOTR));
  if (sonBul('bel')) svg.append(s('line', { x1: 56, x2: 144, y1: 166, y2: 166, stroke: '#9c5a45', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));

  const kart = (etiket: string, k: keyof Olcum, birim: string, iyiYon: 1 | -1) => {
    const s1 = sonBul(k);
    const i1 = ilkBul(k);
    if (!s1) return null;
    const v = s1[k] as number;
    const fark = i1 && i1 !== s1 ? v - (i1[k] as number) : null;
    return h(
      'div',
      { class: 'vucut-kart' },
      h('strong', null, etiket),
      h(
        'p',
        { class: 'vucut-deger' },
        `${sayi(v)} ${birim}`,
        fark !== null ? h('span', { class: `fark ${fark * iyiYon >= 0 ? 'iyi' : 'kotu'}` }, ` ${isaret(fark)} ${birim}`) : null,
      ),
    );
  };
  if (!son) {
    kap.append(h('p', { class: 'bos' }, 'Henüz ölçüm yok.'));
    return kap;
  }
  kap.append(
    h(
      'div',
      { class: 'vucut-izgara' },
      h('div', { class: 'vucut-sutun sol' }, kart('Kilo', 'kilo', 'kg', -1), kart('Yağ Kütlesi', 'yagKg', 'kg', -1)),
      h('div', { class: 'vucut-orta' }, svg),
      h('div', { class: 'vucut-sutun sag' }, kart('Bel Çevresi', 'bel', 'cm', -1), kart('Kas Kütlesi', 'kasKg', 'kg', 1)),
    ),
    h('p', { class: 'grafik-not' }, 'Kol, bacak ve gövde değerleri klinikteki vücut analizinden sonra görünür.'),
  );
  return kap;
}

function segmentTablosu(son: Olcum, ilk: Olcum | null): HTMLElement {
  return h(
    'details',
    { class: 'tablo-ac' },
    h('summary', null, 'Tablo olarak göster'),
    h(
      'div',
      { class: 'tablo-kap' },
      h(
        'table',
        { class: 'tablo' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, 'Bölge'),
            h('th', { class: 'sayi' }, 'Yağ %'),
            h('th', { class: 'sayi' }, 'Yağ (kg)'),
            h('th', { class: 'sayi' }, 'Kas (kg)'),
            ilk ? h('th', { class: 'sayi' }, 'Yağ farkı') : null,
            ilk ? h('th', { class: 'sayi' }, 'Kas farkı') : null,
          ),
        ),
        h(
          'tbody',
          null,
          SEGMENTLER.map((sg) => {
            const d = son.segment?.[sg.ad];
            const i = ilk?.segment?.[sg.ad];
            const f = (a?: number, b?: number) => (a !== undefined && b !== undefined ? isaret(a - b) : '—');
            return h(
              'tr',
              null,
              h('td', null, sg.etiket),
              h('td', { class: 'sayi' }, sayi(d?.yagOrani)),
              h('td', { class: 'sayi' }, sayi(d?.yagKg)),
              h('td', { class: 'sayi' }, sayi(d?.kasKg)),
              ilk ? h('td', { class: 'sayi' }, f(d?.yagKg, i?.yagKg)) : null,
              ilk ? h('td', { class: 'sayi' }, f(d?.kasKg, i?.kasKg)) : null,
            );
          }),
        ),
      ),
    ),
  );
}
