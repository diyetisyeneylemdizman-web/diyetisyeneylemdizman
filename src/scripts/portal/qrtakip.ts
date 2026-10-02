// Sunucusuz Takibim (src/data/portal.ts → takibimKipi = 'qr').
//
// Danışanın Takibim özeti (ad, boy, hedef kilo, ölçümler, paket, yaklaşan randevular) sıkıştırılıp QR kodunun içine
// konur. QR'daki adres https://…/takibim/#n=<rakamlar> biçimindedir: "#" sonrası tarayıcıdan sunucuya HİÇ gönderilmez,
// bilgiler doğrudan danışanın telefonunda açılır ve yalnızca orada saklanır. Hiçbir sunucu kullanılmaz.
//
// - QR: veriler rakamlara çevrilir (QR'ın "sayısal" kipi aynı veriyi ~%25 daha küçük kodla taşır).
// - Online danışan için ilk bağlantı (#k=…): aynı veri 6 haneli kodla şifrelenir (PBKDF2 + AES-256-GCM); kod sözlü söylenir.
// - İlk QR / bağlantı danışana özel 256 bit bir anahtar da taşır; telefon bunu saklar. Sonraki ölçümlerde diyetisyen
//   WhatsApp'tan bir güncelleme bağlantısı (#g=…) gönderir: veri bu anahtarla şifrelidir (AES-256-GCM), yalnızca QR'ı
//   okutan telefonda açılır, kod gerekmez. Böylece QR yalnızca bir kez okutulur.
// - Özel notlar, hastalık / ilaç / alerji bilgileri ve paket notu eklenmez.
// - QR'a sığmayan çok eski geçmiş ölçümler çıkarılır; telefonda önceki okutmalardan kalanlar korunur.

import { deflateSync, inflateSync } from 'fflate';
import { aesAnahtari, b64url, coz, parolaAnahtari, rastgele, sifrele, unb64 } from './sifre';
import type { Olcum, PaketBilgisi, SegmentAdi, SegmentDeger, TakipRandevu, TakipVerisi } from './tipler';

/** Telefonda açılan Takibim verisi */
export interface QrTakip extends TakipVerisi {
  /** Danışanın paneldeki kimliği (kısaltılmış); aynı kişinin yeni QR'ı telefondaki kaydı günceller */
  kimlik: string;
  /** Bu QR'daki en eski ölçüm tarihi; telefonda bundan eski ölçümler (önceki okutmalardan) korunur */
  kapsam: string;
  /** Danışana özel güncelleme anahtarı (yalnızca ilk QR / bağlantıda gelir) */
  anahtar?: string;
}

const ALANLAR: (keyof Olcum)[] = [
  'kilo', 'bmi', 'yagOrani', 'yagKg', 'yagsizKg', 'kasKg', 'kasOrani', 'suKg', 'suOrani', 'icYag', 'bmh',
  'metabolikYas', 'proteinKg', 'mineralKg', 'idealKilo', 'iskeletKasKg', 'bel', 'kalca', 'belKalca', 'belBoy', 'fitPuani',
];
/** Eski ölçümlerde yalnızca grafik ve tablolarda kullanılan alanlar taşınır */
const OZET_ALANLAR = new Set<keyof Olcum>(['kilo', 'bmi', 'yagOrani', 'yagKg', 'yagsizKg', 'kasKg', 'suKg', 'suOrani', 'icYag', 'bel', 'kalca']);
const SEGMENT_ADLARI: SegmentAdi[] = ['sagKol', 'solKol', 'govde', 'sagBacak', 'solBacak'];
const SEGMENT_ALANLARI: (keyof SegmentDeger)[] = ['yagOrani', 'yagKg', 'yagsizKg', 'kasKg'];
const KAYNAKLAR: Olcum['kaynak'][] = ['pdf', 'gecmis', 'elle'];
const RANDEVU_DURUMLARI: TakipRandevu['durum'][] = ['onaylandi', 'tamamlandi', 'iptal', 'gelmedi'];

/** QR'ın rahat okunması için üst sınır (rakam). ~2600 rakam ≈ sürüm 24 QR (113×113 kare) */
export const QR_RAKAM_SINIRI = 2600;
const BAGLANTI_TURU = 200_000;

