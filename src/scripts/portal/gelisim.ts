// Gelişim görünümü — diyetisyen panelinde ve danışanın Takibim sayfasında aynı şekilde kullanılır.

import { cizgiGrafik, type Nokta } from './chart';
import { gunFarki, h, sayi, sure, tarih } from './lib';
import type { Olcum } from './tipler';
import { vucutHaritasi } from './vucut';

export const olcumSirala = (o: Olcum[]) =>
  [...o].sort((a, b) => (a.tarih + (a.saat ?? '')).localeCompare(b.tarih + (b.saat ?? '')));

const isaretli = (n: number, b = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${sayi(Math.abs(n), b)}`;

/** Bir alan için ilk ve son değer */
export function ilkSon(olcumler: Olcum[], alan: keyof Olcum) {
  const liste = olcumSirala(olcumler).filter((o) => typeof o[alan] === 'number');
  if (!liste.length) return null;
  const ilk = liste[0];
  const son = liste[liste.length - 1];
  return { ilk, son, ilkDeger: ilk[alan] as number, sonDeger: son[alan] as number, gun: gunFarki(ilk.tarih, son.tarih) };
}

/** Özet kartları: son değer ve başlangıca göre değişim */
export function degisimKartlari(olcumler: Olcum[], hedefKilo?: number | null): HTMLElement {
  const kart = (etiket: string, alan: keyof Olcum, birim: string, iyiYon: 1 | -1) => {
    const d = ilkSon(olcumler, alan);
    if (!d) return null;
    const fark = d.sonDeger - d.ilkDeger;
    return h(
      'div',
      { class: 'kart gosterge' },
      h('span', { class: 'etiket' }, etiket),
      h('span', { class: 'deger' }, `${sayi(d.sonDeger)} ${birim}`),
      d.ilk !== d.son
        ? h(
            'span',
            { class: 'alt' },
            h('span', { class: `degisim ${fark * iyiYon > 0 ? 'iyi' : fark === 0 ? '' : 'kotu'} ${fark < 0 ? 'asagi' : fark > 0 ? 'yukari' : ''}` }, `${isaretli(fark)} ${birim}`),
            ` · ${sure(Math.max(1, d.gun))} (${tarih(d.ilk.tarih)} → ${tarih(d.son.tarih)})`,
          )
        : h('span', { class: 'alt' }, tarih(d.son.tarih)),
    );
  };
  const kilo = ilkSon(olcumler, 'kilo');
  return h(
    'div',
    { class: 'izgara' },
    kart('Kilo', 'kilo', 'kg', -1),
    kart('Yağ Kütlesi', 'yagKg', 'kg', -1),
    kart('Kas Kütlesi', 'kasKg', 'kg', 1),
    kart('Bel Çevresi', 'bel', 'cm', -1),
    hedefKilo && kilo
      ? h(
          'div',
          { class: 'kart gosterge' },
          h('span', { class: 'etiket' }, 'Hedef Kiloya'),
          h('span', { class: 'deger' }, `${sayi(Math.abs(kilo.sonDeger - hedefKilo))} kg`),
          h('span', { class: 'alt' }, `Hedef: ${sayi(hedefKilo)} kg`),
        )
      : null,
  );
}

const GRAFIKLER: { alan: keyof Olcum; baslik: string; birim: string; basamak?: number }[] = [
  { alan: 'kilo', baslik: 'Kilo', birim: 'kg' },
  { alan: 'yagKg', baslik: 'Yağ Kütlesi', birim: 'kg' },
  { alan: 'kasKg', baslik: 'Kas Kütlesi', birim: 'kg' },
  { alan: 'yagOrani', baslik: 'Yağ Oranı', birim: '%' },
  { alan: 'bel', baslik: 'Bel Çevresi', birim: 'cm', basamak: 0 },
  { alan: 'suOrani', baslik: 'Vücut Suyu', birim: '%' },
  { alan: 'icYag', baslik: 'İç Yağlanma', birim: '', basamak: 0 },
];

/** Zaman aralığı seçicili grafikler (küçük çoklu grafikler; çift eksen yok) */
export function grafikler(olcumler: Olcum[], hedefKilo?: number | null, evdeki: Olcum[] = []): HTMLElement {
  const tum = olcumSirala([...olcumler, ...evdeki]);
  const kap = h('div', { class: 'grafikler' });
  if (!tum.length) {
    kap.append(h('p', { class: 'bos' }, 'Henüz ölçüm yok.'));
    return kap;
  }
  const ilkTarih = tum[0].tarih;
  const sonTarih = tum[tum.length - 1].tarih;
  const toplamGun = gunFarki(ilkTarih, sonTarih);
  const araliklar: [string, number][] = [
    ['3 Ay', 92],
    ['6 Ay', 183],
    ['1 Yıl', 366],
    ['Tümü', Infinity],
  ];
  const kullanilabilir = araliklar.filter(([, g]) => g === Infinity || g < toplamGun);
  let secili = toplamGun > 400 ? 366 : Infinity;
  const izgara = h('div', { class: 'grafik-izgara' });
  const ciz = () => {
    const sinir = secili === Infinity ? '' : new Date(Date.parse(`${sonTarih}T00:00:00Z`) - secili * 86_400_000).toISOString().slice(0, 10);
    const aralik = tum.filter((o) => o.tarih >= sinir);
    izgara.replaceChildren(
      ...GRAFIKLER.map((g) => {
        const noktalar: Nokta[] = aralik
          .filter((o) => typeof o[g.alan] === 'number')
          .map((o) => ({ x: o.tarih, y: o[g.alan] as number, ev: o.kaynak === 'ev' }));
        if (!noktalar.length) return null;
        return h(
          'div',
          { class: 'kart' },
          cizgiGrafik({ baslik: g.baslik, birim: g.birim, noktalar, hedef: g.alan === 'kilo' ? hedefKilo : null, basamak: g.basamak }),
        );
      }).filter(Boolean) as HTMLElement[],
    );
  };
  if (kullanilabilir.length > 1) {
    const secici = h(
      'div',
      { class: 'secici', role: 'group', 'aria-label': 'Zaman aralığı' },
      kullanilabilir.map(([ad, gun]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'secici-dugme',
            'aria-pressed': String(gun === secili),
            onclick: (e: Event) => {
              secili = gun;
              for (const b of secici.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.currentTarget));
              ciz();
            },
          },
          ad,
        ),
      ),
    );
    kap.append(secici);
  }
  if (evdeki.length)
    kap.append(h('p', { class: 'grafik-not lejant-satiri' }, h('span', { class: 'nokta dolu' }), ' Klinik ölçümü  ', h('span', { class: 'nokta bos-nokta' }), ' Evde girilen'));
  kap.append(izgara);
  ciz();
  return kap;
}

/** Vücut haritası + değişim kartları + grafikler */
export function gelisimGorunumu(olcumler: Olcum[], opts: { hedefKilo?: number | null; evdeki?: Olcum[] } = {}): HTMLElement[] {
  return [
    h('div', { class: 'kart' }, h('h2', null, 'Vücut Haritası'), vucutHaritasi(olcumler)),
    degisimKartlari([...olcumler, ...(opts.evdeki ?? [])], opts.hedefKilo),
    grafikler(olcumler, opts.hedefKilo, opts.evdeki),
  ];
}

export const KAYNAK_ADI: Record<Olcum['kaynak'], string> = {
  pdf: 'Vücut analizi',
  gecmis: 'Cihaz geçmişi',
  elle: 'Klinik (elle)',
  ev: 'Evde',
};

/** Ölçüm tablosu (en yeni üstte). "eylem" verilirse her satıra düğme eklenir. */
export function olcumTablosu(olcumler: Olcum[], eylem?: (o: Olcum) => Node | null): HTMLElement {
  const liste = olcumSirala(olcumler).reverse();
  if (!liste.length) return h('p', { class: 'bos' }, 'Henüz ölçüm yok.');
  const sutunlar: { alan: keyof Olcum; ad: string; b?: number }[] = [
    { alan: 'kilo', ad: 'Kilo' },
    { alan: 'yagOrani', ad: 'Yağ %' },
    { alan: 'yagKg', ad: 'Yağ kg' },
    { alan: 'kasKg', ad: 'Kas kg' },
    { alan: 'suOrani', ad: 'Su %' },
    { alan: 'icYag', ad: 'İç yağ', b: 0 },
    { alan: 'bel', ad: 'Bel', b: 0 },
  ];
  const gorunen = sutunlar.filter((s) => liste.some((o) => typeof o[s.alan] === 'number'));
  const satir = (o: Olcum) =>
    h(
      'tr',
      null,
      h('td', null, tarih(o.tarih), o.saat ? h('span', { class: 'ince' }, ` ${o.saat}`) : null),
      gorunen.map((s) => h('td', { class: 'sayi' }, typeof o[s.alan] === 'number' ? sayi(o[s.alan] as number, s.b ?? 1) : '—')),
      h('td', null, KAYNAK_ADI[o.kaynak]),
      eylem ? h('td', null, eylem(o)) : null,
    );
  const KISA = 12;
  const govde = h('tbody', null, liste.slice(0, KISA).map(satir));
  const tumu =
    liste.length > KISA + 3
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-outline btn-sm tumunu-goster',
            onclick: (e: Event) => {
              govde.replaceChildren(...liste.map(satir));
              (e.currentTarget as HTMLElement).remove();
            },
          },
          `Tüm ölçümleri göster (${liste.length})`,
        )
      : null;
  if (!tumu) govde.replaceChildren(...liste.map(satir));
  return h(
    'div',
    null,
    h(
    'div',
    { class: 'tablo-kap' },
    h(
      'table',
      { class: 'tablo' },
      h(
        'thead',
        null,
        h('tr', null, h('th', null, 'Tarih'), gorunen.map((s) => h('th', { class: 'sayi' }, s.ad)), h('th', null, 'Kaynak'), eylem ? h('th', null, h('span', { class: 'sr-only' }, 'İşlem')) : null),
      ),
      govde,
    ),
    ),
    tumu,
  );
}
