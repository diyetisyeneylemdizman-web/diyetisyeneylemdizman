// Tanita MC-780 (Tartı yazılımı) "Segmental Vücut Analizi" PDF raporunu okur.
// Bu dosya tarayıcıya bağlı değildir; PDF'ten çıkarılan metin satırlarıyla çalışır (pdfoku.ts).

import type { Olcum, SegmentAdi, SegmentDeger } from './tipler';

export interface MetinParcasi {
  s: string;
  x: number;
}
export interface MetinSatiri {
  y: number;
  parcalar: MetinParcasi[];
}
/** Sayfa → satırlar (yukarıdan aşağı) */
export type PdfMetni = MetinSatiri[][];

export interface TanitaSonuc {
  cihaz: string;
  kisi: { ad?: string; cinsiyet?: 'K' | 'E'; vucutTipi?: string; yas?: number; boy?: number };
  olcum: Omit<Olcum, 'id' | 'kaynak'>;
  gecmis: Omit<Olcum, 'id' | 'kaynak'>[];
  bulunan: number; // okunan değer sayısı
}

/** pdf.js metin öğelerini satırlara ayırır (aynı yükseklikteki parçalar soldan sağa) */
export function satirlaraAyir(ogeler: { str: string; x: number; y: number }[]): MetinSatiri[] {
  const satirlar: MetinSatiri[] = [];
  for (const o of ogeler) {
    const s = o.str.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    let satir = satirlar.find((r) => Math.abs(r.y - o.y) < 2.5);
    if (!satir) {
      satir = { y: o.y, parcalar: [] };
      satirlar.push(satir);
    }
    // Aynı metin aynı yere iki kez çizilmiş olabilir (rapor gölgeli yazı kullanıyor)
    if (!satir.parcalar.some((p) => p.s === s && Math.abs(p.x - o.x) < 2)) satir.parcalar.push({ s, x: o.x });
  }
  satirlar.sort((a, b) => b.y - a.y);
  for (const r of satirlar) r.parcalar.sort((a, b) => a.x - b.x);
  return satirlar;
}

const sayiOku = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const m = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const kgYuzde = (s: string | undefined): { kg?: number; yuzde?: number } => {
  if (!s) return {};
  const m = s.replace(/\s+/g, '').match(/^(-?[\d.,]+)kg(?:\/(-?[\d.,]+)%)?/i);
  if (!m) return {};
  return { kg: sayiOku(m[1]), yuzde: sayiOku(m[2]) };
};

const kucuk = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

