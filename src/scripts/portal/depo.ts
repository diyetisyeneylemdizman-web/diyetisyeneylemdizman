// Diyetisyen panelinin kayıtları — yalnızca bu bilgisayarda, tarayıcının içinde (IndexedDB) ve şifreli durur.
// Şifre anahtarı panel parolasından türetilir; parola hiçbir yere kaydedilmez ve sunucuya gönderilmez.

import type { RandevuDurumu } from '../../data/portal';
import { b64, PAROLA_TURU, parolaAnahtari, rastgele, unb64, jsonSifrele, jsonCoz } from './sifre';
import type { Olcum, PaketBilgisi, TakipBelge, TakipMesaj } from './tipler';

export interface TakipDurumu {
  kutu: string;
  jeton: string;
  anahtar: string;
  olusturma: number;
  durum: 'bekliyor' | 'eslesti' | 'kapatildi' | 'yok';
  eslesti?: number;
  sonBakis?: number;
  riza?: string;
  sonGonderim?: number;
  bekleyenGonderim?: boolean;
  hata?: string;
}

export interface Danisan {
  id: string;
  ad: string;
  telefon: string;
  eposta?: string;
  cinsiyet?: 'K' | 'E';
  dogumYili?: number;
  boy?: number;
  hedefKilo?: number;
  hedef?: string;
  alerjiler?: string;
  hastaliklar?: string;
  ilaclar?: string;
  olusturma: number;
  guncelleme: number;
  olcumler: Olcum[];
  paket: PaketBilgisi | null;
  mesajlar: TakipMesaj[];
  belgeler: TakipBelge[];
  notlar: { id: string; tarih: number; metin: string }[];
  takip: TakipDurumu | null;
  /** Sunucusuz Takibim: QR'ın son gösterildiği / bağlantının son gönderildiği zaman */
  qrPaylasim?: number;
  /** Sunucusuz Takibim: danışana özel güncelleme anahtarı (ilk QR ile telefonuna geçer) */
  takibimAnahtar?: string;
  /** Sunucusuz Takibim: son güncelleme bağlantısının gönderildiği zaman */
  guncellemeGonderim?: number;
}

export interface Randevu {
  id: string;
  danisanId?: string;
  ad: string;
  /** Hitap için (K: Hanım, E: Bey); danışan kaydı varsa onun cinsiyeti kullanılır */
  cinsiyet?: 'K' | 'E';
  telefon: string;
  tarih: string; // YYYY-AA-GG veya '' (tarih fark etmez)
  saat: string; // SS:DD veya ''
  tur: 'yuzyuze' | 'online';
  konu?: string;
  not?: string;
  vki?: string;
  durum: RandevuDurumu;
  kaynak: 'site' | 'panel' | 'whatsapp';
  olusturma: number;
  okundu?: boolean;
}

export interface PaketTanimi {
  id: string;
  ad: string;
  gorusme?: number;
  gun?: number;
  fiyat?: number;
  aktif: boolean;
}

export interface PanelVerisi {
  v: 1;
  olusturma: number;
  sunucu: { jeton: string; ozel: JsonWebKey; acik: JsonWebKey; baglandi: number } | null;
  sablonlar: Record<string, string>;
  danisanlar: Danisan[];
  randevular: Randevu[];
  paketler: PaketTanimi[];
  sonYedek?: number;
  /** İşlem kayıtları (KVKK: özel nitelikli verilerde yapılan işlemlerin kaydı). En fazla 2 yıl / 3000 kayıt tutulur. */
  islemler?: { t: number; ne: string }[];
}

interface Kasa {
  v: 1;
  tuz: string;
  tur: number;
  veri: string;
  kaydedildi: number;
}

const VT = 'diyetisyen-paneli';
const DEPO = 'kv';