const GUN0 = Date.UTC(2000, 0, 1);
const gun = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - GUN0) / 864e5);
const isoGun = (g: number) => new Date(GUN0 + g * 864e5).toISOString().slice(0, 10);
const tamsayi = (n: number) => Math.round(n * 100);

// ---------------------------------------------------------------- Paketleme

type Satir = (number | (number | null)[][] | number)[];

function olcumSatirlari(olcumler: Olcum[]): Satir[] {
  const sirali = olcumler
    .filter((o) => o.kaynak !== 'ev' && /^\d{4}-\d{2}-\d{2}$/.test(o.tarih))
    .sort((a, b) => (a.tarih + (a.saat ?? '')).localeCompare(b.tarih + (b.saat ?? '')));
  // Tam ayrıntı: son ölçüm ve segmental değeri olan son iki ölçüm (vücut haritası ve değişimi için)
  const tam = new Set<Olcum>(sirali.filter((o) => o.segment).slice(-2));
  if (sirali.length) tam.add(sirali[sirali.length - 1]);
  const son: Partial<Record<keyof Olcum, number>> = {};
  let onceki = 0;
  return sirali.map((o) => {
    const ayrinti = tam.has(o);
    let maske = 0;
    const degerler: number[] = [];
    ALANLAR.forEach((a, i) => {
      const v = o[a];
      if (typeof v !== 'number' || !Number.isFinite(v) || (!ayrinti && !OZET_ALANLAR.has(a))) return;
      maske |= 1 << i;
      const t = tamsayi(v);
      degerler.push(t - (son[a] ?? 0));
      son[a] = t;
    });
    const g = gun(o.tarih);
    const satir: Satir = [g - onceki, Math.max(0, KAYNAKLAR.indexOf(o.kaynak)), maske, ...degerler];
    onceki = g;
    if (ayrinti && o.segment)
      satir.push(
        SEGMENT_ADLARI.map((s) => {
          const d = o.segment![s];
          return d ? SEGMENT_ALANLARI.map((k) => (typeof d[k] === 'number' ? tamsayi(d[k]!) : null)) : [];
        }),
      );
    return satir;
  });
}

export const kisaKimlik = (kimlik: string) => kimlik.slice(0, 10);

function hamVeri(v: TakipVerisi, kimlik: string, olcumler: Olcum[], anahtar?: string) {
  const p: PaketBilgisi | null = v.paket;
  return {
    v: 1,
    i: kisaKimlik(kimlik),
    ...(anahtar ? { a: anahtar } : {}),
    t: Math.round(v.guncellendi / 1000),
    d: [v.danisan.ad, v.danisan.cinsiyet ?? '', v.danisan.boy ?? 0, v.danisan.hedefKilo ?? 0],
    p: p ? [p.ad, p.baslangic ? gun(p.baslangic) : 0, p.bitis ? gun(p.bitis) : 0, p.toplamGorusme ?? -1, p.kalanGorusme ?? -1] : 0,
    r: v.randevular
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.tarih))
      .map((r) => [gun(r.tarih), r.saat, r.tur === 'online' ? 1 : 0, Math.max(0, RANDEVU_DURUMLARI.indexOf(r.durum))]),
    o: olcumSatirlari(olcumler),
  };
}

const sikistir = (deger: unknown) => deflateSync(new TextEncoder().encode(JSON.stringify(deger)), { level: 9 });

// 7 bayt → 17 rakam (son parça daha kısa); QR'ın sayısal kipinde baytlar en az yerle taşınır
const RAKAM = [0, 3, 5, 8, 10, 13, 15, 17];

export function rakamla(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 7) {
    const parca = b.subarray(i, i + 7);
    let n = 0n;
    for (const x of parca) n = (n << 8n) | BigInt(x);
    s += n.toString().padStart(RAKAM[parca.length], '0');
  }
  return s;
}

export function rakamCoz(s: string): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    const kalan = s.length - i;
    const k = kalan >= 17 ? 7 : RAKAM.indexOf(kalan);
    if (k < 1) throw new Error('Geçersiz uzunluk');
    let n = BigInt(s.slice(i, i + RAKAM[k]));
    const parca: number[] = [];
    for (let j = 0; j < k; j++) {
      parca.unshift(Number(n & 255n));
      n >>= 8n;
    }
    if (n !== 0n) throw new Error('Geçersiz rakam');
    out.push(...parca);
    i += RAKAM[k];
  }
  return Uint8Array.from(out);
}