export function tanitaCoz(sayfalar: PdfMetni): TanitaSonuc | null {
  const tum = sayfalar.flat();
  const metin = tum.map((r) => r.parcalar.map((p) => p.s).join(' ')).join('\n');
  const kucukMetin = kucuk(metin);
  if (!kucukMetin.includes('vücut analiz') && !kucukMetin.includes('vücut kompozisyon') && !/tanita|mc-?780/.test(kucukMetin)) return null;

  let bulunan = 0;
  const bul = (etiket: string, desen: RegExp): string | undefined => {
    const e = kucuk(etiket);
    for (const r of tum) {
      for (let i = 0; i < r.parcalar.length - 1; i++) {
        if (kucuk(r.parcalar[i].s) === e && desen.test(r.parcalar[i + 1].s)) {
          bulunan++;
          return r.parcalar[i + 1].s;
        }
      }
    }
    return undefined;
  };
  const KG_YUZDE = /^-?[\d.,]+\s*kg\s*\/\s*-?[\d.,]+\s*%/i;
  const KG = /^-?[\d.,]+\s*kg/i;
  const SAYI = /^-?[\d.,]+/;

  const olcum: Omit<Olcum, 'id' | 'kaynak'> = { tarih: '' };

  // Tarih: sayfanın üstündeki "2026-04-02 11:13:51"
  for (const r of sayfalar[0] ?? []) {
    const p = r.parcalar.find((x) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(x.s));
    if (p) {
      olcum.tarih = p.s.slice(0, 10);
      olcum.saat = p.s.slice(11, 16);
      break;
    }
  }

  // Kişi bilgileri: başlık satırı ile altındaki değer satırını sütun konumuna göre eşleştir
  const kisi: TanitaSonuc['kisi'] = {};
  const ilk = sayfalar[0] ?? [];
  const basIdx = ilk.findIndex((r) => r.parcalar.some((p) => p.s === 'Cinsiyet') && r.parcalar.some((p) => /Kilo/.test(p.s)));
  if (basIdx >= 0) {
    const bas = ilk[basIdx].parcalar;
    const veri = ilk.slice(basIdx + 1, basIdx + 5).find((r) => r.parcalar.some((p) => /^(Kadın|Erkek)$/i.test(p.s)));
    if (veri) {
      const sutun = (etiket: RegExp) => {
        const b = bas.find((p) => etiket.test(p.s));
        if (!b) return undefined;
        let enYakin: MetinParcasi | undefined;
        for (const p of veri.parcalar) if (!enYakin || Math.abs(p.x - b.x) < Math.abs(enYakin.x - b.x)) enYakin = p;
        return enYakin && Math.abs(enYakin.x - b.x) < 45 ? enYakin.s : undefined;
      };
      const ad = sutun(/^Adı Soyadı$/);
      if (ad && !/^(Kadın|Erkek)$/i.test(ad)) kisi.ad = ad;
      const c = sutun(/^Cinsiyet$/);
      if (c) kisi.cinsiyet = /^kad/i.test(c) ? 'K' : /^erk/i.test(c) ? 'E' : undefined;
      kisi.vucutTipi = sutun(/^Vücut Tipi$/);
      kisi.yas = sayiOku(sutun(/^Yaş$/));
      kisi.boy = sayiOku(sutun(/^Boy/));
      olcum.kilo = sayiOku(sutun(/^Kilo/));
      olcum.bmi = sayiOku(sutun(/^BMI$/));
      if (olcum.kilo !== undefined) bulunan++;
    }
  }

  const yagsiz = kgYuzde(bul('Yağsız Kütle', KG_YUZDE));
  olcum.yagsizKg = yagsiz.kg;
  const kas = kgYuzde(bul('Kas', KG_YUZDE));
  olcum.kasKg = kas.kg;
  olcum.kasOrani = kas.yuzde;
  const yag = kgYuzde(bul('Yağ', KG_YUZDE));
  olcum.yagKg = yag.kg;
  olcum.yagOrani = yag.yuzde;
  const su = kgYuzde(bul('Sıvı', KG_YUZDE));
  olcum.suKg = su.kg;
  olcum.suOrani = su.yuzde;
  olcum.proteinKg = kgYuzde(bul('Protein', KG_YUZDE)).kg;
  olcum.mineralKg = kgYuzde(bul('Mineral', KG_YUZDE)).kg;
  olcum.idealKilo = kgYuzde(bul('İdeal Kilo', KG)).kg;
  olcum.iskeletKasKg = kgYuzde(bul('İskeletsel Kaslar', KG)).kg;
  olcum.icYag = sayiOku(bul('İç Yağlanma', SAYI));
  olcum.metabolikYas = sayiOku(bul('Metabolik Yaş', SAYI));
  olcum.bmh = sayiOku(bul('Bazal Metabolizma Hızı', /kcal/i));
  olcum.bel = sayiOku(bul('Bel (cm)', SAYI));
  olcum.belKalca = sayiOku(bul('Bel / Kalça', SAYI));
  olcum.belBoy = sayiOku(bul('Bel / Boy', SAYI));
  olcum.fitPuani = sayiOku(bul('Fit Puanı:', SAYI));

  // Kilo başlıkta bulunamadıysa "Ağırlık" sütunlu çubuk grafiğinden değil, yağ + yağsız kütleden hesapla
  if (olcum.kilo === undefined && olcum.yagKg !== undefined && olcum.yagsizKg !== undefined)
    olcum.kilo = Math.round((olcum.yagKg + olcum.yagsizKg) * 10) / 10;
  if (olcum.kalca === undefined && olcum.bel && olcum.belKalca) olcum.kalca = Math.round(olcum.bel / olcum.belKalca);

  // Segmental tablo (2. sayfa): Sağ Bacak | Sol Bacak | Sağ Kol | Sol Kol | Gövde
  const SEG_ADLARI: Record<string, SegmentAdi> = {
    'sağ bacak': 'sagBacak',
    'sol bacak': 'solBacak',
    'sağ kol': 'sagKol',
    'sol kol': 'solKol',
    gövde: 'govde',
  };
  const SEG_SATIR: Record<string, keyof SegmentDeger> = {
    'yağ oranı (%)': 'yagOrani',
    'yağ (kg)': 'yagKg',
    'yağsız (kg)': 'yagsizKg',
    'kas (kg)': 'kasKg',
  };
  for (const sayfa of sayfalar) {
    const i = sayfa.findIndex((r) => r.parcalar.filter((p) => SEG_ADLARI[kucuk(p.s)]).length >= 4);
    if (i < 0) continue;
    const bas = sayfa[i].parcalar.filter((p) => SEG_ADLARI[kucuk(p.s)]);
    const segment: Partial<Record<SegmentAdi, SegmentDeger>> = {};
    for (const r of sayfa.slice(i + 1, i + 8)) {
      const alan = SEG_SATIR[kucuk(r.parcalar[0]?.s ?? '')];
      if (!alan) continue;
      for (const p of r.parcalar.slice(1)) {
        const n = sayiOku(p.s);
        if (n === undefined) continue;
        let enYakin = bas[0];
        for (const b of bas) if (Math.abs(b.x - p.x) < Math.abs(enYakin.x - p.x)) enYakin = b;
        if (Math.abs(enYakin.x - p.x) > 60) continue;
        const seg = SEG_ADLARI[kucuk(enYakin.s)];
        (segment[seg] ??= {})[alan] = n;
        bulunan++;
      }
    }
    if (Object.keys(segment).length) olcum.segment = segment;
    break;
  }

  // Geçmiş ölçümler tablosu ("Fark Analizi (kg)"): tarih + Ağırlık, Fark, Yağsız, Fark, Sıvı, Fark, Yağ, Fark
  const BASLIK = new Set(['ölçüm tarihi', 'ağırlık', 'fark', 'yağsız', 'sıvı', 'yağ']);
  const gecmis: TanitaSonuc['gecmis'] = [];
  const goruldu = new Set<string>();
  for (const r of tum) {
    const p = r.parcalar.filter((x) => !BASLIK.has(kucuk(x.s)));
    if (p.length !== 9) continue;
    const m = p[0].s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
    if (!m) continue;
    const n = p.slice(1).map((x) => (SAYI.test(x.s) ? sayiOku(x.s) : undefined));
    if (n.some((x) => x === undefined)) continue;
    const tarih = `${m[3]}-${m[2]}-${m[1]}`;
    const saat = `${m[4]}:${m[5]}`;
    if (goruldu.has(tarih + saat)) continue;
    goruldu.add(tarih + saat);
    const kilo = n[0]!;
    const yagKg = n[6]!;
    gecmis.push({
      tarih,
      saat,
      kilo,
      yagsizKg: n[2],
      suKg: n[4],
      yagKg,
      yagOrani: kilo ? Math.round((yagKg / kilo) * 1000) / 10 : undefined,
    });
  }
  gecmis.sort((a, b) => (a.tarih + (a.saat ?? '')).localeCompare(b.tarih + (b.saat ?? '')));

  // Boş alanları temizle
  for (const k of Object.keys(olcum) as (keyof typeof olcum)[]) if (olcum[k] === undefined) delete olcum[k];
  if (!olcum.tarih && gecmis.length) {
    const son = gecmis[gecmis.length - 1];
    olcum.tarih = son.tarih;
    olcum.saat = son.saat;
  }
  if (!olcum.tarih || olcum.kilo === undefined) return null;

  const cihaz = /MC-?780/i.test(metin) ? 'Tanita MC-780' : 'Vücut analizi';
  return { cihaz, kisi, olcum, gecmis, bulunan };
}

/** Ad karşılaştırma için sadeleştirme (Türkçe harfler, boşluklar) */
export function adSadele(ad: string): string {
  return ad
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]!)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