function vt(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(VT, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(DEPO);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function oku<T>(anahtar: string): Promise<T | undefined> {
  const db = await vt();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction(DEPO, 'readonly').objectStore(DEPO).get(anahtar);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

async function yaz(anahtar: string, deger: unknown): Promise<void> {
  const db = await vt();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DEPO, 'readwrite');
      tx.objectStore(DEPO).put(deger, anahtar);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const bosVeri = (): PanelVerisi => ({
  v: 1,
  olusturma: Date.now(),
  sunucu: null,
  sablonlar: {},
  danisanlar: [],
  randevular: [],
  paketler: [],
});

export class ParolaHatasi extends Error {}

export class Depo {
  private bekleyen: Promise<void> = Promise.resolve();
  private zamanlayici = 0;

  private constructor(
    public veri: PanelVerisi,
    private anahtar: CryptoKey,
    private tuz: Uint8Array,
    private tur: number,
  ) {}

  static async var(): Promise<boolean> {
    return Boolean(await oku<Kasa>('kasa'));
  }

  static async olustur(parola: string, veri: PanelVerisi = bosVeri()): Promise<Depo> {
    const tuz = rastgele(16);
    const d = new Depo(veri, await parolaAnahtari(parola, tuz, PAROLA_TURU), tuz, PAROLA_TURU);
    await d.simdiKaydet();
    // Tarayıcının bu kayıtları yer açmak için kendiliğinden silmemesini iste
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* desteklenmiyor */
    }
    return d;
  }

  static async ac(parola: string): Promise<Depo> {
    const kasa = await oku<Kasa>('kasa');
    if (!kasa) throw new Error('Kayıt bulunamadı.');
    return Depo.kasadanAc(kasa, parola);
  }

  private static async kasadanAc(kasa: Kasa, parola: string): Promise<Depo> {
    const tuz = unb64(kasa.tuz);
    const anahtar = await parolaAnahtari(parola, tuz, kasa.tur);
    let veri: PanelVerisi;
    try {
      veri = await jsonCoz<PanelVerisi>(anahtar, kasa.veri, 'panel');
    } catch {
      throw new ParolaHatasi('Parola hatalı.');
    }
    return new Depo({ ...bosVeri(), ...veri }, anahtar, tuz, kasa.tur);
  }

  /** Değişiklikleri kısa bir gecikmeyle kaydeder (art arda değişikliklerde tek kayıt) */
  kaydet(): Promise<void> {
    clearTimeout(this.zamanlayici);
    return new Promise((resolve, reject) => {
      this.zamanlayici = window.setTimeout(() => this.simdiKaydet().then(resolve, reject), 250);
    });
  }

  simdiKaydet(): Promise<void> {
    clearTimeout(this.zamanlayici);
    this.bekleyen = this.bekleyen.then(async () => {
      const kasa: Kasa = {
        v: 1,
        tuz: b64(this.tuz),
        tur: this.tur,
        veri: await jsonSifrele(this.anahtar, this.veri, 'panel'),
        kaydedildi: Date.now(),
      };
      await yaz('kasa', kasa);
    });
    return this.bekleyen;
  }

  async parolaDegistir(yeni: string): Promise<void> {
    this.tuz = rastgele(16);
    this.tur = PAROLA_TURU;
    this.anahtar = await parolaAnahtari(yeni, this.tuz, this.tur);
    await this.simdiKaydet();
  }

  /** Yedek dosyası: panel parolasıyla şifreli; açmak için aynı parola gerekir */
  async yedek(): Promise<Blob> {
    this.veri.sonYedek = Date.now();
    await this.simdiKaydet();
    const kasa = await oku<Kasa>('kasa');
    const icerik = { tur: 'diyetisyen-paneli-yedek', v: 1, tarih: Date.now(), kasa };
    return new Blob([JSON.stringify(icerik)], { type: 'application/json' });
  }

  static async yedektenYukle(dosya: Blob, parola: string): Promise<Depo> {
    let icerik: { tur?: string; kasa?: Kasa };
    try {
      icerik = JSON.parse(await dosya.text());
    } catch {
      throw new Error('Bu dosya bir panel yedeği değil.');
    }
    if (icerik.tur !== 'diyetisyen-paneli-yedek' || !icerik.kasa) throw new Error('Bu dosya bir panel yedeği değil.');
    const d = await Depo.kasadanAc(icerik.kasa, parola);
    await d.simdiKaydet();
    return d;
  }
}