export interface QrPaket {
  /** Adresin "#" sonrası: n=<rakamlar> */
  parca: string;
  /** QR'a sığmadığı için çıkarılan en eski ölçüm sayısı */
  cikarilan: number;
  /** QR'daki en eski ölçüm tarihi */
  ilkTarih: string | null;
}

/** Takibim verisini QR'a sığacak biçimde paketler (gerekirse en eski ölçümleri çıkarır) */
export function qrPaketle(v: TakipVerisi, kimlik: string, anahtar: string, sinir = QR_RAKAM_SINIRI): QrPaket {
  let olcumler = [...v.olcumler]
    .filter((o) => o.kaynak !== 'ev')
    .sort((a, b) => (a.tarih + (a.saat ?? '')).localeCompare(b.tarih + (b.saat ?? '')));
  const toplam = olcumler.length;
  for (;;) {
    const rakam = rakamla(sikistir(hamVeri(v, kimlik, olcumler, anahtar)));
    if (rakam.length <= sinir || olcumler.length <= 2) {
      return { parca: `n=${rakam}`, cikarilan: toplam - olcumler.length, ilkTarih: olcumler[0]?.tarih ?? null };
    }
    olcumler = olcumler.slice(Math.max(1, Math.floor(olcumler.length * 0.1)));
  }
}

/** Danışana özel yeni güncelleme anahtarı (paneldeki danışan kaydında saklanır) */
export const yeniGuncellemeAnahtari = () => b64url(rastgele(32));

/** Online danışan için 6 haneli kodla şifreli ilk bağlantı parçası (tüm ölçümler; boyut sınırı yok) */
export async function qrBaglantiParcasi(v: TakipVerisi, kimlik: string, kod: string, guncellemeAnahtari: string): Promise<string> {
  const tuz = rastgele(16);
  const anahtar = await parolaAnahtari(kod, tuz, BAGLANTI_TURU);
  const sifreli = await sifrele(anahtar, sikistir(hamVeri(v, kimlik, v.olcumler, guncellemeAnahtari)), 'takibim-baglanti');
  const tum = new Uint8Array(16 + sifreli.length);
  tum.set(tuz);
  tum.set(sifreli, 16);
  return `k=${b64url(tum)}`;
}

/** Güncelleme bağlantısı parçası: danışana özel anahtarla şifreli, yalnızca QR'ı okutan telefonda açılır */
export async function guncellemeParcasi(v: TakipVerisi, kimlik: string, guncellemeAnahtari: string): Promise<string> {
  const k = kisaKimlik(kimlik);
  const sifreli = await sifrele(await aesAnahtari(unb64(guncellemeAnahtari)), sikistir(hamVeri(v, kimlik, v.olcumler)), `takibim-guncelleme:${k}`);
  return `g=${k}.${b64url(sifreli)}`;
}

// ---------------------------------------------------------------- Açma (danışanın telefonu)

export function qrParcaTuru(hash: string): 'qr' | 'link' | 'guncelleme' | null {
  if (/^#?n=\d{20,8000}$/.test(hash)) return 'qr';
  if (/^#?k=[A-Za-z0-9_-]{60,12000}$/.test(hash)) return 'link';
  if (/^#?g=[A-Za-z0-9_-]{4,20}\.[A-Za-z0-9_-]{40,16000}$/.test(hash)) return 'guncelleme';
  return null;
}

/** Güncelleme bağlantısının hangi danışana ait olduğu (kısa kimlik) */
export const guncellemeKimligi = (hash: string) => hash.replace(/^#?g=/, '').split('.')[0];

/** Güncelleme bağlantısını telefondaki anahtarla açar */
export async function guncellemeAc(hash: string, guncellemeAnahtari: string): Promise<QrTakip> {
  const [k, veri] = hash.replace(/^#?g=/, '').split('.');
  return veriyiAc(await coz(await aesAnahtari(unb64(guncellemeAnahtari)), unb64(veri), `takibim-guncelleme:${k}`));
}

function veriyiAc(bayt: Uint8Array): QrTakip {
  const ham = JSON.parse(new TextDecoder().decode(inflateSync(bayt)));
  if (ham?.v !== 1 || !Array.isArray(ham.d) || !Array.isArray(ham.o)) throw new Error('Tanınmayan veri');
  const [ad, cinsiyet, boy, hedefKilo] = ham.d as [string, string, number, number];
  const p = ham.p as 0 | [string, number, number, number, number];
  const olcumler: Olcum[] = [];
  const son: Partial<Record<keyof Olcum, number>> = {};
  let g = 0;
  (ham.o as Satir[]).forEach((satir, sira) => {
    const [fark, kaynak, maske, ...kalan] = satir as [number, number, number, ...unknown[]];
    g += fark;
    const o: Olcum = { id: `qr-${isoGun(g)}-${sira}`, tarih: isoGun(g), kaynak: KAYNAKLAR[kaynak] ?? 'pdf' };
    let j = 0;
    ALANLAR.forEach((a, i) => {
      if (!(maske & (1 << i))) return;
      const t = (son[a] ?? 0) + Number(kalan[j++]);
      son[a] = t;
      (o as unknown as Record<string, number>)[a] = t / 100;
    });
    const seg = kalan[j];
    if (Array.isArray(seg)) {
      const segment: Partial<Record<SegmentAdi, SegmentDeger>> = {};
      SEGMENT_ADLARI.forEach((s, i) => {
        const d = seg[i] as (number | null)[] | undefined;
        if (!d || !d.length) return;
        const deger: SegmentDeger = {};
        SEGMENT_ALANLARI.forEach((k, m) => {
          if (typeof d[m] === 'number') deger[k] = (d[m] as number) / 100;
        });
        segment[s] = deger;
      });
      o.segment = segment;
    }
    olcumler.push(o);
  });
  return {
    v: 1,
    kimlik: String(ham.i),
    anahtar: typeof ham.a === 'string' && /^[A-Za-z0-9_-]{43}$/.test(ham.a) ? ham.a : undefined,
    guncellendi: Number(ham.t) * 1000,
    kapsam: olcumler[0]?.tarih ?? '9999-12-31',
    danisan: {
      ad: String(ad),
      cinsiyet: cinsiyet === 'K' || cinsiyet === 'E' ? cinsiyet : undefined,
      boy: boy || undefined,
      hedefKilo: hedefKilo || undefined,
    },
    paket: p
      ? {
          ad: p[0],
          baslangic: p[1] ? isoGun(p[1]) : undefined,
          bitis: p[2] ? isoGun(p[2]) : undefined,
          toplamGorusme: p[3] >= 0 ? p[3] : undefined,
          kalanGorusme: p[4] >= 0 ? p[4] : undefined,
        }
      : null,
    randevular: (ham.r as [number, string, number, number][]).map(([rg, saat, tur, durum], i) => ({
      id: `qr-r${i}`,
      tarih: isoGun(rg),
      saat,
      tur: tur === 1 ? 'online' : 'yuzyuze',
      durum: RANDEVU_DURUMLARI[durum] ?? 'onaylandi',
    })),
    olcumler,
    mesajlar: [],
    belgeler: [],
  };
}

/** QR (#n=) veya bağlantı (#k=, 6 haneli kodla) parçasını açar */
export async function qrParcaAc(hash: string, kod?: string): Promise<QrTakip> {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('n=')) return veriyiAc(rakamCoz(h.slice(2)));
  const tum = unb64(h.slice(2));
  const anahtar = await parolaAnahtari(kod ?? '', tum.subarray(0, 16), BAGLANTI_TURU);
  return veriyiAc(await coz(anahtar, tum.subarray(16), 'takibim-baglanti'));
}

/** Telefondaki önceki veriyle birleştirir: QR'daki en eski tarihten önceki ölçümler korunur */
export function birlestir(eski: TakipVerisi | undefined, yeni: QrTakip): QrTakip {
  if (!eski) return yeni;
  const korunan = eski.olcumler.filter((o) => o.tarih < yeni.kapsam);
  return { ...yeni, olcumler: [...korunan, ...yeni.olcumler] };
}
