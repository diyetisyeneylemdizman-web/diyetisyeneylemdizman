// Diyetisyen paneli — tek sayfa uygulama.
//
// Tüm danışan kayıtları YALNIZCA bu bilgisayarda, tarayıcının içinde ve panel parolasıyla şifreli olarak durur.
// ŞU ANKİ DÜZEN (src/data/portal.ts → takibimKipi = 'qr'): Panel hiçbir şekilde sunucuya bağlanmaz; randevu talepleri
// WhatsApp'tan gelir ve "WhatsApp Talebi Ekle" ile mesaj yapıştırılarak eklenir. Takibim: ölçümden sonra panel bir QR
// kodu gösterir; danışanın özeti QR'ın içindedir ve doğrudan telefonuna geçer (qrtakip.ts). Belgeler ve mesajlar gizlidir.
// takibimKipi = 'sunucu' olursa sunucu yalnızca şu işler için kullanılır (hepsi uçtan uca şifreli; sunucu içeriği okuyamaz):
//   - Siteden gelen randevu talepleri (diyetisyenin açık anahtarıyla mühürlü gelir, burada açılır, sunucudan silinir)
//   - Takibim: danışana özel anahtarla şifrelenmiş özet ve belgeler (danışanın telefonu okur)
//   - Bildirimler (içeriksiz "yeni talep var" sinyali)

import qrcode from 'qrcode-generator';
import { fullAddress, site } from '../../data/site';
import { hedefSecenekleri, randevuDurumlari, sinirlar, sunucuAcik, takibimGorunur, takibimKipi, takibimRizaSurumu, type RandevuDurumu } from '../../data/portal';
import { Depo, ParolaHatasi, type Danisan, type PaketTanimi, type Randevu } from './depo';
import { gelisimGorunumu, olcumSirala, olcumTablosu } from './gelisim';
import {
  $,
  alan,
  api,
  ApiError,
  boyut,
  bugun,
  formNesnesi,
  gunAdi,
  gunFarki,
  h,
  indir,
  mesgul,
  pencere,
  sayi,
  tarih,
  tarihSaat,
  telefonGoster,
  telNormal,
  toast,
  turAdi,
  Uyari,
  whatsapp,
} from './lib';
import { adSadele, type TanitaSonuc } from './tanita';
import { altiHane, b64url, ecdhAnahtarCifti, kimlik, muhurAc, rastgele, type Zarf } from './sifre';
import {
  belgeIndir,
  belgeSil,
  belgeYukle,
  durumlariGuncelle,
  linkAdresi,
  panelBasligi,
  qrAdresi,
  takipAnahtari,
  takipBaslat,
  takipGonder,
  takipVerisi,
} from './takip';
import { guncellemeParcasi, qrBaglantiParcasi, qrPaketle, yeniGuncellemeAnahtari } from './qrtakip';
import type { Olcum, TakipBelge } from './tipler';

const kok = $('[data-uygulama]');
let depo: Depo | null = null;
const V = () => depo!.veri;
/** Sunucusuz Takibim: ölçümler QR kodunun içinde danışanın telefonuna geçer */
const qrKipi = takibimKipi === 'qr';

// ================================================================ Şablonlar

const SABLONLAR: Record<string, { ad: string; metin: string }> = {
  onayYuzyuze: {
    ad: 'Randevu onayı (yüz yüze)',
    metin:
      'Merhaba {ad}, {gun} {tarih} saat {saat} için yüz yüze randevunuz onaylanmıştır.\n\nAdres: {adres}\nKonum: {konum}\n\nGörüşmek üzere,\nDyt. Eylem Dizman',
  },
  onayOnline: {
    ad: 'Randevu onayı (online)',
    metin: 'Merhaba {ad}, {gun} {tarih} saat {saat} için online randevunuz onaylanmıştır. Randevu saatinde sizi arayacağım.\n\nDyt. Eylem Dizman',
  },
  uygunDegil: {
    ad: 'Talep edilen saat uygun değil',
    metin:
      'Merhaba {ad}, randevu talebiniz için teşekkür ederim. Talep ettiğiniz gün ve saat dolu olduğu için randevunuzu oluşturamadım. Size uygun başka bir gün ve saati yazabilir misiniz?\n\nDyt. Eylem Dizman',
  },
  hatirlatma: {
    ad: 'Randevu hatırlatma',
    metin:
      'Merhaba {ad}, {gun} {tarih} saat {saat} randevunuzu hatırlatmak isterim. Katılamayacaksanız lütfen önceden haber verin.\n\nDyt. Eylem Dizman',
  },
  paketBitiyor: {
    ad: 'Paket bitiyor',
    metin: 'Merhaba {ad}, {paket} paketiniz {bitis} tarihinde sona eriyor. Devam etmek isterseniz bana yazabilirsiniz.\n\nDyt. Eylem Dizman',
  },
  odeme: {
    ad: 'Ödeme bilgisi',
    metin:
      'Merhaba {ad}, {paket} için ödeme bilgileri:\n\nIBAN: TR00 0000 0000 0000 0000 0000 00\nAlıcı: Eylem Dizman\nAçıklama: {adSoyad}\n\nDyt. Eylem Dizman',
  },
  takibim: {
    ad: 'Takibim bağlantısı',
    metin:
      'Merhaba {ad}, Takibim sayfanızın bağlantısı:\n{baglanti}\n\nBağlantıyı açınca istenecek 6 haneli kodu size telefonda ileteceğim. Bağlantıyı kimseyle paylaşmayın.\n\nDyt. Eylem Dizman',
  },
  takibimGuncelleme: {
    ad: 'Takibim güncellemesi',
    metin:
      'Merhaba {ad}, yeni ölçüm sonuçlarınız hazır. Takibim sayfanızı güncellemek için bağlantıya dokunun:\n{baglanti}\n\nBağlantı yalnızca Takibim\'i açtığınız telefonda çalışır.\n\nDyt. Eylem Dizman',
  },
  sonrakiRandevu: {
    ad: 'Sonraki randevu + Takibim güncellemesi',
    metin:
      'Merhaba {ad}, bir sonraki randevunuz {gun} {tarih} saat {saat} ({tur}) olarak planlanmıştır.\n\nGüncel ölçümleriniz ve randevunuz Takibim sayfanıza eklendi; görmek için bağlantıya dokunun:\n{baglanti}\n\nDyt. Eylem Dizman',
  },
  yeniSonuc: {
    ad: 'Yeni ölçüm bildirimi',
    metin: 'Merhaba {ad}, yeni ölçüm sonuçlarınız Takibim sayfanıza eklendi: {takibim}\n\nDyt. Eylem Dizman',
  },
  genel: { ad: 'Genel mesaj', metin: 'Merhaba {ad}, ' },
};

const sablon = (ad: keyof typeof SABLONLAR | string, d: Record<string, string | undefined>) =>
  (V().sablonlar[ad] ?? SABLONLAR[ad]?.metin ?? '').replace(/\{(\w+)\}/g, (m, k) => d[k] ?? m);

const ilkAd = (ad: string) => ad.trim().split(/\s+/)[0];

function randevuDegiskenleri(r: { ad: string; tarih: string; saat: string }) {
  return {
    ad: ilkAd(r.ad),
    adSoyad: r.ad,
    tarih: r.tarih ? tarih(r.tarih) : '',
    gun: r.tarih ? gunAdi(r.tarih) : '',
    saat: r.saat,
    adres: fullAddress,
    konum: site.mapsUrl,
  };
}

const waDugme = (telefon: string, metin: string, etiket = 'WhatsApp') =>
  telefon ? h('a', { class: 'btn btn-wa btn-xs', href: whatsapp(telefon, metin), target: '_blank', rel: 'noopener' }, etiket) : null;

// ================================================================ Küçük yardımcılar

const kart = (baslik: string | null, ...icerik: (Node | null | false | undefined)[]) =>
  h('section', { class: 'kart' }, baslik ? h('h2', null, baslik) : null, ...icerik);

const bolumBasligi = (baslik: string, alt?: string | Node | null, ...eylemler: (Node | null)[]) =>
  h(
    'div',
    { class: 'bolum-baslik' },
    h('div', null, h('h1', null, baslik), alt ? h('p', null, alt) : null),
    eylemler.some(Boolean) ? h('div', { class: 'eylemler' }, ...eylemler) : null,
  );

const dugme = (metin: string, onclick: (e: Event) => unknown, sinif = 'btn btn-outline btn-sm', ek: Record<string, unknown> = {}) =>
  h('button', { type: 'button', class: sinif, onclick, ...ek }, metin);

const etiket = (metin: string, sinif: string) => h('span', { class: `durum ${sinif}` }, metin);
const bos = (metin: string) => h('p', { class: 'bos' }, metin);
const danisanBul = (id?: string) => (id ? V().danisanlar.find((d) => d.id === id) : undefined);
const telefonlaBul = (tel: string) => V().danisanlar.find((d) => telNormal(d.telefon) === telNormal(tel));

const input = (ad: string, deger: unknown = '', ek: Record<string, unknown> = {}) =>
  h('input', { class: 'input', name: ad, value: deger === undefined || deger === null ? '' : String(deger), ...ek });
const sayiAlani = (ad: string, deger?: number, ek: Record<string, unknown> = {}) =>
  input(ad, deger ?? '', { inputmode: 'decimal', autocomplete: 'off', ...ek });
const metinAlani = (ad: string, deger = '', ek: Record<string, unknown> = {}) =>
  h('textarea', { class: 'textarea', name: ad, rows: 3, ...ek }, deger);
const secim = (ad: string, secenekler: [string, string][], deger = '') =>
  h('select', { class: 'select', name: ad }, secenekler.map(([v, t]) => h('option', { value: v, selected: v === deger ? true : null }, t)));

const ondalik = (v: unknown, etiket_: string, min: number, max: number): number | undefined => {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) throw new Uyari(`${etiket_} ${min}–${max} arasında olmalıdır.`, etiket_);
  return Math.round(n * 10) / 10;
};

const durumAdi = (d: RandevuDurumu) => randevuDurumlari[d];
const randevuSirala = (a: Randevu, b: Randevu) => (a.tarih + a.saat).localeCompare(b.tarih + b.saat);

function takipEtiketi(d: Danisan) {
  const t = d.takip;
  if (!t) return etiket('Takibim yok', 'pasif');
  if (t.durum === 'eslesti') return etiket(t.bekleyenGonderim ? 'Takibim: gönderilemedi' : 'Takibim açık', t.bekleyenGonderim ? 'talep' : 'onaylandi');
  if (t.durum === 'bekliyor') return etiket('QR okutulmadı', 'talep');
  if (t.durum === 'kapatildi') return etiket('Danışan kapattı', 'iptal');
  return etiket('QR süresi doldu', 'pasif');
}

// ---------------------------------------------------------------- İşlem kayıtları ve saklama süreleri (KVKK)

const ISLEM_SURESI = 2 * 365 * 86_400_000;
/** Danışan kaydının, son işlemden sonra en fazla saklanacağı süre (KVKK aydınlatma metniyle aynı: 10 yıl) */
const DANISAN_SAKLAMA = 10 * 365 * 86_400_000;
/** Danışana dönüşmeyen randevu talepleri ve kayıtsız kişilerin randevuları: 1 yıl */
const TALEP_SAKLAMA = 365 * 86_400_000;

/** Panelde yapılan işlemi kayda geçirir (kayıtlar da panel parolasıyla şifreli kasada durur) */
function islemKaydet(ne: string) {
  if (!depo) return;
  const liste = (V().islemler ??= []);
  liste.push({ t: Date.now(), ne });
  const sinir = Date.now() - ISLEM_SURESI;
  if (liste.length > 3000 || liste[0].t < sinir) V().islemler = liste.filter((x) => x.t >= sinir).slice(-3000);
}

/** Saklama süresi dolan randevu taleplerini siler (panel her açıldığında) */
function eskiTalepleriTemizle() {
  const sinir = Date.now() - TALEP_SAKLAMA;
  const once = V().randevular.length;
  V().randevular = V().randevular.filter((r) => {
    const zaman = Math.max(r.olusturma || 0, Date.parse(`${r.tarih || '1970-01-01'}T00:00:00Z`) || 0);
    return !((r.durum === 'talep' || !danisanBul(r.danisanId)) && zaman < sinir);
  });
  const silinen = once - V().randevular.length;
  if (silinen) islemKaydet(`Saklama süresi (1 yıl) dolan ${silinen} randevu talebi / kaydı silindi`);
}

/** Son işlemi 10 yıldan eski danışanlar (silinmesi gerekenler) */
function saklamaSuresiDolanlar(): Danisan[] {
  const sinir = Date.now() - DANISAN_SAKLAMA;
  return V().danisanlar.filter((d) => {
    const sonRandevu = Math.max(0, ...V().randevular.filter((r) => r.danisanId === d.id).map((r) => Date.parse(`${r.tarih}T00:00:00Z`) || 0));
    const sonOlcum = Math.max(0, ...d.olcumler.map((o) => Date.parse(`${o.tarih}T00:00:00Z`) || 0));
    return Math.max(d.guncelleme || 0, d.olusturma || 0, sonRandevu, sonOlcum) < sinir;
  });
}

/** Bir danışanda değişiklik olduğunda: kaydet ve Takibim'i güncelle */
async function degisti(d?: Danisan, sessiz = false) {
  if (d) d.guncelleme = Date.now();
  islemKaydet(d ? `Danışan kaydı güncellendi: ${d.ad}` : 'Kayıt güncellendi');
  await depo!.kaydet();
  if (d?.takip && (d.takip.durum === 'eslesti' || d.takip.durum === 'bekliyor')) {
    const r = await takipGonder(depo!, d);
    if (!sessiz) {
      if (r === 'tamam') toast('Kaydedildi; danışanın Takibim sayfası güncellendi.');
      else if (r === 'hata') toast('Kaydedildi; Takibim şu an güncellenemedi, bağlantı gelince yeniden denenecek.', 'hata');
      else if (r === 'kapatildi') toast('Kaydedildi. Danışan Takibim\'i kapatmış.', 'hata');
    }
  } else if (!sessiz) toast('Kaydedildi.');
}

// ================================================================ Açılış: kurulum / kilit

function ortaKart(...icerik: Node[]) {
  document.body.classList.remove('panel-acik');
  kok.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-kart' }, ...icerik)));
}

function parolaKurallari(p: string) {
  if (p.length < 10) throw new Uyari('Parola en az 10 karakter olmalıdır.', 'Parola');
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p) || !/\d/.test(p)) throw new Uyari('Parolada en az bir harf ve bir rakam olmalıdır.', 'Parola');
}

function kurulumEkrani() {
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    alan('Parola', h('input', { class: 'input', type: 'password', name: 'parola', autocomplete: 'new-password', required: true }), 'En az 10 karakter; harf ve rakam içersin.'),
    alan('Parola (tekrar)', h('input', { class: 'input', type: 'password', name: 'tekrar', autocomplete: 'new-password', required: true })),
    h(
      'div',
      { class: 'bilgi-kutu uyari' },
      h('p', null, h('strong', null, 'Parolayı unutmayın. '), 'Kayıtlar bu parolayla şifrelenir; parola unutulursa kayıtlar açılamaz ve kimse kurtaramaz. Parolayı güvenli bir yere yazın.'),
    ),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Paneli Oluştur'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        const f = formNesnesi(form);
        parolaKurallari(f.parola);
        if (f.parola !== f.tekrar) throw new Uyari('Parolalar aynı değil.', 'Parola (tekrar)');
        depo = await Depo.olustur(f.parola);
        location.hash = '#ozet';
        uygulama();
      } catch (err) {
        hataGoster(form, err);
      }
    });
  });
  ortaKart(
    h('h1', null, 'Diyetisyen Paneli'),
    h(
      'p',
      null,
      'Danışan kayıtlarınız yalnızca bu bilgisayarda, şifreli olarak saklanır. Başlamak için bir panel parolası belirleyin.',
    ),
    form,
    h('hr', { class: 'ayrac' }),
    h('p', { class: 'form-alt' }, 'Başka bilgisayarda kullandığınız paneli buraya taşımak mı istiyorsunuz? ', dugme('Yedekten Yükle', () => yedektenYukle(), 'metin-dugme')),
  );
}

function hataGoster(form: HTMLElement, err: unknown) {
  const kutu = form.querySelector<HTMLElement>('[data-form-hata]');
  const mesaj = err instanceof Uyari || err instanceof ApiError || err instanceof ParolaHatasi ? err.message : 'Beklenmeyen bir hata oluştu.';
  if (!(err instanceof Uyari || err instanceof ApiError || err instanceof ParolaHatasi)) console.error(err);
  if (kutu) {
    kutu.textContent = mesaj;
    kutu.hidden = false;
  } else toast(mesaj, 'hata');
  const alanAdi = err instanceof Uyari ? err.alan : undefined;
  if (alanAdi) form.querySelector<HTMLElement>(`[data-alan="${CSS.escape(alanAdi)}"]`)?.focus();
}

function kilitEkrani(mesaj?: string) {
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: !mesaj, role: 'alert' }, mesaj ?? ''),
    alan('Parola', h('input', { class: 'input', type: 'password', name: 'parola', autocomplete: 'current-password', required: true })),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Paneli Aç'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        depo = await Depo.ac(formNesnesi(form).parola);
        if (!location.hash || location.hash === '#') location.hash = '#ozet';
        uygulama();
      } catch (err) {
        hataGoster(form, err);
        form.querySelector<HTMLInputElement>('input[name=parola]')!.select();
      }
    });
  });
  ortaKart(
    h('h1', null, 'Diyetisyen Paneli'),
    h('p', null, 'Panel kilitli. Devam etmek için panel parolanızı girin.'),
    form,
    h(
      'p',
      { class: 'form-alt' },
      dugme('Yedekten Yükle', () => yedektenYukle(), 'metin-dugme'),
      ' · ',
      dugme('Parolamı Unuttum', () => parolaUnuttum(), 'metin-dugme'),
    ),
  );
  setTimeout(() => form.querySelector<HTMLInputElement>('input')?.focus(), 50);
}

async function parolaUnuttum() {
  await pencere({
    baslik: 'Parolamı Unuttum',
    tehlikeli: true,
    kaydet: 'Tüm Verileri Sil',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h(
        'p',
        null,
        'Kayıtlar panel parolasıyla şifrelendiği için parola olmadan açılamaz. Yedek dosyanız varsa, o yedeği aldığınız sıradaki parolayla "Yedekten Yükle" seçeneğini kullanabilirsiniz.',
      ),
      h('p', null, 'Hiçbir yedek yoksa yapılabilecek tek şey, bu bilgisayardaki panel verilerini tamamen silip yeniden başlamaktır.'),
      alan('Onay için SİL yazın', input('onay', '', { autocomplete: 'off' })),
    ),
    onKaydet: async (form) => {
      if (formNesnesi(form).onay.trim().toLocaleUpperCase('tr') !== 'SİL') throw new Uyari('Onay için SİL yazın.', 'Onay için SİL yazın');
      await yerelVerileriSil();
    },
  });
}

async function yerelVerileriSil() {
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase('diyetisyen-paneli');
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
  depo = null;
  location.hash = '';
  location.reload();
}

async function yedektenYukle() {
  await pencere({
    baslik: 'Yedekten Yükle',
    kaydet: 'Yükle',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, 'Panelden indirdiğiniz yedek dosyasını seçin ve yedeği aldığınız sıradaki panel parolasını girin. Bu bilgisayardaki mevcut panel kayıtlarının yerine geçer.'),
      alan('Yedek dosyası', h('input', { class: 'input', type: 'file', name: 'dosya', accept: '.json,application/json' })),
      alan('Parola', h('input', { class: 'input', type: 'password', name: 'parola', autocomplete: 'current-password' })),
    ),
    onKaydet: async (form) => {
      const dosya = form.querySelector<HTMLInputElement>('input[type=file]')!.files?.[0];
      if (!dosya) throw new Uyari('Yedek dosyasını seçin.', 'Yedek dosyası');
      try {
        depo = await Depo.yedektenYukle(dosya, formNesnesi(form).parola);
      } catch (e) {
        throw new Uyari(e instanceof Error ? e.message : 'Yedek açılamadı.', 'Parola');
      }
      islemKaydet('Panel yedekten yüklendi');
      toast('Yedek yüklendi.');
      location.hash = '#ozet';
      uygulama();
    },
  });
}

// ================================================================ Uygulama iskeleti

const MENU: [string, string][] = [
  ['ozet', 'Özet'],
  ['talepler', 'Randevu Talepleri'],
  ['randevular', 'Randevular'],
  ['danisanlar', 'Danışanlar'],
  ['duyuru', 'Duyuru'],
  ['paketler', 'Paketler'],
  ['ayarlar', 'Ayarlar'],
];

let zamanlayicilar: number[] = [];
let sonHareket = Date.now();
let ilkAcilis = true;

function uygulama() {
  document.body.classList.add('panel-acik');
  islemKaydet('Panel açıldı');
  eskiTalepleriTemizle();
  void depo!.kaydet();
  for (const z of zamanlayicilar) clearInterval(z);
  zamanlayicilar = [
    window.setInterval(() => {
      if (Date.now() - sonHareket > sinirlar.panelKilitDakika * 60_000) kilitle();
    }, 30_000),
  ];
  if (sunucuAcik)
    zamanlayicilar.push(
      window.setInterval(() => void talepleriAl(), 60_000),
      window.setInterval(() => void durumlariGuncelle(depo!).then(() => cizSessiz()).catch(() => undefined), 5 * 60_000),
    );
  ustEylemler();
  ciz();
  if (sunucuAcik) {
    void talepleriAl();
    void durumlariGuncelle(depo!).then(() => cizSessiz()).catch(() => undefined);
  }
  if (ilkAcilis) {
    ilkAcilis = false;
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => (sonHareket = Date.now()), { passive: true });
    addEventListener('hashchange', () => depo && ciz());
  }
}

async function kilitle() {
  if (!depo) return;
  islemKaydet('Panel kilitlendi');
  await depo.simdiKaydet().catch(() => undefined);
  depo = null;
  for (const z of zamanlayicilar) clearInterval(z);
  zamanlayicilar = [];
  document.querySelector('[data-ust-eylemler]')?.replaceChildren();
  document.title = 'Diyetisyen Paneli | Diyetisyen Eylem Dizman';
  kilitEkrani();
}

function ustEylemler() {
  document.querySelector('[data-ust-eylemler]')?.replaceChildren(dugme('Kilitle', () => kilitle(), 'btn btn-outline btn-sm'));
}

const yeniTalepSayisi = () => V().randevular.filter((r) => r.durum === 'talep' && !r.okundu).length;

/** Kullanıcı bir alana yazarken ekranı yeniden çizmemek için */
function cizSessiz() {
  const aktif = document.activeElement;
  if (aktif && kok.contains(aktif) && /INPUT|TEXTAREA|SELECT/.test(aktif.tagName)) return;
  if (document.querySelector('dialog[open]')) return;
  ciz();
}

function ciz() {
  if (!depo) return;
  const [yol] = location.hash.slice(1).split('?');
  const [bolum, id, sekme] = (yol || 'ozet').split('/');
  const n = yeniTalepSayisi();
  document.title = `${n ? `(${n}) ` : ''}Diyetisyen Paneli | Diyetisyen Eylem Dizman`;
  const menu = h(
    'nav',
    { class: 'panel-menu', 'aria-label': 'Panel menüsü' },
    MENU.map(([k, ad]) =>
      h(
        'a',
        { href: `#${k}`, 'aria-current': bolum === k || (bolum === 'danisan' && k === 'danisanlar') ? 'page' : null },
        ad,
        k === 'talepler' && n ? h('span', { class: 'rozet', 'aria-label': `${n} yeni` }, String(n)) : null,
      ),
    ),
  );
  const icerik = h('div', { class: 'panel-icerik' });
  kok.replaceChildren(h('div', { class: 'panel' }, menu, icerik));
  let govde: Node[];
  try {
    switch (bolum) {
      case 'talepler':
        govde = talepler();
        break;
      case 'randevular':
        govde = randevular();
        break;
      case 'danisanlar':
        govde = danisanlar();
        break;
      case 'danisan':
        govde = danisanDosyasi(id, sekme || 'olcumler');
        break;
      case 'duyuru':
        govde = duyuru();
        break;
      case 'paketler':
        govde = paketler();
        break;
      case 'ayarlar':
        govde = ayarlar();
        break;
      default:
        govde = ozet();
    }
  } catch (e) {
    console.error(e);
    govde = [bos('Bu bölüm açılamadı.')];
  }
  icerik.append(...govde);
}

// ================================================================ Randevu talepleri (sunucudan)

interface GelenTalep {
  ad?: unknown;
  telefon?: unknown;
  tur?: unknown;
  konu?: unknown;
  tarih?: unknown;
  saat?: unknown;
  not?: unknown;
  vki?: unknown;
  gonderim?: unknown;
}

const metin = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

let talepAliniyor = false;
async function talepleriAl() {
  if (!sunucuAcik || !depo?.veri.sunucu || talepAliniyor) return;
  talepAliniyor = true;
  let yeni = 0;
  try {
    const { talepler: gelen } = await api<{ talepler: { id: string; tarih: number; zarf: Zarf }[] }>('GET', '/gelen', undefined, panelBasligi(depo));
    for (const g of gelen) {
      if (!depo) return;
      if (V().randevular.some((r) => r.id === g.id)) {
        await api('DELETE', `/gelen/${g.id}`, undefined, panelBasligi(depo)).catch(() => undefined);
        continue;
      }
      let t: GelenTalep;
      try {
        t = await muhurAc<GelenTalep>(V().sunucu!.ozel, g.zarf);
      } catch {
        continue; // başka bir anahtarla mühürlenmiş (ör. panel yeniden bağlandı) — Ayarlar'dan temizlenebilir
      }
      const telefon = telNormal(metin(t.telefon, 20));
      const tarih_ = metin(t.tarih, 10);
      const saat_ = metin(t.saat, 5);
      const r: Randevu = {
        id: g.id,
        ad: metin(t.ad, 80) || 'İsimsiz',
        telefon,
        tarih: /^\d{4}-\d{2}-\d{2}$/.test(tarih_) ? tarih_ : '',
        saat: /^\d{2}:\d{2}$/.test(saat_) ? saat_ : '',
        tur: t.tur === 'online' ? 'online' : 'yuzyuze',
        konu: metin(t.konu, 120),
        not: metin(t.not, 600),
        vki: metin(t.vki, 80),
        durum: 'talep',
        kaynak: 'site',
        olusturma: g.tarih,
      };
      r.danisanId = telefonlaBul(telefon)?.id;
      V().randevular.push(r);
      await depo.simdiKaydet();
      await api('DELETE', `/gelen/${g.id}`, undefined, panelBasligi(depo)).catch(() => undefined);
      yeni++;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Panel başka bir bilgisayardan yeniden bağlanmış
      sunucuUyarisi = 'Panelin sunucu bağlantısı geçersiz. Ayarlar → Sunucu Bağlantısı bölümünden yeniden bağlayın.';
    }
  } finally {
    talepAliniyor = false;
  }
  if (yeni && depo) {
    toast(`${yeni} yeni randevu talebi geldi.`);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted')
      new Notification('Yeni randevu talebi', { body: 'Ayrıntılar diyetisyen panelinde.', icon: '/icon-192.png', tag: 'dp-randevu' });
    cizSessiz();
  }
}
let sunucuUyarisi = '';

// ================================================================ Özet

function ozet(): Node[] {
  const bu = bugun();
  const yarin = new Date(Date.parse(`${bu}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const onayli = V().randevular.filter((r) => r.durum === 'onaylandi').sort(randevuSirala);
  const bugunkuler = onayli.filter((r) => r.tarih === bu);
  const yarinkiler = onayli.filter((r) => r.tarih === yarin);
  const talepSayisi = V().randevular.filter((r) => r.durum === 'talep').length;
  const bitenler = V().danisanlar.filter((d) => d.paket?.bitis && gunFarki(bu, d.paket.bitis) >= 0 && gunFarki(bu, d.paket.bitis) <= 7);
  const gonderilemeyen = V().danisanlar.filter((d) => d.takip?.bekleyenGonderim);
  const takibim = V().danisanlar.filter((d) => d.takip?.durum === 'eslesti').length;
  const haftaSonu = new Date(Date.parse(`${bu}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const haftalik = onayli.filter((r) => r.tarih >= bu && r.tarih <= haftaSonu).length;

  const uyarilar: Node[] = [];
  if (sunucuAcik && !V().sunucu)
    uyarilar.push(
      h(
        'div',
        { class: 'bilgi-kutu uyari' },
        h('p', null, h('strong', null, 'Panel sunucuya bağlı değil. '), 'Sitedeki randevu talepleri panele düşmesi ve Takibim için bir kez bağlanın.'),
        dugme('Şimdi Bağlan', () => sunucuBagla(), 'btn btn-primary btn-sm'),
      ),
    );
  if (sunucuUyarisi) uyarilar.push(h('div', { class: 'bilgi-kutu uyari' }, h('p', null, sunucuUyarisi)));
  const yedekGun = V().sonYedek ? gunFarki(new Date(V().sonYedek! + 3 * 3600_000).toISOString().slice(0, 10), bu) : null;
  if (V().danisanlar.length && (yedekGun === null || yedekGun >= 7))
    uyarilar.push(
      h(
        'div',
        { class: 'bilgi-kutu' },
        h('p', null, h('strong', null, 'Yedek alın. '), yedekGun === null ? 'Henüz hiç yedek alınmadı. ' : `Son yedek ${yedekGun} gün önce alındı. `, 'Kayıtlar yalnızca bu bilgisayarda durduğu için haftada bir yedek alıp USB belleğe veya ikinci bir diske kaydedin.'),
        dugme('Yedek İndir', () => yedekIndir(), 'btn btn-outline btn-sm'),
      ),
    );

  const randevuSatiri = (r: Randevu, yarinMi: boolean) =>
    h(
      'li',
      null,
      h(
        'div',
        { class: 'ana' },
        h('strong', null, `${r.saat} · `, danisanBul(r.danisanId) ? h('a', { href: `#danisan/${r.danisanId}` }, r.ad) : r.ad),
        h('span', null, ` ${turAdi(r.tur)}${r.konu ? ` · ${r.konu}` : ''}`),
      ),
      h(
        'div',
        { class: 'eylemler' },
        yarinMi
          ? waDugme(r.telefon, sablon('hatirlatma', randevuDegiskenleri(r)), 'Hatırlat')
          : dugme('Tamamlandı', () => randevuDurum(r, 'tamamlandi'), 'btn btn-outline btn-xs'),
      ),
    );

  return [
    bolumBasligi('Özet', `Bugün: ${tarih(bu, true)}`, dugme('WhatsApp Talebi Ekle', () => whatsappTalebiEkle(), 'btn btn-primary btn-sm')),
    ...uyarilar,
    h(
      'div',
      { class: 'izgara' },
      h('a', { class: 'kart gosterge tiklanir', href: '#talepler' }, h('span', { class: 'etiket' }, 'Bekleyen Talep'), h('span', { class: 'deger' }, String(talepSayisi))),
      h('div', { class: 'kart gosterge' }, h('span', { class: 'etiket' }, 'Bugünkü Randevu'), h('span', { class: 'deger' }, String(bugunkuler.length))),
      h('a', { class: 'kart gosterge tiklanir', href: '#danisanlar' }, h('span', { class: 'etiket' }, 'Danışan'), h('span', { class: 'deger' }, String(V().danisanlar.length))),
      sunucuAcik
        ? h('div', { class: 'kart gosterge' }, h('span', { class: 'etiket' }, 'Takibim Kullanan'), h('span', { class: 'deger' }, String(takibim)))
        : h('a', { class: 'kart gosterge tiklanir', href: '#randevular' }, h('span', { class: 'etiket' }, '7 Gün İçindeki Randevu'), h('span', { class: 'deger' }, String(haftalik))),
    ),
    kart('Bugün', bugunkuler.length ? h('ul', { class: 'liste' }, bugunkuler.map((r) => randevuSatiri(r, false))) : bos('Bugün onaylı randevu yok.')),
    kart(
      'Yarın',
      h('p', { class: 'hint' }, 'Hatırlat düğmesi, hazır hatırlatma mesajıyla WhatsApp\'ı açar.'),
      yarinkiler.length ? h('ul', { class: 'liste' }, yarinkiler.map((r) => randevuSatiri(r, true))) : bos('Yarın onaylı randevu yok.'),
    ),
    kart(
      'Paketi 7 Gün İçinde Bitenler',
      bitenler.length
        ? h(
            'ul',
            { class: 'liste' },
            bitenler.map((d) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('strong', null, h('a', { href: `#danisan/${d.id}/paket` }, d.ad)), h('span', null, ` ${d.paket!.ad} · bitiş ${tarih(d.paket!.bitis)}`)),
                h('div', { class: 'eylemler' }, waDugme(d.telefon, sablon('paketBitiyor', { ad: ilkAd(d.ad), paket: d.paket!.ad, bitis: tarih(d.paket!.bitis) }), 'Hatırlat')),
              ),
            ),
          )
        : bos('Önümüzdeki 7 günde biten paket yok.'),
    ),
    sunucuAcik && gonderilemeyen.length
      ? kart(
          'Takibim Güncellenemeyenler',
          h('p', null, `${gonderilemeyen.length} danışanın Takibim sayfası güncellenemedi (bağlantı sorunu).`),
          dugme('Tekrar Dene', async (e) => {
            await mesgul(e.currentTarget as HTMLButtonElement, async () => {
              for (const d of gonderilemeyen) await takipGonder(depo!, d);
            });
            ciz();
          }),
        )
      : null,
  ].filter(Boolean) as Node[];
}

// ================================================================ Randevu talepleri

function talepler(): Node[] {
  const liste = V().randevular.filter((r) => r.durum === 'talep').sort((a, b) => b.olusturma - a.olusturma);
  const okunmamis = liste.filter((r) => !r.okundu);
  if (okunmamis.length) {
    for (const r of okunmamis) r.okundu = true;
    void depo!.kaydet();
    setTimeout(() => document.querySelector('.panel-menu .rozet')?.remove(), 1500);
  }
  return [
    bolumBasligi(
      'Randevu Talepleri',
      sunucuAcik
        ? 'Siteden gelen talepler burada görünür. Onayladığınızda danışana WhatsApp\'tan onay mesajı gönderebilirsiniz.'
        : 'Siteden WhatsApp\'a gelen talep mesajını "WhatsApp Talebi Ekle" ile buraya yapıştırın. Onayladığınızda danışana hazır onay mesajı gönderebilirsiniz.',
      dugme('WhatsApp Talebi Ekle', () => whatsappTalebiEkle(), 'btn btn-primary btn-sm'),
      sunucuAcik
        ? dugme('Yenile', async (e) => {
            await mesgul(e.currentTarget as HTMLButtonElement, () => talepleriAl());
            ciz();
          })
        : null,
    ),
    sunucuAcik && !V().sunucu ? h('div', { class: 'bilgi-kutu uyari' }, h('p', null, 'Talepler, panel sunucuya bağlandıktan sonra buraya düşer. '), dugme('Şimdi Bağlan', () => sunucuBagla(), 'btn btn-primary btn-sm')) : null,
    kart(
      null,
      liste.length
        ? h(
            'ul',
            { class: 'liste' },
            liste.map((r) => {
              const d = danisanBul(r.danisanId);
              return h(
                'li',
                { class: okunmamis.includes(r) ? 'yeni' : null },
                h(
                  'div',
                  { class: 'ana' },
                  h('strong', null, d ? h('a', { href: `#danisan/${d.id}` }, r.ad) : r.ad, okunmamis.includes(r) ? etiket('Yeni', 'talep') : null),
                  h('span', null, ` ${telefonGoster(r.telefon)} · ${turAdi(r.tur)}${r.konu ? ` · ${r.konu}` : ''}`),
                  h('p', null, `Tercih: ${r.tarih ? `${tarih(r.tarih, true)}` : 'Tarih fark etmez'}${r.saat ? ` · ${r.saat}` : ''}`),
                  r.vki ? h('p', null, `VKİ: ${r.vki}`) : null,
                  r.not ? h('p', null, `Not: ${r.not}`) : null,
                  h('p', { class: 'ince' }, `${r.kaynak === 'whatsapp' ? 'WhatsApp\'tan eklendi' : 'Talep'}: ${tarihSaat(r.olusturma)}${d ? ' · Kayıtlı danışan' : ''}`),
                ),
                h(
                  'div',
                  { class: 'eylemler' },
                  dugme('Onayla', () => randevuOnayla(r), 'btn btn-primary btn-xs'),
                  dugme('Uygun Değil', () => randevuUygunDegil(r), 'btn btn-outline btn-xs'),
                  waDugme(r.telefon, sablon('genel', { ad: ilkAd(r.ad) })),
                ),
              );
            }),
          )
        : bos(sunucuAcik ? 'Bekleyen randevu talebi yok.' : 'Bekleyen talep yok. WhatsApp\'tan gelen talep mesajını "WhatsApp Talebi Ekle" ile ekleyebilirsiniz.'),
    ),
  ].filter(Boolean) as Node[];
}

// ---------------------------------------------------------------- WhatsApp'tan gelen talebi yapıştırarak ekleme

const AYLAR_KUCUK = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];

/** Sitedeki randevu formunun hazırladığı WhatsApp mesajını okur ("• Ad Soyad: …" satırları) */
export function waMesajiCoz(m: string) {
  const al = (etiket: string) => {
    const r = m.match(new RegExp(`${etiket}\\s*:\\s*(.+)`, 'iu'));
    return r ? r[1].replace(/[*_~]/g, '').trim() : '';
  };
  const turMetni = al('Görüşme türü').toLocaleLowerCase('tr');
  const tarihMetni = al('Tercih ettiğim tarih').toLocaleLowerCase('tr');
  const t = tarihMetni.match(/(\d{1,2})\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(\d{4})/);
  const saat = al('Tercih ettiğim saat').match(/(\d{1,2}):(\d{2})/);
  return {
    ad: al('Ad Soyad'),
    telefon: al('Telefon'),
    tur: turMetni.includes('online') ? 'online' : turMetni ? 'yuzyuze' : '',
    konu: al('Konu'),
    tarih: t ? `${t[3]}-${String(AYLAR_KUCUK.indexOf(t[2]) + 1).padStart(2, '0')}-${t[1].padStart(2, '0')}` : '',
    saat: saat ? `${saat[1].padStart(2, '0')}:${saat[2]}` : '',
    vki: al('VKİ sonucum'),
    not: al('Not'),
  };
}

async function whatsappTalebiEkle() {
  let eklenen: Randevu | null = null;
  const mesaj = h('textarea', {
    class: 'textarea',
    name: 'mesaj',
    rows: 6,
    placeholder: 'WhatsApp\'ta gelen randevu talebi mesajını kopyalayıp buraya yapıştırın. Bilgiler aşağıya kendiliğinden dolar.',
  });
  const icerik = h(
    'div',
    { class: 'form-grid' },
    alan('WhatsApp mesajı', mesaj),
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Ad Soyad', input('ad', '', { autocomplete: 'off', maxlength: 80 })),
      alan('Telefon', input('telefon', '', { type: 'tel', autocomplete: 'off' })),
      alan('Görüşme', secim('tur', [['yuzyuze', 'Yüz yüze'], ['online', 'Online']])),
      alan('Konu', input('konu', '', { maxlength: 120 })),
      alan('Tercih edilen tarih', input('tarih', '', { type: 'date' }), 'Boşsa: tarih fark etmez'),
      alan('Tercih edilen saat', input('saat', '', { type: 'time', step: 300 }), 'Boşsa: saat fark etmez'),
    ),
    alan('VKİ sonucu', input('vki', '', { maxlength: 80 })),
    alan('Not', metinAlani('not', '', { rows: 2, maxlength: 600 })),
    h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'hemenOnayla', checked: true }), h('span', null, 'Ekledikten sonra onay penceresini aç')),
  );
  mesaj.addEventListener('input', () => {
    const c = waMesajiCoz((mesaj as HTMLTextAreaElement).value);
    const yaz = (ad: string, v: string) => {
      const el = icerik.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name=${ad}]`);
      if (el && v) el.value = ad === 'telefon' ? telefonGoster(v) : v;
    };
    for (const [k, v] of Object.entries(c)) yaz(k, v);
  });
  const ok = await pencere({
    baslik: 'WhatsApp Talebi Ekle',
    kaydet: 'Talebi Ekle',
    genis: true,
    icerik,
    onKaydet: async (form) => {
      const f = formNesnesi(form);
      const ad = String(f.ad).replace(/\s+/g, ' ').trim();
      if (ad.length < 2) throw new Uyari('Ad soyad yazın (mesajı yapıştırınca kendiliğinden dolar).', 'Ad Soyad');
      const tel = telNormal(f.telefon);
      if (tel.length < 10 || tel.length > 15) throw new Uyari('Geçerli bir telefon yazın.', 'Telefon');
      const r: Randevu = {
        id: kimlik(),
        ad,
        telefon: tel,
        tarih: /^\d{4}-\d{2}-\d{2}$/.test(f.tarih) ? f.tarih : '',
        saat: /^\d{2}:\d{2}$/.test(f.saat) ? f.saat : '',
        tur: f.tur === 'online' ? 'online' : 'yuzyuze',
        konu: String(f.konu).trim(),
        not: String(f.not).trim(),
        vki: String(f.vki).trim(),
        durum: 'talep',
        kaynak: 'whatsapp',
        olusturma: Date.now(),
        okundu: true,
      };
      r.danisanId = telefonlaBul(tel)?.id;
      V().randevular.push(r);
      islemKaydet(`WhatsApp randevu talebi eklendi: ${ad}`);
      await depo!.simdiKaydet();
      if (f.hemenOnayla) eklenen = r;
    },
  });
  if (!ok) return;
  if (location.hash.split('?')[0] !== '#talepler') location.hash = '#talepler';
  else ciz();
  toast('Talep eklendi.');
  if (eklenen) await randevuOnayla(eklenen);
}

async function randevuOnayla(r: Randevu) {
  const kayitli = danisanBul(r.danisanId);
  const ok = await pencere({
    baslik: 'Randevuyu Onayla',
    kaydet: 'Onayla',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, h('strong', null, r.ad), ` · ${telefonGoster(r.telefon)}`),
      h(
        'div',
        { class: 'form-grid iki' },
        alan('Tarih', input('tarih', r.tarih, { type: 'date', required: true })),
        alan('Saat', input('saat', r.saat, { type: 'time', required: true, step: 300 })),
      ),
      alan('Görüşme', secim('tur', [['yuzyuze', 'Yüz yüze'], ['online', 'Online']], r.tur)),
      kayitli
        ? h('p', { class: 'hint' }, 'Bu telefon numarası kayıtlı bir danışana ait; randevu onun dosyasına eklenecek.')
        : h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'ekle', checked: true }), h('span', null, 'Danışan listesine ekle')),
    ),
    onKaydet: async (form) => {
      const f = formNesnesi(form);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tarih)) throw new Uyari('Tarih seçin.', 'Tarih');
      if (!/^\d{2}:\d{2}$/.test(f.saat)) throw new Uyari('Saat seçin.', 'Saat');
      r.tarih = f.tarih;
      r.saat = f.saat;
      r.tur = f.tur === 'online' ? 'online' : 'yuzyuze';
      r.durum = 'onaylandi';
      if (!kayitli && f.ekle) r.danisanId = yeniDanisanKaydi({ ad: r.ad, telefon: r.telefon }).id;
      await degisti(danisanBul(r.danisanId), true);
    },
  });
  if (!ok) return;
  ciz();
  await onayMesajiPenceresi(r);
}

async function onayMesajiPenceresi(r: Randevu) {
  const mesaj = sablon(r.tur === 'online' ? 'onayOnline' : 'onayYuzyuze', randevuDegiskenleri(r));
  await pencere({
    baslik: 'Randevu Onaylandı',
    kaydet: 'Kapat',
    vazgecYok: true,
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, 'Danışana onay mesajını WhatsApp\'tan göndermek için düğmeye basın. Mesaj hazır olarak açılır; WhatsApp\'ta Gönder\'e basmanız yeterli.'),
      h('pre', { class: 'mesaj-onizleme' }, mesaj),
      h('a', { class: 'btn btn-wa', href: whatsapp(r.telefon, mesaj), target: '_blank', rel: 'noopener' }, 'WhatsApp ile Onay Gönder'),
    ),
  });
}

async function randevuUygunDegil(r: Randevu) {
  const mesaj = sablon('uygunDegil', randevuDegiskenleri(r));
  await pencere({
    baslik: 'Talep Uygun Değil',
    kaydet: 'Talebi Kapat',
    tehlikeli: true,
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, 'İsterseniz danışana başka bir gün önermek için WhatsApp mesajı gönderin, ardından talebi kapatın.'),
      h('pre', { class: 'mesaj-onizleme' }, mesaj),
      h('a', { class: 'btn btn-wa btn-sm', href: whatsapp(r.telefon, mesaj), target: '_blank', rel: 'noopener' }, 'WhatsApp ile Yaz'),
    ),
    onKaydet: async () => {
      r.durum = 'iptal';
      await depo!.kaydet();
    },
  });
  ciz();
}

async function randevuDurum(r: Randevu, durum: RandevuDurumu) {
  r.durum = durum;
  await degisti(danisanBul(r.danisanId), true);
  toast(`Randevu: ${durumAdi(durum)}`);
  ciz();
}

// ================================================================ Randevular

function randevular(): Node[] {
  const [, sorgu] = location.hash.split('?');
  const gecmisMi = new URLSearchParams(sorgu ?? '').get('g') === '1';
  const bu = bugun();
  const tum = V().randevular.filter((r) => r.durum !== 'talep');
  const liste = gecmisMi
    ? tum.filter((r) => r.tarih < bu || r.durum !== 'onaylandi').sort(randevuSirala).reverse().slice(0, 200)
    : tum.filter((r) => r.tarih >= bu && r.durum === 'onaylandi').sort(randevuSirala);
  const gruplar = new Map<string, Randevu[]>();
  for (const r of liste) gruplar.set(r.tarih, [...(gruplar.get(r.tarih) ?? []), r]);
  return [
    bolumBasligi('Randevular', null, dugme('Yeni Randevu', () => randevuDuzenle(), 'btn btn-primary btn-sm')),
    h(
      'div',
      { class: 'sekme-cubugu' },
      h('a', { href: '#randevular', 'aria-current': gecmisMi ? null : 'page' }, 'Yaklaşan'),
      h('a', { href: '#randevular?g=1', 'aria-current': gecmisMi ? 'page' : null }, 'Geçmiş ve İptal'),
    ),
    liste.length
      ? h(
          'div',
          null,
          [...gruplar].map(([t, rs]) =>
            kart(
              t === bu ? `Bugün · ${tarih(t, true)}` : tarih(t, true),
              h('ul', { class: 'liste' }, rs.map((r) => randevuSatiri(r))),
            ),
          ),
        )
      : kart(null, bos(gecmisMi ? 'Geçmiş randevu yok.' : 'Yaklaşan onaylı randevu yok.')),
  ];
}

function randevuSatiri(r: Randevu, danisanDosyasinda = false): HTMLElement {
  const d = danisanBul(r.danisanId);
  return h(
    'li',
    null,
    h(
      'div',
      { class: 'ana' },
      h(
        'strong',
        null,
        danisanDosyasinda ? `${tarih(r.tarih, true)} · ${r.saat}` : `${r.saat} · `,
        danisanDosyasinda ? null : d ? h('a', { href: `#danisan/${d.id}/randevular` }, r.ad) : r.ad,
      ),
      h('span', null, ` ${turAdi(r.tur)}${r.konu ? ` · ${r.konu}` : ''}`),
      r.not ? h('p', null, r.not) : null,
    ),
    h(
      'div',
      { class: 'eylemler' },
      etiket(durumAdi(r.durum), r.durum),
      r.durum === 'onaylandi' ? waDugme(r.telefon, sablon('hatirlatma', randevuDegiskenleri(r)), 'Hatırlat') : null,
      r.durum === 'onaylandi' ? dugme('Tamamlandı', () => randevuDurum(r, 'tamamlandi'), 'btn btn-outline btn-xs') : null,
      dugme('Düzenle', () => randevuDuzenle(r), 'btn btn-outline btn-xs'),
    ),
  );
}

async function randevuDuzenle(r?: Randevu, danisanId?: string) {
  const yeni = !r;
  const kayit: Randevu = r ?? {
    id: kimlik(),
    danisanId,
    ad: danisanBul(danisanId)?.ad ?? '',
    telefon: danisanBul(danisanId)?.telefon ?? '',
    tarih: bugun(),
    saat: '',
    tur: 'yuzyuze',
    durum: 'onaylandi',
    kaynak: 'panel',
    olusturma: Date.now(),
  };
  const kisiler = [...V().danisanlar].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const ok = await pencere({
    baslik: yeni ? 'Yeni Randevu' : 'Randevuyu Düzenle',
    icerik: h(
      'div',
      { class: 'form-grid' },
      alan('Danışan', secim('danisan', [['', 'Listede olmayan kişi'], ...kisiler.map((d) => [d.id, `${d.ad} · ${telefonGoster(d.telefon)}`] as [string, string])], kayit.danisanId ?? '')),
      h('div', { class: 'form-grid iki', 'data-serbest': true }, alan('Ad Soyad', input('ad', kayit.ad)), alan('Telefon', input('telefon', kayit.telefon ? telefonGoster(kayit.telefon) : '', { type: 'tel' }))),
      h(
        'div',
        { class: 'form-grid iki' },
        alan('Tarih', input('tarih', kayit.tarih, { type: 'date' })),
        alan('Saat', input('saat', kayit.saat, { type: 'time', step: 300 })),
        alan('Görüşme', secim('tur', [['yuzyuze', 'Yüz yüze'], ['online', 'Online']], kayit.tur)),
        alan('Durum', secim('durum', (Object.entries(randevuDurumlari) as [string, string][]).filter(([k]) => k !== 'talep' || !yeni), kayit.durum)),
      ),
      alan('Konu', input('konu', kayit.konu ?? '', { maxlength: 120 })),
      alan('Not', metinAlani('not', kayit.not ?? '', { maxlength: 600 })),
      yeni ? null : h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'sil' }), h('span', null, 'Bu randevuyu sil')),
    ),
    onKaydet: async (form) => {
      const f = formNesnesi(form);
      if (f.sil) {
        V().randevular = V().randevular.filter((x) => x !== r);
        await degisti(danisanBul(kayit.danisanId), true);
        return;
      }
      const d = danisanBul(f.danisan);
      if (!d && String(f.ad).trim().length < 2) throw new Uyari('Ad soyad yazın veya listeden danışan seçin.', 'Ad Soyad');
      if (!d && telNormal(f.telefon).length < 10) throw new Uyari('Geçerli bir telefon yazın.', 'Telefon');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tarih)) throw new Uyari('Tarih seçin.', 'Tarih');
      if (!/^\d{2}:\d{2}$/.test(f.saat)) throw new Uyari('Saat seçin.', 'Saat');
      const eskiDanisan = kayit.danisanId;
      Object.assign(kayit, {
        danisanId: d?.id,
        ad: d?.ad ?? String(f.ad).trim(),
        telefon: d ? d.telefon : telNormal(f.telefon),
        tarih: f.tarih,
        saat: f.saat,
        tur: f.tur === 'online' ? 'online' : 'yuzyuze',
        durum: f.durum as RandevuDurumu,
        konu: String(f.konu).trim(),
        not: String(f.not).trim(),
      });
      if (yeni) V().randevular.push(kayit);
      await degisti(d, true);
      if (eskiDanisan && eskiDanisan !== d?.id) await degisti(danisanBul(eskiDanisan), true);
    },
  });
  if (!ok) return;
  ciz();
  if (yeni && kayit.durum === 'onaylandi') await onayMesajiPenceresi(kayit);
}

// ================================================================ Danışanlar

function yeniDanisanKaydi(v: Partial<Danisan> & { ad: string; telefon: string }): Danisan {
  const d: Danisan = {
    id: kimlik(),
    olusturma: Date.now(),
    guncelleme: Date.now(),
    olcumler: [],
    paket: null,
    mesajlar: [],
    belgeler: [],
    notlar: [],
    takip: null,
    ...v,
    telefon: telNormal(v.telefon),
  };
  V().danisanlar.push(d);
  return d;
}

function danisanlar(): Node[] {
  const [, sorgu] = location.hash.split('?');
  const ara = new URLSearchParams(sorgu ?? '').get('ara') ?? '';
  const a = adSadele(ara);
  const liste = [...V().danisanlar]
    .filter((d) => !a || adSadele(d.ad).includes(a) || telNormal(d.telefon).includes(ara.replace(/\D/g, '') || '§'))
    .sort((x, y) => y.guncelleme - x.guncelleme);
  const arama = h('input', { class: 'input arama', type: 'search', placeholder: 'Ad veya telefon ile ara', value: ara, 'aria-label': 'Danışan ara' });
  arama.addEventListener('input', () => {
    const konum = arama.selectionStart;
    history.replaceState(null, '', `#danisanlar${arama.value ? `?ara=${encodeURIComponent(arama.value)}` : ''}`);
    ciz();
    const yeni = document.querySelector<HTMLInputElement>('.arama');
    yeni?.focus();
    if (konum !== null) yeni?.setSelectionRange(konum, konum);
  });
  const birakma = pdfBirakmaAlani('Vücut analizi PDF\'ini buraya bırakın: ad soyada göre danışan bulunur, yoksa yeni danışan olarak eklenir.', (dosya) =>
    pdfIleDanisanBul(dosya),
  );
  return [
    bolumBasligi('Danışanlar', `${V().danisanlar.length} danışan`, dugme('Yeni Danışan', () => danisanDuzenle(), 'btn btn-primary btn-sm')),
    birakma,
    kart(
      null,
      arama,
      liste.length
        ? h(
            'div',
            { class: 'tablo-kap' },
            h(
              'table',
              { class: 'tablo' },
              h('thead', null, h('tr', null, h('th', null, 'Ad Soyad'), h('th', null, 'Telefon'), h('th', null, 'Son Ölçüm'), h('th', null, 'Paket'), sunucuAcik ? h('th', null, 'Takibim') : null)),
              h(
                'tbody',
                null,
                liste.map((d) => {
                  const son = olcumSirala(d.olcumler).at(-1);
                  const tr = h(
                    'tr',
                    { class: 'tiklanir', tabindex: '0' },
                    h('td', null, h('a', { href: `#danisan/${d.id}` }, d.ad)),
                    h('td', null, telefonGoster(d.telefon)),
                    h('td', null, son ? `${tarih(son.tarih)}${son.kilo ? ` · ${sayi(son.kilo)} kg` : ''}` : '—'),
                    h('td', null, d.paket ? `${d.paket.ad}${d.paket.bitis ? ` · ${tarih(d.paket.bitis)}` : ''}` : '—'),
                    sunucuAcik ? h('td', null, takipEtiketi(d)) : null,
                  );
                  tr.addEventListener('click', (e) => {
                    if (!(e.target as HTMLElement).closest('a')) location.hash = `#danisan/${d.id}`;
                  });
                  tr.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') location.hash = `#danisan/${d.id}`;
                  });
                  return tr;
                }),
              ),
            ),
          )
        : bos(ara ? 'Aramaya uyan danışan yok.' : 'Henüz danışan yok. "Yeni Danışan" ile ekleyin veya PDF\'i yukarıdaki alana bırakın.'),
    ),
  ];
}

async function danisanDuzenle(d?: Danisan, onDolgu?: Partial<Danisan>): Promise<Danisan | null> {
  const k = { ...onDolgu, ...d } as Partial<Danisan>;
  let sonuc: Danisan | null = null;
  const yil = new Date().getFullYear();
  const ok = await pencere({
    baslik: d ? 'Danışan Bilgileri' : 'Yeni Danışan',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h(
        'div',
        { class: 'form-grid iki' },
        alan('Ad Soyad', input('ad', k.ad ?? '', { autocomplete: 'off', maxlength: 80 })),
        alan('Telefon', input('telefon', k.telefon ? telefonGoster(k.telefon) : '', { type: 'tel', autocomplete: 'off' })),
        alan('E-posta', input('eposta', k.eposta ?? '', { type: 'email', autocomplete: 'off' }), 'İsteğe bağlı'),
        alan('Cinsiyet', secim('cinsiyet', [['', 'Seçilmedi'], ['K', 'Kadın'], ['E', 'Erkek']], k.cinsiyet ?? '')),
        alan('Doğum Yılı', input('dogumYili', k.dogumYili ?? '', { inputmode: 'numeric', maxlength: 4 })),
        alan('Boy (cm)', sayiAlani('boy', k.boy)),
        alan('Hedef Kilo (kg)', sayiAlani('hedefKilo', k.hedefKilo)),
        alan('Hedef', secim('hedef', [['', 'Seçilmedi'], ...hedefSecenekleri.map((x) => [x, x] as [string, string])], k.hedef ?? '')),
      ),
      alan('Alerji ve İntoleranslar', metinAlani('alerjiler', k.alerjiler ?? '', { rows: 2, maxlength: 500 })),
      alan('Hastalıklar', metinAlani('hastaliklar', k.hastaliklar ?? '', { rows: 2, maxlength: 800 })),
      alan('İlaç ve Takviyeler', metinAlani('ilaclar', k.ilaclar ?? '', { rows: 2, maxlength: 800 })),
      h('p', { class: 'hint' }, 'Alerji, hastalık ve ilaç bilgileri yalnızca bu panelde durur; danışanın Takibim sayfasına gönderilmez.'),
    ),
    onKaydet: async (form) => {
      const f = formNesnesi(form);
      const ad = String(f.ad).replace(/\s+/g, ' ').trim();
      if (ad.length < 2) throw new Uyari('Ad soyad yazın.', 'Ad Soyad');
      const tel = telNormal(f.telefon);
      if (tel.length < 10 || tel.length > 15) throw new Uyari('Geçerli bir telefon yazın (örn. 0532 123 45 67).', 'Telefon');
      const ayni = V().danisanlar.find((x) => x !== d && telNormal(x.telefon) === tel);
      if (ayni) throw new Uyari(`Bu telefon "${ayni.ad}" adlı danışanda kayıtlı.`, 'Telefon');
      const dy = String(f.dogumYili).trim() ? Number(f.dogumYili) : undefined;
      if (dy !== undefined && (!Number.isInteger(dy) || dy < yil - 110 || dy > yil)) throw new Uyari('Doğum yılını kontrol edin.', 'Doğum Yılı');
      const v: Partial<Danisan> = {
        ad,
        telefon: tel,
        eposta: String(f.eposta).trim() || undefined,
        cinsiyet: f.cinsiyet === 'K' || f.cinsiyet === 'E' ? f.cinsiyet : undefined,
        dogumYili: dy,
        boy: ondalik(f.boy, 'Boy (cm)', 50, 250),
        hedefKilo: ondalik(f.hedefKilo, 'Hedef Kilo (kg)', 20, 300),
        hedef: f.hedef || undefined,
        alerjiler: String(f.alerjiler).trim() || undefined,
        hastaliklar: String(f.hastaliklar).trim() || undefined,
        ilaclar: String(f.ilaclar).trim() || undefined,
      };
      if (d) {
        Object.assign(d, v);
        sonuc = d;
      } else sonuc = yeniDanisanKaydi({ ...onDolgu, ...v, ad, telefon: tel });
      await degisti(sonuc, true);
    },
  });
  if (!ok) return null;
  if (!d && sonuc && !onDolgu) location.hash = `#danisan/${(sonuc as Danisan).id}`;
  else ciz();
  return sonuc;
}

// ================================================================ PDF sürükle-bırak

function pdfBirakmaAlani(aciklama: string, isle: (dosya: File) => Promise<void>): HTMLElement {
  const sec = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  const alan_ = h(
    'div',
    { class: 'birakma', tabindex: '0', role: 'button', 'aria-label': 'Vücut analizi PDF\'i seçin veya sürükleyin' },
    h('strong', null, 'Vücut analizi PDF\'ini buraya sürükleyin'),
    h('span', null, aciklama),
    h('span', { class: 'btn btn-outline btn-sm' }, 'PDF Seç'),
    sec,
  );
  const calistir = async (dosya?: File | null) => {
    if (!dosya) return;
    if (dosya.type && dosya.type !== 'application/pdf' && !/\.pdf$/i.test(dosya.name)) return toast('Yalnızca PDF dosyası bırakın.', 'hata');
    alan_.classList.add('isleniyor');
    try {
      await isle(dosya);
    } finally {
      alan_.classList.remove('isleniyor');
    }
  };
  alan_.addEventListener('click', () => sec.click());
  alan_.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sec.click();
    }
  });
  sec.addEventListener('change', () => calistir(sec.files?.[0]).finally(() => (sec.value = '')));
  alan_.addEventListener('dragover', (e) => {
    e.preventDefault();
    alan_.classList.add('uzerinde');
  });
  alan_.addEventListener('dragleave', () => alan_.classList.remove('uzerinde'));
  alan_.addEventListener('drop', (e) => {
    e.preventDefault();
    alan_.classList.remove('uzerinde');
    void calistir(e.dataTransfer?.files?.[0]);
  });
  return alan_;
}

// Sayfanın herhangi bir yerine bırakılan PDF de yakalanır (bırakma alanı dışında)
addEventListener('dragover', (e) => {
  if (depo && e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
addEventListener('drop', (e) => {
  if (!depo || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  if ((e.target as HTMLElement).closest('.birakma')) return;
  const dosya = e.dataTransfer.files[0];
  const [bolum, id] = location.hash.slice(1).split('?')[0].split('/');
  const d = bolum === 'danisan' ? danisanBul(id) : undefined;
  if (d) void pdfIleOlcum(d, dosya);
  else void pdfIleDanisanBul(dosya);
});

async function pdfOku(dosya: File): Promise<TanitaSonuc | null> {
  try {
    const { raporOku } = await import('./pdfoku');
    const r = await raporOku(dosya);
    if (!r) toast('Bu PDF bir vücut analizi raporu olarak tanınamadı. Değerleri "Elle Ölçüm Ekle" ile girebilirsiniz.', 'hata');
    return r;
  } catch (e) {
    console.error(e);
    toast('PDF okunamadı. Dosya bozuk veya şifreli olabilir.', 'hata');
    return null;
  }
}

async function pdfIleDanisanBul(dosya: File) {
  const r = await pdfOku(dosya);
  if (!r) return;
  const ad = r.kisi.ad ? adSadele(r.kisi.ad) : '';
  const adaylar = ad ? V().danisanlar.filter((d) => adSadele(d.ad) === ad) : [];
  if (adaylar.length === 1) {
    location.hash = `#danisan/${adaylar[0].id}/olcumler`;
    await olcumOnizleme(adaylar[0], r, dosya);
    return;
  }
  const yil = new Date().getFullYear();
  const yeni = await danisanDuzenle(undefined, {
    ad: r.kisi.ad ?? '',
    cinsiyet: r.kisi.cinsiyet,
    boy: r.kisi.boy,
    dogumYili: r.kisi.yas ? yil - r.kisi.yas : undefined,
  });
  if (yeni) {
    location.hash = `#danisan/${yeni.id}/olcumler`;
    await olcumOnizleme(yeni, r, dosya);
  }
}

async function pdfIleOlcum(d: Danisan, dosya: File) {
  const r = await pdfOku(dosya);
  if (r) await olcumOnizleme(d, r, dosya);
}

const olcumAnahtari = (o: { tarih: string; saat?: string }) => `${o.tarih} ${o.saat ?? ''}`;

async function olcumOnizleme(d: Danisan, r: TanitaSonuc, dosya: File) {
  const o = r.olcum;
  const pdfAdi = r.kisi.ad ?? '';
  const adUyusmuyor = pdfAdi && adSadele(pdfAdi) !== adSadele(d.ad);
  const mevcut = new Set(d.olcumler.map(olcumAnahtari));
  const ayniOlcum = mevcut.has(olcumAnahtari(o));
  const yeniGecmis = r.gecmis.filter((g) => !mevcut.has(olcumAnahtari(g)) && olcumAnahtari(g) !== olcumAnahtari(o));
  const takipAcik = d.takip && (d.takip.durum === 'eslesti' || d.takip.durum === 'bekliyor');
  const deger = (et: string, v: number | undefined, birim: string, b = 1) =>
    v === undefined ? null : h('div', { class: 'deger-kutu' }, h('span', null, et), h('strong', null, `${sayi(v, b)}${birim ? ` ${birim}` : ''}`));
  const icerik = h(
    'div',
    { class: 'form-grid' },
    h('p', null, `${r.cihaz} · ${tarih(o.tarih, true)}${o.saat ? ` ${o.saat}` : ''}${pdfAdi ? ` · PDF'teki ad: ${pdfAdi}` : ''}`),
    adUyusmuyor
      ? h(
          'div',
          { class: 'bilgi-kutu uyari' },
          h('p', null, h('strong', null, 'Dikkat: '), `PDF "${pdfAdi}" adına, bu dosya ise "${d.ad}" adına. Yanlış danışana eklenen sonuçlar o kişinin telefonunda görünür.`),
          h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'adOnay' }), h('span', null, 'Bu PDF bu danışana ait, eminim.')),
        )
      : null,
    ayniOlcum ? h('div', { class: 'bilgi-kutu' }, h('p', null, 'Bu tarih ve saatteki ölçüm zaten ekli. Kaydederseniz yenisiyle değiştirilir.')) : null,
    h(
      'div',
      { class: 'deger-izgara' },
      deger('Kilo', o.kilo, 'kg'),
      deger('Yağ Oranı', o.yagOrani, '%'),
      deger('Yağ Kütlesi', o.yagKg, 'kg'),
      deger('Kas Kütlesi', o.kasKg, 'kg'),
      deger('Yağsız Kütle', o.yagsizKg, 'kg'),
      deger('Vücut Suyu', o.suOrani, '%'),
      deger('İç Yağlanma', o.icYag, '', 0),
      deger('Bazal Metabolizma', o.bmh, 'kcal', 0),
      deger('Metabolik Yaş', o.metabolikYas, '', 0),
      deger('Bel', o.bel, 'cm', 0),
      deger('BKİ', o.bmi, ''),
    ),
    o.segment ? h('p', { class: 'hint' }, 'Kol, bacak ve gövde (segmental) değerleri de okundu; vücut haritasında görünecek.') : null,
    yeniGecmis.length
      ? h(
          'label',
          { class: 'onay-satiri' },
          h('input', { type: 'checkbox', name: 'gecmis', checked: d.olcumler.length === 0 }),
          h('span', null, `Cihazdaki önceki ${yeniGecmis.length} ölçüm de eklensin (${tarih(yeniGecmis[0].tarih)} – ${tarih(yeniGecmis.at(-1)!.tarih)}; kilo, yağ, yağsız kütle, su)`),
        )
      : null,
    takipAcik
      ? h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'pdfGonder', checked: true }), h('span', null, 'PDF raporunu danışanın Takibim sayfasına da ekle (çıktı almanıza gerek kalmaz)'))
      : sunucuAcik
        ? h('p', { class: 'hint' }, 'Bu danışanın Takibim\'i açık değil. Sonuçları telefonunda görmesi için "Takibim" sekmesinden QR oluşturun.')
        : qrKipi
          ? d.qrPaylasim
            ? h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'qrGoster', checked: true }), h('span', null, 'Kaydettikten sonra Takibim güncellemesini WhatsApp\'tan gönder (danışan bağlantıya dokununca telefonundaki Takibim güncellenir)'))
            : h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'qrGoster', checked: true }), h('span', null, 'Kaydettikten sonra Takibim QR kodunu göster (danışan bir kez okutur, sonuçlarını telefonunda görür)'))
          : null,
  );
  let qrAc = false;
  const kaydedildi = await pencere({
    baslik: 'Vücut Analizi Sonucu',
    kaydet: 'Kaydet',
    genis: true,
    icerik,
    onKaydet: async (form) => {
      const f = formNesnesi(form);
      if (adUyusmuyor && !f.adOnay) throw new Uyari('Ad uyuşmuyor. Emin değilseniz Vazgeç\'e basın.', 'adOnay');
      const yeni: Olcum = { ...o, id: kimlik(), kaynak: 'pdf' };
      d.olcumler = d.olcumler.filter((x) => olcumAnahtari(x) !== olcumAnahtari(o));
      if (f.gecmis) for (const g of yeniGecmis) d.olcumler.push({ ...g, id: kimlik(), kaynak: 'gecmis' });
      // Profil boşsa PDF'ten doldur
      if (!d.cinsiyet && r.kisi.cinsiyet) d.cinsiyet = r.kisi.cinsiyet;
      if (!d.boy && r.kisi.boy) d.boy = r.kisi.boy;
      if (!d.dogumYili && r.kisi.yas) d.dogumYili = Number(o.tarih.slice(0, 4)) - r.kisi.yas;
      if (takipAcik && f.pdfGonder) {
        if (dosya.size > sinirlar.belgeBayt) throw new Uyari('PDF 10 MB\'tan büyük; Takibim\'e eklenemiyor.');
        const belge: TakipBelge = { id: kimlik(), baslik: `Vücut Analizi ${tarih(o.tarih)}`, ad: dosya.name || 'vucut-analizi.pdf', tur: 'application/pdf', boyut: dosya.size, tarih: Date.now() };
        await belgeYukle(depo!, d, belge.id, dosya);
        d.belgeler.push(belge);
        yeni.belgeId = belge.id;
      }
      d.olcumler.push(yeni);
      await degisti(d);
      qrAc = qrKipi && Boolean(f.qrGoster);
    },
  });
  ciz();
  if (kaydedildi && qrAc) await (d.qrPaylasim ? takibimGuncellemeGonder(d) : qrTakibimGoster(d));
}

async function elleOlcum(d: Danisan) {
  await pencere({
    baslik: 'Elle Ölçüm Ekle',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h(
        'div',
        { class: 'form-grid iki' },
        alan('Tarih', input('tarih', bugun(), { type: 'date' })),
        alan('Kilo (kg)', sayiAlani('kilo')),
        alan('Yağ Oranı (%)', sayiAlani('yagOrani')),
        alan('Yağ Kütlesi (kg)', sayiAlani('yagKg')),
        alan('Kas Kütlesi (kg)', sayiAlani('kasKg')),
        alan('Bel Çevresi (cm)', sayiAlani('bel')),
        alan('Kalça Çevresi (cm)', sayiAlani('kalca')),
        alan('İç Yağlanma', sayiAlani('icYag')),
      ),
      h('p', { class: 'hint' }, 'Online danışanın evde ölçüp bildirdiği değerleri de buradan girebilirsiniz. Boş bıraktığınız alanlar kaydedilmez.'),
    ),
    onKaydet: async (form) => {
      const f = formNesnesi(form);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tarih) || f.tarih > bugun()) throw new Uyari('Geçerli bir tarih seçin.', 'Tarih');
      const o: Olcum = {
        id: kimlik(),
        tarih: f.tarih,
        kaynak: 'elle',
        kilo: ondalik(f.kilo, 'Kilo (kg)', 20, 350),
        yagOrani: ondalik(f.yagOrani, 'Yağ Oranı (%)', 2, 75),
        yagKg: ondalik(f.yagKg, 'Yağ Kütlesi (kg)', 0.5, 250),
        kasKg: ondalik(f.kasKg, 'Kas Kütlesi (kg)', 5, 150),
        bel: ondalik(f.bel, 'Bel Çevresi (cm)', 40, 250),
        kalca: ondalik(f.kalca, 'Kalça Çevresi (cm)', 40, 250),
        icYag: ondalik(f.icYag, 'İç Yağlanma', 1, 60),
      };
      for (const k of Object.keys(o) as (keyof Olcum)[]) if (o[k] === undefined) delete o[k];
      if (Object.keys(o).length <= 3) throw new Uyari('En az bir ölçüm değeri girin.', 'Kilo (kg)');
      if (o.kilo && o.yagOrani && !o.yagKg) o.yagKg = Math.round(o.kilo * o.yagOrani) / 100;
      d.olcumler.push(o);
      await degisti(d);
    },
  });
  ciz();
}

// ================================================================ Danışan dosyası

const SEKMELER: [string, string][] = [
  ['olcumler', 'Ölçümler'],
  ['takibim', 'Takibim'],
  ['paket', 'Paket'],
  ['randevular', 'Randevular'],
  ['belgeler', 'Belgeler'],
  ['mesajlar', 'Mesajlar'],
  ['bilgiler', 'Bilgiler ve Notlar'],
];

// Sunucu kapalıyken gizlenen sekmeler: belgeler ve mesajlar yalnızca sunuculu Takibim'de gönderilebilir.
// Sunucusuz (QR) Takibim'de "Takibim" sekmesi QR ve bağlantı gösterir; Takibim kapalıysa o da gizlenir.
const GIZLI_SEKMELER = sunucuAcik ? [] : takibimGorunur ? ['belgeler', 'mesajlar'] : ['takibim', 'belgeler', 'mesajlar'];

function danisanDosyasi(id: string, sekme: string): Node[] {
  const d = danisanBul(id);
  if (GIZLI_SEKMELER.includes(sekme)) sekme = 'olcumler';
  if (!d) return [bolumBasligi('Danışan bulunamadı'), h('a', { href: '#danisanlar' }, '← Danışanlar')];
  const ust = h(
    'div',
    { class: 'dosya-ust' },
    h('a', { class: 'geri-baglanti', href: '#danisanlar' }, '← Danışanlar'),
    bolumBasligi(
      d.ad,
      h('span', null, telefonGoster(d.telefon), d.eposta ? ` · ${d.eposta}` : '', d.dogumYili ? ` · ${new Date().getFullYear() - d.dogumYili} yaş` : '', d.boy ? ` · ${sayi(d.boy, 0)} cm` : ''),
      sunucuAcik ? takipEtiketi(d) : null,
      waDugme(d.telefon, sablon('genel', { ad: ilkAd(d.ad) }), 'WhatsApp\'tan Yaz'),
    ),
    d.alerjiler ? h('div', { class: 'bilgi-kutu uyari' }, h('p', null, h('strong', null, 'Alerji / intolerans: '), d.alerjiler)) : null,
    h(
      'nav',
      { class: 'sekme-cubugu', 'aria-label': 'Danışan dosyası' },
      SEKMELER.filter(([k]) => !GIZLI_SEKMELER.includes(k)).map(([k, ad]) =>
        h('a', { href: `#danisan/${d.id}/${k}`, 'aria-current': k === sekme ? 'page' : null }, ad),
      ),
    ),
  );
  const govde: Node[] = (() => {
    switch (sekme) {
      case 'takibim':
        return qrKipi ? qrTakibimSekmesi(d) : takibimSekmesi(d);
      case 'paket':
        return paketSekmesi(d);
      case 'randevular':
        return randevuSekmesi(d);
      case 'belgeler':
        return belgeSekmesi(d);
      case 'mesajlar':
        return mesajSekmesi(d);
      case 'bilgiler':
        return bilgiSekmesi(d);
      default:
        return olcumSekmesi(d);
    }
  })();
  return [ust, ...govde];
}

function olcumSekmesi(d: Danisan): Node[] {
  return [
    h(
      'div',
      { class: 'olcum-ekle' },
      pdfBirakmaAlani(
        sunucuAcik
          ? 'Değerler otomatik doldurulur; kaydettiğinizde danışanın Takibim sayfası da güncellenir.'
          : qrKipi
            ? 'Değerler otomatik doldurulur. PDF yalnızca bu bilgisayarda okunur, hiçbir yere yüklenmez. Kaydedince danışanın Takibim\'ine gönderebilirsiniz.'
            : 'Değerler otomatik doldurulur. PDF yalnızca bu bilgisayarda okunur, hiçbir yere yüklenmez.',
        (dosya) => pdfIleOlcum(d, dosya),
      ),
      qrKipi
        ? h('div', { class: 'olcum-eylemler' }, dugme('Elle Ölçüm Ekle', () => elleOlcum(d), 'btn btn-outline btn-sm'), ...takibimDugmeleri(d))
        : dugme('Elle Ölçüm Ekle', () => elleOlcum(d), 'btn btn-outline btn-sm'),
    ),
    ...(d.olcumler.length ? gelisimGorunumu(d.olcumler, { hedefKilo: d.hedefKilo }) : []),
    kart(
      'Tüm Ölçümler',
      olcumTablosu(d.olcumler, (o) =>
        dugme(
          'Sil',
          async () => {
            const ok = await pencere({
              baslik: 'Ölçümü Sil',
              tehlikeli: true,
              kaydet: 'Sil',
              icerik: h('p', null, `${tarih(o.tarih)} tarihli ölçüm silinsin mi?${sunucuAcik ? ' Danışanın Takibim sayfasından da kalkar.' : ''}`),
            });
            if (!ok) return;
            d.olcumler = d.olcumler.filter((x) => x !== o);
            await degisti(d);
            ciz();
          },
          'btn btn-outline btn-xs',
        ),
      ),
    ),
  ];
}

function qrSvg(metin_: string): SVGElement {
  const qr = qrcode(0, 'M');
  qr.addData(metin_);
  qr.make();
  const svg = new DOMParser().parseFromString(qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true }), 'image/svg+xml').documentElement;
  const el = document.importNode(svg, true) as unknown as SVGElement;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Takibim QR kodu');
  return el;
}

async function qrGoster(d: Danisan) {
  const t = takipAnahtari(d);
  if (!t) return;
  await pencere({
    baslik: `${d.ad} · Takibim QR Kodu`,
    kaydet: 'Kapat',
    vazgecYok: true,
    genis: true,
    icerik: h(
      'div',
      { class: 'qr-alani' },
      h('div', { class: 'qr' }, qrSvg(qrAdresi(t))),
      h(
        'ol',
        { class: 'adim-liste' },
        h('li', null, 'Danışan telefonunun kamerasını QR koda tutsun.'),
        h('li', null, 'Açılan Takibim sayfasında onay kutularını işaretleyip "Takibimi Aç"a bassın.'),
        h('li', null, 'Bundan sonra siteye girip menüdeki "Takibim" ile kendi sonuçlarına ulaşır. Yeni PDF eklediğinizde telefonunda kendiliğinden güncellenir.'),
      ),
      h('p', { class: 'hint' }, `QR kodu yalnızca bir telefonda kullanılabilir ve ${sinirlar.qrGecerlilikGun} gün içinde okutulmazsa geçersiz olur. QR kodunu başkalarının görebileceği yerde açık bırakmayın.`),
    ),
  });
  void durumlariGuncelle(depo!).then(() => cizSessiz()).catch(() => undefined);
}

async function linkGonder(d: Danisan) {
  const t = takipAnahtari(d);
  if (!t) return;
  const kod = altiHane();
  const adres = await linkAdresi(t, kod);
  const mesaj = sablon('takibim', { ad: ilkAd(d.ad), baglanti: adres });
  await pencere({
    baslik: 'Bağlantı Linki Gönder',
    kaydet: 'Kapat',
    vazgecYok: true,
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, 'Bağlantıyı WhatsApp\'tan gönderin. Danışan bağlantıyı açtığında aşağıdaki kodu girmesi gerekir; kodu WhatsApp\'tan değil, telefon görüşmesinde sözlü olarak söyleyin.'),
      h('div', { class: 'kod-kutu', 'aria-label': 'Açılış kodu' }, kod),
      h('a', { class: 'btn btn-wa', href: whatsapp(d.telefon, mesaj), target: '_blank', rel: 'noopener' }, 'WhatsApp ile Bağlantıyı Gönder'),
      dugme('Bağlantıyı Kopyala', async () => {
        try {
          await navigator.clipboard.writeText(adres);
          toast('Bağlantı kopyalandı.');
        } catch {
          toast('Kopyalanamadı.', 'hata');
        }
      }),
      h('p', { class: 'hint' }, 'Bağlantı ve QR aynı kaydı açar; hangisi önce kullanılırsa o telefona tanımlanır.'),
    ),
  });
}

async function takipOlustur(d: Danisan, yenile = false, goster: 'qr' | 'link' = 'qr') {
  if (!V().sunucu) {
    toast('Önce paneli sunucuya bağlayın.', 'hata');
    return sunucuBagla();
  }
  if (yenile) {
    const ok = await pencere({
      baslik: 'Yeni QR Oluştur',
      kaydet: 'Yeni QR Oluştur',
      tehlikeli: true,
      icerik: h('p', null, 'Yeni QR oluşturulunca danışanın şu anki telefonu Takibim\'e erişemez; danışan yeni QR\'ı okutmalıdır. Telefonu değiştiyse veya kaybolduysa kullanın. Gönderilen belgeler yeni kayda taşınır.'),
    });
    if (!ok) return;
  }
  try {
    await takipBaslat(depo!, d);
    ciz();
    if (goster === 'link') await linkGonder(d);
    else await qrGoster(d);
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Takibim oluşturulamadı.', 'hata');
  }
}

function takibimSekmesi(d: Danisan): Node[] {
  const t = d.takip;
  const dugmeler: Node[] = [];
  let durumMetni: Node;
  if (!t || t.durum === 'yok' || t.durum === 'kapatildi') {
    durumMetni = h(
      'div',
      null,
      t?.durum === 'kapatildi'
        ? h('p', null, h('strong', null, 'Danışan Takibim\'i kapattı ve açık rızasını geri çekti. '), 'Sunucudaki şifreli verileri silindi. Danışan yeniden isterse yeni QR oluşturabilirsiniz.')
        : t?.durum === 'yok'
          ? h('p', null, h('strong', null, 'QR kodunun süresi doldu. '), 'Danışan QR kodunu okutmadı; yenisini oluşturun.')
          : h('p', null, 'Takibim, danışanın ölçümlerini, vücut haritasını, paketini, randevularını ve gönderdiğiniz belgeleri kendi telefonunda görmesini sağlar. Yeni PDF eklediğinizde telefonu kendiliğinden güncellenir.'),
    );
    dugmeler.push(dugme('QR Oluştur', () => takipOlustur(d), 'btn btn-primary'), dugme('Bağlantı Linki Gönder', () => takipOlustur(d, false, 'link')));
  } else if (t.durum === 'bekliyor') {
    durumMetni = h(
      'p',
      null,
      h('strong', null, 'QR kodu henüz okutulmadı. '),
      `Oluşturma: ${tarihSaat(t.olusturma)}. QR ${sinirlar.qrGecerlilikGun} gün geçerlidir.`,
    );
    dugmeler.push(
      dugme('QR\'ı Göster', () => qrGoster(d), 'btn btn-primary'),
      dugme('Bağlantı Linki Gönder', () => linkGonder(d)),
      dugme('Durumu Yenile', async (e) => {
        await mesgul(e.currentTarget as HTMLButtonElement, () => durumlariGuncelle(depo!));
        ciz();
      }),
    );
  } else {
    durumMetni = h(
      'dl',
      { class: 'sabit-bilgi' },
      h('dt', null, 'Durum'),
      h('dd', null, 'Telefon eşleşti; danışan Takibim\'i kullanıyor.'),
      h('dt', null, 'Eşleşme'),
      h('dd', null, t.eslesti ? tarihSaat(t.eslesti) : '—'),
      h('dt', null, 'Son bakış'),
      h('dd', null, t.sonBakis ? tarihSaat(t.sonBakis) : '—'),
      h('dt', null, 'Son güncelleme'),
      h('dd', null, t.sonGonderim ? tarihSaat(t.sonGonderim) : '—', t.bekleyenGonderim ? ' (bekleyen güncelleme var)' : ''),
      h('dt', null, 'Açık rıza'),
      h('dd', null, t.riza ? `Verildi (metin sürümü ${t.riza})${t.riza !== takibimRizaSurumu ? ' — eski sürüm; danışan bir sonraki açılışta güncel metni onaylar' : ''}` : '—'),
    );
    dugmeler.push(
      dugme('Şimdi Güncelle', async (e) => {
        const r = await mesgul(e.currentTarget as HTMLButtonElement, () => takipGonder(depo!, d));
        toast(r === 'tamam' ? 'Takibim güncellendi.' : 'Güncellenemedi.', r === 'tamam' ? 'tamam' : 'hata');
        ciz();
      }),
      waDugme(d.telefon, sablon('yeniSonuc', { ad: ilkAd(d.ad), takibim: `${site.url}/takibim/` }), 'Yeni Sonuç Mesajı') as Node,
      dugme('Yeni QR (Telefon Değişti)', () => takipOlustur(d, true)),
    );
  }
  if (t && t.durum !== 'kapatildi')
    dugmeler.push(
      dugme(
        'Takibi Durdur',
        async () => {
          const ok = await pencere({
            baslik: 'Takibi Durdur',
            tehlikeli: true,
            kaydet: 'Durdur',
            icerik: h('p', null, 'Danışanın telefonu Takibim\'e artık erişemez ve sunucudaki şifreli veriler silinir. Bu paneldeki kayıtlar silinmez.'),
          });
          if (!ok) return;
          await api('DELETE', `/kutu/${t.kutu}`, undefined, panelBasligi(depo!)).catch(() => undefined);
          d.takip = null;
          d.belgeler = [];
          await depo!.kaydet();
          ciz();
        },
        'btn btn-tehlike btn-sm',
      ),
    );
  return [
    kart(
      'Takibim',
      durumMetni,
      h('div', { class: 'eylemler genis-eylem' }, ...dugmeler),
      h(
        'p',
        { class: 'hint' },
        'Gizlilik: Takibim verileri bu bilgisayarda danışana özel bir anahtarla şifrelenir; anahtar yalnızca bu panelde ve danışanın telefonunda bulunur. Alerji, hastalık, ilaç bilgileri ve özel notlarınız gönderilmez.',
      ),
    ),
  ];
}

// ---------------------------------------------------------------- Sunucusuz Takibim (QR)
//
// İlk seferde QR (klinikte) veya 6 haneli kodlu bağlantı (online) ile danışanın telefonuna özeti ve danışana özel
// güncelleme anahtarını verir. Sonraki ölçümlerde "Güncellemeyi Gönder" bu anahtarla şifreli bir bağlantıyı WhatsApp'tan
// gönderir; danışan bağlantıya dokununca telefonundaki Takibim güncellenir. QR yeniden okutulmaz.

function takibimQrSvg(adres: string): SVGElement {
  // Adres byte kipinde, "#n=" sonrasındaki rakamlar sayısal kipte kodlanır (QR daha seyrek ve kolay okunur)
  const i = adres.indexOf('#n=') + 3;
  const qr = qrcode(0, 'L');
  qr.addData(adres.slice(0, i), 'Byte');
  qr.addData(adres.slice(i), 'Numeric');
  qr.make();
  const svg = new DOMParser().parseFromString(qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }), 'image/svg+xml').documentElement;
  const el = document.importNode(svg, true) as unknown as SVGElement;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Takibim QR kodu');
  el.setAttribute('shape-rendering', 'crispEdges');
  return el;
}

/** Danışana özel güncelleme anahtarı (yoksa oluşturulur) */
async function takibimAnahtari(d: Danisan): Promise<string> {
  if (!d.takibimAnahtar) {
    d.takibimAnahtar = yeniGuncellemeAnahtari();
    await depo!.simdiKaydet();
  }
  return d.takibimAnahtar;
}

async function qrPaylasildi(d: Danisan, ne = 'Takibim QR kodu gösterildi') {
  d.qrPaylasim = Date.now();
  islemKaydet(`${ne}: ${d.ad}`);
  await depo!.kaydet();
}

/** Ölçümler ve Takibim sekmelerindeki Takibim düğmeleri */
function takibimDugmeleri(d: Danisan): Node[] {
  const sonraki = sonrakiRandevusu(d);
  return [
    dugme('QR Göster', () => qrTakibimGoster(d), 'btn btn-outline btn-sm'),
    dugme('Bir Sonraki Randevuyu Ekle', () => sonrakiRandevuEkle(d), 'btn btn-outline btn-sm'),
    sonraki ? h('p', { class: 'ince sonraki-randevu' }, `Sonraki randevu: ${tarih(sonraki.tarih, true)} · ${sonraki.saat} · ${turAdi(sonraki.tur)}`) : null,
    d.qrPaylasim ? dugme('Güncellemeyi WhatsApp\'tan Gönder', () => takibimGuncellemeGonder(d), 'btn btn-outline btn-sm') : null,
    dugme('Online Danışana Bağlantı Gönder', () => qrBaglantiGonder(d), 'btn btn-outline btn-sm'),
  ].filter(Boolean) as Node[];
}

async function qrTakibimGoster(d: Danisan) {
  const paket = qrPaketle(takipVerisi(d, V().randevular), d.id, await takibimAnahtari(d));
  const adres = `${location.origin}/takibim/#${paket.parca}`;
  const olcumYok = !d.olcumler.some((o) => o.kaynak !== 'ev');
  await pencere({
    baslik: `${d.ad} · Takibim QR Kodu`,
    kaydet: 'Kapat',
    vazgecYok: true,
    genis: true,
    icerik: h(
      'div',
      { class: 'qr-alani' },
      h(
        'div',
        { class: 'qr-yan-yana' },
        h('div', { class: 'qr buyuk' }, takibimQrSvg(adres)),
        h(
          'ol',
          { class: 'adim-liste' },
          h('li', null, 'Danışan telefonunun kamerasını QR koda tutsun ve çıkan bağlantıya dokunsun.'),
          h('li', null, 'İlk seferde "Takibimi Aç"a bassın; ölçümleri, vücut haritası ve gelişim grafikleri telefonunda açılır.'),
          h('li', null, 'QR bir kez okutulur. Sonraki ölçümlerde "Güncellemeyi WhatsApp\'tan Gönder" ile bağlantı gönderin; danışan dokununca Takibim\'i güncellenir.'),
        ),
      ),
      olcumYok ? h('div', { class: 'bilgi-kutu uyari' }, h('p', null, 'Bu danışanın henüz ölçümü yok; QR\'da yalnızca paket ve randevu bilgileri var.')) : null,
      paket.cikarilan
        ? h('p', { class: 'hint' }, `Ölçüm geçmişinin ${tarih(paket.ilkTarih)} sonrası QR'a sığdı (en eski ${paket.cikarilan} ölçüm eklenmedi). İlk güncelleme bağlantısıyla tüm geçmiş telefona geçer.`)
        : null,
      h('p', { class: 'hint' }, 'Bilgiler QR kodunun içindedir ve doğrudan danışanın telefonuna geçer; sunucuya gönderilmez. Alerji, hastalık, ilaç bilgileri ve notlarınız eklenmez. QR\'ı yalnızca danışana gösterin ve okuttuktan sonra kapatın.'),
    ),
  });
  await qrPaylasildi(d);
  cizSessiz();
}

async function qrBaglantiGonder(d: Danisan) {
  const kod = altiHane();
  const adres = `${location.origin}/takibim/#${await qrBaglantiParcasi(takipVerisi(d, V().randevular), d.id, kod, await takibimAnahtari(d))}`;
  const mesaj = sablon('takibim', { ad: ilkAd(d.ad), baglanti: adres });
  await pencere({
    baslik: 'Online Danışana Bağlantı Gönder',
    kaydet: 'Kapat',
    vazgecYok: true,
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, 'İlk kez Takibim açacak online danışan için. Bağlantıyı WhatsApp\'tan gönderin. Bilgiler bu 6 haneli kodla şifrelidir; kodu WhatsApp\'a yazmayın, görüşmede sözlü olarak söyleyin.'),
      h('div', { class: 'kod-kutu', 'aria-label': 'Açılış kodu' }, kod),
      h('a', { class: 'btn btn-wa', href: whatsapp(d.telefon, mesaj), target: '_blank', rel: 'noopener', onclick: () => void qrPaylasildi(d, 'Takibim ilk bağlantısı WhatsApp\'a aktarıldı') }, 'WhatsApp ile Bağlantıyı Gönder'),
      dugme('Bağlantıyı Kopyala', async () => {
        try {
          await navigator.clipboard.writeText(adres);
          await qrPaylasildi(d, 'Takibim ilk bağlantısı kopyalandı');
          toast('Bağlantı kopyalandı.');
        } catch {
          toast('Kopyalanamadı.', 'hata');
        }
      }),
      h('p', { class: 'hint' }, 'Bu bağlantı bir kez açılır; sonraki ölçümlerde "Güncellemeyi WhatsApp\'tan Gönder" kullanın (kod gerekmez).'),
    ),
  });
  cizSessiz();
}

async function takibimGuncellemeGonder(d: Danisan) {
  const adres = `${location.origin}/takibim/#${await guncellemeParcasi(takipVerisi(d, V().randevular), d.id, await takibimAnahtari(d))}`;
  const mesaj = sablon('takibimGuncelleme', { ad: ilkAd(d.ad), baglanti: adres });
  const gonderildi = async () => {
    d.guncellemeGonderim = Date.now();
    islemKaydet(`Takibim güncelleme bağlantısı hazırlandı: ${d.ad}`);
    await depo!.kaydet();
  };
  let randevuEkle = false;
  const sonraki = sonrakiRandevusu(d);
  await pencere({
    baslik: 'Takibim Güncellemesini Gönder',
    kaydet: 'Kapat',
    vazgecYok: true,
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, `${d.ad} için güncel ölçümler hazır. Bağlantıyı WhatsApp'tan gönderin; danışan bağlantıya dokununca telefonundaki Takibim güncellenir. QR'ı yeniden okutmasına gerek yoktur.`),
      h('a', { class: 'btn btn-wa', href: whatsapp(d.telefon, mesaj), target: '_blank', rel: 'noopener', onclick: () => void gonderildi() }, 'WhatsApp ile Güncellemeyi Gönder'),
      dugme('Bağlantıyı Kopyala', async () => {
        try {
          await navigator.clipboard.writeText(adres);
          await gonderildi();
          toast('Bağlantı kopyalandı.');
        } catch {
          toast('Kopyalanamadı.', 'hata');
        }
      }),
      h(
        'p',
        { class: 'hint' },
        'Bağlantı, danışana özel anahtarla şifrelidir ve yalnızca Takibim\'i açtığı telefonda çalışır; başkasının eline geçse de açılmaz. Danışan telefonunu değiştirdiyse veya Takibim\'i silmişse "QR Göster" ile bir kez yeniden okutun.',
      ),
      h(
        'div',
        { class: 'bilgi-kutu' },
        h('p', null, sonraki ? `Planlı sonraki randevu: ${tarih(sonraki.tarih, true)} · ${sonraki.saat}. ` : 'Henüz planlı bir sonraki randevu yok. ', 'Randevuyu şimdi belirleyecekseniz önce ekleyin; randevu ve ölçümler tek mesajla gider.'),
        dugme('Önce Bir Sonraki Randevuyu Ekle', (e) => {
          randevuEkle = true;
          (e.currentTarget as HTMLElement).closest('form')!.requestSubmit();
        }),
      ),
    ),
  });
  cizSessiz();
  if (randevuEkle) await sonrakiRandevuEkle(d);
}

/** Danışanın en yakın onaylı (gelecekteki) randevusu */
function sonrakiRandevusu(d: Danisan): Randevu | undefined {
  const bu = bugun();
  return V()
    .randevular.filter((r) => r.danisanId === d.id && r.durum === 'onaylandi' && r.tarih >= bu)
    .sort((a, b) => (a.tarih + a.saat).localeCompare(b.tarih + b.saat))[0];
}

/** Görüşme sırasında bir sonraki randevuyu ekler; Takibim'i olan danışana randevu + güncel ölçümler tek WhatsApp mesajıyla gider */
async function sonrakiRandevuEkle(d: Danisan) {
  const bu = bugun();
  const oneri = new Date(Date.parse(`${bu}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  const son = [...V().randevular].filter((r) => r.danisanId === d.id && r.durum !== 'talep').sort((a, b) => a.tarih.localeCompare(b.tarih)).at(-1);
  const mevcut = sonrakiRandevusu(d);
  let eklenen: Randevu | null = null;
  const ok = await pencere({
    baslik: 'Bir Sonraki Randevu',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, h('strong', null, d.ad), ` · ${telefonGoster(d.telefon)}`),
      mevcut ? h('div', { class: 'bilgi-kutu' }, h('p', null, `Planlı randevu var: ${tarih(mevcut.tarih, true)} · ${mevcut.saat} (${turAdi(mevcut.tur)}). Yeni randevu ayrıca eklenir; eskisini Randevular sekmesinden düzenleyebilirsiniz.`)) : null,
      h(
        'div',
        { class: 'form-grid iki' },
        alan('Tarih', input('tarih', oneri, { type: 'date', min: bu })),
        alan('Saat', input('saat', son?.saat ?? '', { type: 'time', step: 300 })),
        alan('Görüşme', secim('tur', [['yuzyuze', 'Yüz yüze'], ['online', 'Online']], son?.tur ?? 'yuzyuze')),
        alan('Not', input('not', '', { maxlength: 200, placeholder: 'İsteğe bağlı (ör. kontrol)' })),
      ),
      h('p', { class: 'hint' }, 'Randevu onaylı olarak eklenir ve danışanın Takibim sayfasında "Sonraki Randevum" olarak görünür.'),
    ),
    onKaydet: async (form) => {
      const f = formNesnesi(form);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tarih) || f.tarih < bu) throw new Uyari('Bugün veya sonrası için bir tarih seçin.', 'Tarih');
      if (!/^\d{2}:\d{2}$/.test(f.saat)) throw new Uyari('Saat seçin.', 'Saat');
      const cakisan = V().randevular.find((r) => r.durum === 'onaylandi' && r.tarih === f.tarih && r.saat === f.saat);
      if (cakisan) throw new Uyari(`Bu gün ve saatte ${cakisan.ad} ile randevunuz var. Başka bir saat seçin.`, 'Saat');
      const r: Randevu = {
        id: kimlik(),
        danisanId: d.id,
        ad: d.ad,
        telefon: d.telefon,
        tarih: f.tarih,
        saat: f.saat,
        tur: f.tur === 'online' ? 'online' : 'yuzyuze',
        konu: 'Kontrol',
        not: String(f.not ?? '').trim(),
        durum: 'onaylandi',
        kaynak: 'panel',
        olusturma: Date.now(),
      };
      V().randevular.push(r);
      await degisti(d, true);
      eklenen = r;
    },
  });
  if (!ok || !eklenen) return;
  ciz();
  toast('Randevu eklendi.');
  await sonrakiRandevuPaylas(d, eklenen);
}

/** Randevu eklendikten sonra: Takibim'i olan danışana tek mesaj (randevu + güncelleme), olmayana onay mesajı */
async function sonrakiRandevuPaylas(d: Danisan, r: Randevu) {
  const degiskenler = { ...randevuDegiskenleri(r), tur: r.tur === 'online' ? 'online' : 'yüz yüze' };
  let qr = false;
  const qrDugmesi = dugme('Danışan Yanınızdaysa: QR Göster', (e) => {
    qr = true;
    (e.currentTarget as HTMLElement).closest('form')!.requestSubmit();
  });
  if (qrKipi && d.qrPaylasim) {
    const adres = `${location.origin}/takibim/#${await guncellemeParcasi(takipVerisi(d, V().randevular), d.id, await takibimAnahtari(d))}`;
    const mesaj = sablon('sonrakiRandevu', { ...degiskenler, baglanti: adres });
    await pencere({
      baslik: 'Randevu Eklendi',
      kaydet: 'Kapat',
      vazgecYok: true,
      icerik: h(
        'div',
        { class: 'form-grid' },
        h('p', null, `${tarih(r.tarih, true)} · ${r.saat} · ${turAdi(r.tur)}. Danışanın Takibim\'ine eklemek için randevuyu ve güncel ölçümleri tek mesajla gönderin.`),
        h('a', {
          class: 'btn btn-wa',
          href: whatsapp(d.telefon, mesaj),
          target: '_blank',
          rel: 'noopener',
          onclick: () => {
            d.guncellemeGonderim = Date.now();
            islemKaydet(`Sonraki randevu ve Takibim güncellemesi WhatsApp'a aktarıldı: ${d.ad}`);
            void depo!.kaydet();
          },
        }, 'WhatsApp ile Randevu ve Güncellemeyi Gönder'),
        qrDugmesi,
        h('p', { class: 'hint' }, 'QR okutulursa danışanın Takibim\'i hemen güncellenir; ayrıca mesaj göndermeniz gerekmez.'),
      ),
    });
  } else {
    const mesaj = sablon(r.tur === 'online' ? 'onayOnline' : 'onayYuzyuze', randevuDegiskenleri(r));
    await pencere({
      baslik: 'Randevu Eklendi',
      kaydet: 'Kapat',
      vazgecYok: true,
      icerik: h(
        'div',
        { class: 'form-grid' },
        h('p', null, 'Danışana randevu bilgisini WhatsApp\'tan gönderebilirsiniz.'),
        h('pre', { class: 'mesaj-onizleme' }, mesaj),
        h('a', { class: 'btn btn-wa', href: whatsapp(d.telefon, mesaj), target: '_blank', rel: 'noopener' }, 'WhatsApp ile Randevu Bilgisi Gönder'),
        qrKipi ? qrDugmesi : null,
        qrKipi ? h('p', { class: 'hint' }, 'Danışanın Takibim\'i yoksa QR\'ı okutunca ölçümleri ve bu randevu telefonunda açılır.') : null,
      ),
    });
  }
  if (qr) await qrTakibimGoster(d);
}

function qrTakibimSekmesi(d: Danisan): Node[] {
  const son = d.olcumler.filter((o) => o.kaynak !== 'ev').sort((a, b) => a.tarih.localeCompare(b.tarih)).at(-1);
  return [
    kart(
      'Takibim',
      h(
        'p',
        null,
        'Danışan, ölçümlerini, vücut haritasını, gelişim grafiklerini, paketini ve randevularını kendi telefonunda görür. Bilgiler internete veya sunucuya gönderilmez.',
      ),
      h(
        'ol',
        { class: 'adim-liste' },
        h('li', null, 'İlk sefer: klinikte "QR Göster" (danışan okutur) ya da online danışana "Online Danışana Bağlantı Gönder" (6 haneli kod sözlü söylenir).'),
        h('li', null, 'Sonraki ölçümler: "Güncellemeyi WhatsApp\'tan Gönder". Danışan bağlantıya dokunur, Takibim\'i güncellenir; QR yeniden okutulmaz.'),
        h('li', null, 'Danışan her zaman sitedeki menüden "Takibim"e girerek kendi bilgilerini görür.'),
      ),
      h(
        'dl',
        { class: 'sabit-bilgi' },
        h('dt', null, 'Son ölçüm'),
        h('dd', null, son ? tarih(son.tarih) : 'Henüz yok'),
        h('dt', null, 'İlk paylaşım (QR / bağlantı)'),
        h('dd', null, d.qrPaylasim ? tarihSaat(d.qrPaylasim) : 'Henüz paylaşılmadı'),
        h('dt', null, 'Son güncelleme gönderimi'),
        h('dd', null, d.guncellemeGonderim ? tarihSaat(d.guncellemeGonderim) : '—'),
      ),
      h('div', { class: 'eylemler genis-eylem' }, ...takibimDugmeleri(d)),
      h('p', { class: 'hint' }, 'Alerji, hastalık, ilaç bilgileri, paket notu ve notlarınız Takibim\'e eklenmez.'),
    ),
  ];
}

function paketSekmesi(d: Danisan): Node[] {
  const p = d.paket;
  const tanimlar = V().paketler.filter((x) => x.aktif);
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    tanimlar.length ? alan('Hazır Paket', secim('tanim', [['', 'Seçin (isteğe bağlı)'], ...tanimlar.map((x) => [x.id, x.ad] as [string, string])])) : null,
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Paket Adı', input('ad', p?.ad ?? '', { maxlength: 80 })),
      alan('Başlangıç', input('baslangic', p?.baslangic ?? bugun(), { type: 'date' })),
      alan('Bitiş', input('bitis', p?.bitis ?? '', { type: 'date' })),
      alan('Toplam Görüşme', input('toplamGorusme', p?.toplamGorusme ?? '', { inputmode: 'numeric' })),
      alan('Kalan Görüşme', input('kalanGorusme', p?.kalanGorusme ?? '', { inputmode: 'numeric' })),
    ),
    alan(sunucuAcik ? 'Danışanın göreceği not' : 'Not', metinAlani('not', p?.not ?? '', { rows: 2, maxlength: 300 })),
    h('div', { class: 'eylemler' }, h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Paketi Kaydet'), p ? dugme('Paketi Kaldır', async () => {
      d.paket = null;
      await degisti(d);
      ciz();
    }, 'btn btn-outline btn-sm') : null),
  );
  form.querySelector<HTMLSelectElement>('select[name=tanim]')?.addEventListener('change', (e) => {
    const t = tanimlar.find((x) => x.id === (e.target as HTMLSelectElement).value);
    if (!t) return;
    const el = (n: string) => form.querySelector<HTMLInputElement>(`[name=${n}]`)!;
    el('ad').value = t.ad;
    if (t.gorusme) {
      el('toplamGorusme').value = String(t.gorusme);
      el('kalanGorusme').value = String(t.gorusme);
    }
    if (t.gun) el('bitis').value = new Date(Date.parse(`${el('baslangic').value || bugun()}T00:00:00Z`) + t.gun * 86_400_000).toISOString().slice(0, 10);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const f = formNesnesi(form);
      const ad = String(f.ad).trim();
      if (!ad) throw new Uyari('Paket adı yazın.', 'Paket Adı');
      const tam = (v: string, et: string) => {
        if (!String(v).trim()) return undefined;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 200) throw new Uyari(`${et} 0–200 arasında bir sayı olmalıdır.`, et);
        return n;
      };
      if (f.bitis && f.baslangic && f.bitis < f.baslangic) throw new Uyari('Bitiş tarihi başlangıçtan önce olamaz.', 'Bitiş');
      d.paket = {
        ad,
        baslangic: f.baslangic || undefined,
        bitis: f.bitis || undefined,
        toplamGorusme: tam(f.toplamGorusme, 'Toplam Görüşme'),
        kalanGorusme: tam(f.kalanGorusme, 'Kalan Görüşme'),
        not: String(f.not).trim() || undefined,
      };
      await degisti(d);
      ciz();
    } catch (err) {
      hataGoster(form, err);
    }
  });
  return [
    kart(
      'Paket',
      p
        ? h(
            'div',
            { class: 'eylemler genis-eylem' },
            p.kalanGorusme !== undefined
              ? dugme(`Görüşme Yapıldı (kalan ${p.kalanGorusme} → ${Math.max(0, p.kalanGorusme - 1)})`, async () => {
                  p.kalanGorusme = Math.max(0, (p.kalanGorusme ?? 1) - 1);
                  await degisti(d);
                  ciz();
                })
              : null,
            waDugme(d.telefon, sablon('odeme', { ad: ilkAd(d.ad), adSoyad: d.ad, paket: p.ad }), 'Ödeme Bilgisi Gönder'),
            p.bitis ? waDugme(d.telefon, sablon('paketBitiyor', { ad: ilkAd(d.ad), paket: p.ad, bitis: tarih(p.bitis) }), 'Bitiş Hatırlat') : null,
          )
        : null,
      form,
    ),
  ];
}

function randevuSekmesi(d: Danisan): Node[] {
  const liste = V().randevular.filter((r) => r.danisanId === d.id).sort(randevuSirala).reverse();
  return [
    kart(
      'Randevular',
      h('div', { class: 'eylemler' }, dugme('Yeni Randevu', () => randevuDuzenle(undefined, d.id), 'btn btn-primary btn-sm')),
      liste.length ? h('ul', { class: 'liste' }, liste.map((r) => randevuSatiri(r, true))) : bos('Randevu yok.'),
    ),
  ];
}

function belgeSekmesi(d: Danisan): Node[] {
  const acik = d.takip && (d.takip.durum === 'eslesti' || d.takip.durum === 'bekliyor');
  const dosyaAlani = h('input', { class: 'input', type: 'file', name: 'dosya', accept: Object.keys(sinirlar.belgeTurleri).join(',') });
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h('div', { class: 'form-grid iki' }, alan('Başlık', input('baslik', '', { maxlength: 80, placeholder: 'Örn. Beslenme Planı – 1. Hafta' })), alan('Dosya (PDF, JPG, PNG, WEBP · en fazla 10 MB)', dosyaAlani)),
    h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Danışana Gönder'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        const dosya = dosyaAlani.files?.[0];
        const baslik = String(formNesnesi(form).baslik).trim();
        if (!baslik) throw new Uyari('Başlık yazın.', 'Başlık');
        if (!dosya) throw new Uyari('Dosya seçin.', 'Dosya (PDF, JPG, PNG, WEBP · en fazla 10 MB)');
        if (!sinirlar.belgeTurleri[dosya.type]) throw new Uyari('Yalnızca PDF, JPG, PNG veya WEBP gönderilebilir.');
        if (dosya.size > sinirlar.belgeBayt) throw new Uyari('Dosya en fazla 10 MB olabilir.');
        const b: TakipBelge = { id: kimlik(), baslik, ad: dosya.name, tur: dosya.type, boyut: dosya.size, tarih: Date.now() };
        await belgeYukle(depo!, d, b.id, dosya);
        d.belgeler.push(b);
        await degisti(d);
        ciz();
      } catch (err) {
        hataGoster(form, err);
      }
    });
  });
  const liste = [...d.belgeler].sort((a, b) => b.tarih - a.tarih);
  return [
    kart(
      'Belgeler',
      acik
        ? form
        : h('div', { class: 'bilgi-kutu' }, h('p', null, 'Belge göndermek için önce danışanın Takibim\'ini açın (Takibim sekmesi → QR Oluştur).')),
      liste.length
        ? h(
            'ul',
            { class: 'liste' },
            liste.map((b) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('strong', null, b.baslik), h('span', null, ` ${sinirlar.belgeTurleri[b.tur] ?? ''} · ${boyut(b.boyut)} · ${tarihSaat(b.tarih)}`)),
                h(
                  'div',
                  { class: 'eylemler' },
                  dugme('Aç', async (e) => {
                    await mesgul(e.currentTarget as HTMLButtonElement, async () => {
                      try {
                        indir(new Blob([(await belgeIndir(depo!, d, b.id)) as Uint8Array<ArrayBuffer>], { type: b.tur }), b.ad);
                      } catch {
                        toast('Belge indirilemedi.', 'hata');
                      }
                    });
                  }, 'btn btn-outline btn-xs'),
                  dugme('Sil', async () => {
                    const ok = await pencere({ baslik: 'Belgeyi Sil', tehlikeli: true, kaydet: 'Sil', icerik: h('p', null, `"${b.baslik}" danışanın Takibim sayfasından kaldırılsın mı?`) });
                    if (!ok) return;
                    await belgeSil(depo!, d, b.id);
                    d.belgeler = d.belgeler.filter((x) => x !== b);
                    for (const o of d.olcumler) if (o.belgeId === b.id) delete o.belgeId;
                    await degisti(d);
                    ciz();
                  }, 'btn btn-outline btn-xs'),
                ),
              ),
            ),
          )
        : bos('Gönderilmiş belge yok.'),
    ),
  ];
}

function mesajSekmesi(d: Danisan): Node[] {
  const acik = d.takip && (d.takip.durum === 'eslesti' || d.takip.durum === 'bekliyor');
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    alan('Mesaj', metinAlani('metin', '', { rows: 4, maxlength: 1500, placeholder: 'Danışanın Takibim sayfasında görünecek mesaj' })),
    h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Takibim\'e Gönder'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const m = String(formNesnesi(form).metin).trim();
      if (!m) throw new Uyari('Mesaj yazın.', 'Mesaj');
      d.mesajlar.push({ id: kimlik(), tarih: Date.now(), metin: m });
      await degisti(d);
      ciz();
    } catch (err) {
      hataGoster(form, err);
    }
  });
  const liste = [...d.mesajlar].sort((a, b) => b.tarih - a.tarih);
  return [
    kart(
      'Mesajlar',
      h('p', { class: 'hint' }, 'Mesajlar danışanın Takibim sayfasında görünür. Acil ve kişisel konular için WhatsApp\'ı kullanın.'),
      acik ? form : h('div', { class: 'bilgi-kutu' }, h('p', null, 'Mesaj göndermek için önce danışanın Takibim\'ini açın.')),
      liste.length
        ? h(
            'ul',
            { class: 'liste' },
            liste.map((m) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('strong', null, m.duyuru ? 'Duyuru' : 'Mesaj', ` · ${tarihSaat(m.tarih)}`), h('p', { class: 'cok-satir' }, m.metin)),
                h('div', { class: 'eylemler' }, dugme('Sil', async () => {
                  d.mesajlar = d.mesajlar.filter((x) => x !== m);
                  await degisti(d);
                  ciz();
                }, 'btn btn-outline btn-xs')),
              ),
            ),
          )
        : bos('Mesaj yok.'),
    ),
  ];
}

function bilgiSekmesi(d: Danisan): Node[] {
  const satir = (dt: string, dd?: string | number) => [h('dt', null, dt), h('dd', null, dd === undefined || dd === '' ? '—' : String(dd))];
  const notForm = h(
    'form',
    { class: 'form-grid', novalidate: true },
    alan('Yeni not (yalnızca siz görürsünüz)', metinAlani('metin', '', { rows: 3, maxlength: 3000 })),
    h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Notu Ekle'),
  );
  notForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = String(formNesnesi(notForm).metin).trim();
    if (!m) return;
    d.notlar.push({ id: kimlik(), tarih: Date.now(), metin: m });
    await degisti(d, true);
    ciz();
  });
  return [
    kart(
      'Kişisel ve Sağlık Bilgileri',
      h(
        'dl',
        { class: 'sabit-bilgi' },
        ...satir('Ad Soyad', d.ad),
        ...satir('Telefon', telefonGoster(d.telefon)),
        ...satir('E-posta', d.eposta),
        ...satir('Cinsiyet', d.cinsiyet === 'K' ? 'Kadın' : d.cinsiyet === 'E' ? 'Erkek' : ''),
        ...satir('Doğum Yılı', d.dogumYili),
        ...satir('Boy', d.boy ? `${sayi(d.boy, 0)} cm` : ''),
        ...satir('Hedef', [d.hedef, d.hedefKilo ? `${sayi(d.hedefKilo)} kg` : ''].filter(Boolean).join(' · ')),
        ...satir('Alerji / İntolerans', d.alerjiler),
        ...satir('Hastalıklar', d.hastaliklar),
        ...satir('İlaç / Takviye', d.ilaclar),
        ...satir('Kayıt', tarihSaat(d.olusturma)),
      ),
      h('div', { class: 'eylemler' }, dugme('Bilgileri Düzenle', () => danisanDuzenle(d), 'btn btn-primary btn-sm')),
    ),
    kart(
      'Özel Notlarım',
      notForm,
      d.notlar.length
        ? h(
            'ul',
            { class: 'liste' },
            [...d.notlar].sort((a, b) => b.tarih - a.tarih).map((n) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('strong', null, tarihSaat(n.tarih)), h('p', { class: 'cok-satir' }, n.metin)),
                h('div', { class: 'eylemler' }, dugme('Sil', async () => {
                  d.notlar = d.notlar.filter((x) => x !== n);
                  await degisti(d, true);
                  ciz();
                }, 'btn btn-outline btn-xs')),
              ),
            ),
          )
        : null,
    ),
    kart(
      'Danışanı Sil',
      h('p', null, 'Danışanın tüm kayıtları (ölçümler, notlar, randevular) bu panelden silinir; Takibim kaydı ve belgeleri sunucudan kaldırılır. Bu işlem geri alınamaz.'),
      dugme('Danışanı Sil', async () => {
        const ok = await pencere({
          baslik: 'Danışanı Sil',
          tehlikeli: true,
          kaydet: 'Kalıcı Olarak Sil',
          icerik: h('div', { class: 'form-grid' }, h('p', null, `${d.ad} ve tüm kayıtları silinecek.`), alan('Onay için SİL yazın', input('onay', '', { autocomplete: 'off' }))),
          onKaydet: async (form) => {
            if (String(formNesnesi(form).onay).trim().toLocaleUpperCase('tr') !== 'SİL') throw new Uyari('Onay için SİL yazın.', 'Onay için SİL yazın');
            if (d.takip) await api('DELETE', `/kutu/${d.takip.kutu}`, undefined, panelBasligi(depo!)).catch(() => undefined);
            V().danisanlar = V().danisanlar.filter((x) => x !== d);
            V().randevular = V().randevular.filter((r) => r.danisanId !== d.id);
            islemKaydet(`Danışan ve tüm kayıtları silindi: ${d.ad}`);
            await depo!.simdiKaydet();
          },
        });
        if (ok) {
          toast('Danışan silindi.');
          location.hash = '#danisanlar';
        }
      }, 'btn btn-tehlike btn-sm'),
    ),
  ];
}

// ================================================================ Duyuru

function duyuru(): Node[] {
  const alicilar = V().danisanlar.filter((d) => d.takip && (d.takip.durum === 'eslesti' || d.takip.durum === 'bekliyor'));
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    alan('Duyuru metni', metinAlani('metin', '', { rows: 5, maxlength: 1500, placeholder: 'Örn. 29 Ekim\'de klinik kapalıdır.' })),
    h('button', { type: 'submit', class: 'btn btn-primary btn-sm', disabled: alicilar.length ? null : true }, `Takibim'i Olan Tüm Danışanlara Gönder (${alicilar.length})`),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        const m = String(formNesnesi(form).metin).trim();
        if (!m) throw new Uyari('Duyuru metnini yazın.', 'Duyuru metni');
        let basarili = 0;
        for (const d of alicilar) {
          d.mesajlar.push({ id: kimlik(), tarih: Date.now(), metin: m, duyuru: true });
          if ((await takipGonder(depo!, d)) === 'tamam') basarili++;
        }
        await depo!.simdiKaydet();
        toast(`Duyuru ${basarili}/${alicilar.length} danışanın Takibim sayfasına gönderildi.`, basarili === alicilar.length ? 'tamam' : 'hata');
        ciz();
      } catch (err) {
        hataGoster(form, err);
      }
    });
  });
  const tum = [...V().danisanlar].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const waMetni = h('textarea', { class: 'textarea', rows: 3, placeholder: 'WhatsApp için mesaj (boş bırakılırsa "Merhaba {ad}," ile başlar)' });
  const waListe = h('ul', { class: 'liste' });
  const listeCiz = () =>
    waListe.replaceChildren(
      ...tum.map((d) =>
        h(
          'li',
          null,
          h('div', { class: 'ana' }, h('strong', null, d.ad), h('span', null, ` ${telefonGoster(d.telefon)}`)),
          h('div', { class: 'eylemler' }, waDugme(d.telefon, `Merhaba ${ilkAd(d.ad)}, ${waMetni.value}`.trim())),
        ),
      ),
    );
  waMetni.addEventListener('input', listeCiz);
  listeCiz();
  return [
    bolumBasligi('Duyuru', sunucuAcik ? 'Tek tuşla tüm danışanların Takibim sayfasına duyuru gönderin.' : 'Danışanlarınıza WhatsApp ile duyuru gönderin.'),
    sunucuAcik ? kart('Takibim Duyurusu', form) : null,
    kart(
      'WhatsApp ile Tek Tek',
      h('p', { class: 'hint' }, 'Mesajı bir kez yazın; WhatsApp toplu mesaja izin vermediği için her danışanın yanındaki düğme, mesajı o kişiye hazır olarak açar.'),
      h(
        'div',
        { class: 'bilgi-kutu uyari' },
        h(
          'p',
          null,
          h('strong', null, 'Yalnızca bilgilendirme: '),
          'Çalışma saatleri, tatil, adres değişikliği gibi hizmete ilişkin duyurular gönderin. Kampanya, indirim, paket tanıtımı gibi mesajlar ticari elektronik ileti sayılır; önceden yazılı onay ve İleti Yönetim Sistemi (İYS) kaydı gerektirir. Mesajlarda sağlık bilgisi paylaşmayın.',
        ),
      ),
      waMetni,
      tum.length ? waListe : bos('Danışan yok.'),
    ),
  ].filter(Boolean) as Node[];
}

// ================================================================ Paketler

function paketler(): Node[] {
  const duzenle = async (p?: PaketTanimi) => {
    await pencere({
      baslik: p ? 'Paketi Düzenle' : 'Yeni Paket',
      icerik: h(
        'div',
        { class: 'form-grid' },
        alan('Paket Adı', input('ad', p?.ad ?? '', { maxlength: 80 })),
        h(
          'div',
          { class: 'form-grid uc' },
          alan('Görüşme Sayısı', input('gorusme', p?.gorusme ?? '', { inputmode: 'numeric' })),
          alan('Süre (gün)', input('gun', p?.gun ?? '', { inputmode: 'numeric' })),
          alan('Ücret (TL)', input('fiyat', p?.fiyat ?? '', { inputmode: 'decimal' }), 'Yalnızca sizin için'),
        ),
        h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'aktif', checked: p ? p.aktif : true }), h('span', null, 'Kullanımda')),
      ),
      onKaydet: async (form) => {
        const f = formNesnesi(form);
        const ad = String(f.ad).trim();
        if (!ad) throw new Uyari('Paket adı yazın.', 'Paket Adı');
        const tam = (v: string, et: string, max: number) => {
          if (!String(v).trim()) return undefined;
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > max) throw new Uyari(`${et} 1–${max} arasında olmalıdır.`, et);
          return n;
        };
        const v: PaketTanimi = {
          id: p?.id ?? kimlik(),
          ad,
          gorusme: tam(f.gorusme, 'Görüşme Sayısı', 200),
          gun: tam(f.gun, 'Süre (gün)', 730),
          fiyat: ondalik(f.fiyat, 'Ücret (TL)', 0, 1_000_000),
          aktif: Boolean(f.aktif),
        };
        if (p) Object.assign(p, v);
        else V().paketler.push(v);
        await depo!.kaydet();
      },
    });
    ciz();
  };
  return [
    bolumBasligi('Paketler', 'Danışan dosyasında paket seçerken kullanılan hazır tanımlar.', dugme('Yeni Paket', () => duzenle(), 'btn btn-primary btn-sm')),
    kart(
      null,
      V().paketler.length
        ? h(
            'ul',
            { class: 'liste' },
            V().paketler.map((p) =>
              h(
                'li',
                null,
                h(
                  'div',
                  { class: 'ana' },
                  h('strong', null, p.ad),
                  h('span', null, ` ${[p.gorusme ? `${p.gorusme} görüşme` : '', p.gun ? `${p.gun} gün` : '', p.fiyat !== undefined ? `${sayi(p.fiyat, 2)} TL` : ''].filter(Boolean).join(' · ')}`),
                ),
                h('div', { class: 'eylemler' }, p.aktif ? null : etiket('Kullanımda değil', 'pasif'), dugme('Düzenle', () => duzenle(p), 'btn btn-outline btn-xs')),
              ),
            ),
          )
        : bos('Henüz paket tanımı yok.'),
    ),
  ];
}

// ================================================================ Ayarlar

async function sunucuBagla() {
  let durum: { randevuKutusu: boolean; kurulumKodu: boolean };
  try {
    durum = await api('GET', '/durum');
  } catch (e) {
    return toast(e instanceof ApiError ? e.message : 'Sunucuya ulaşılamadı.', 'hata');
  }
  if (!durum.kurulumKodu) {
    const kod = b64url(rastgele(18));
    await pencere({
      baslik: 'Kurulum Kodu Gerekli',
      kaydet: 'Kodu Ekledim, Devam Et',
      genis: true,
      icerik: h(
        'div',
        { class: 'form-grid' },
        h('p', null, 'Paneli sunucuya yalnızca sizin bağlayabilmeniz için Cloudflare\'e bir kez gizli bir kurulum kodu eklenir (ücretsizdir):'),
        h(
          'ol',
          { class: 'adim-liste' },
          h('li', null, 'dash.cloudflare.com → Workers & Pages → diyetisyeneylemdizman → Settings → Variables and Secrets → Add.'),
          h('li', null, 'Type: Secret · Variable name: KURULUM_KODU · Value: aşağıdaki kod → Deploy.'),
          h('li', null, 'Kodu ayrıca güvenli bir yere not edin; yeni bir bilgisayarda paneli bağlarken yine gerekir.'),
        ),
        h('div', { class: 'kod-kutu kucuk' }, kod),
        dugme('Kodu Kopyala', async () => {
          await navigator.clipboard.writeText(kod).then(() => toast('Kopyalandı.')).catch(() => toast('Kopyalanamadı; elle seçip kopyalayın.', 'hata'));
        }),
      ),
    });
    return;
  }
  const yenidenBaglama = durum.randevuKutusu;
  await pencere({
    baslik: 'Sunucuya Bağlan',
    kaydet: 'Bağlan',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', null, 'Cloudflare\'e eklediğiniz KURULUM_KODU değerini girin. Bu bilgisayarda randevu talepleri için bir anahtar çifti oluşturulur; özel anahtar bilgisayarınızdan çıkmaz.'),
      yenidenBaglama
        ? h('div', { class: 'bilgi-kutu uyari' }, h('p', null, 'Sunucu daha önce bir panele bağlanmış. Yeniden bağlarsanız önceki bağlantı (ör. başka bilgisayardaki panel) talep alamaz ve henüz alınmamış talepler açılamayabilir. Başka bilgisayara taşımak için "Yedek İndir / Yedekten Yükle" kullanmanız önerilir.'))
        : null,
      alan('Kurulum kodu', input('kod', '', { autocomplete: 'off', spellcheck: 'false' })),
    ),
    onKaydet: async (form) => {
      const kod = String(formNesnesi(form).kod).trim();
      if (!kod) throw new Uyari('Kurulum kodunu girin.', 'Kurulum kodu');
      const { acik, ozel } = await ecdhAnahtarCifti();
      const jeton = b64url(rastgele(32));
      await api('POST', '/kurulum', { kod, jeton, anahtar: acik });
      V().sunucu = { jeton, ozel, acik, baglandi: Date.now() };
      sunucuUyarisi = '';
      await depo!.simdiKaydet();
      toast('Panel sunucuya bağlandı. Sitedeki randevu talepleri artık buraya gelecek.');
    },
  });
  ciz();
}

async function yedekIndir() {
  islemKaydet('Şifreli yedek indirildi');
  const blob = await depo!.yedek();
  indir(blob, `diyetisyen-paneli-yedek-${bugun()}.json`);
  toast('Yedek indirildi. Dosyayı USB belleğe veya ikinci bir diske kopyalayın.');
  ciz();
}

const pushDestekli = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function swKaydi() {
  return navigator.serviceWorker.register('/yonetim/sw.js', { scope: '/yonetim/' });
}

const vapidBaytlari = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function buBilgisayardaBildirim() {
  if (!pushDestekli()) return toast('Bu tarayıcı bildirimleri desteklemiyor.', 'hata');
  if ((await Notification.requestPermission()) !== 'granted') return toast('Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.', 'hata');
  try {
    const { anahtar } = await api<{ anahtar: string }>('GET', '/bildirim/anahtar');
    const reg = await swKaydi();
    await navigator.serviceWorker.ready;
    const abone =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBaytlari(anahtar) as Uint8Array<ArrayBuffer> }));
    await api('POST', '/bildirim/abone', { endpoint: abone.endpoint, ad: 'Bilgisayar' }, panelBasligi(depo!));
    toast('Bu bilgisayarda bildirimler açıldı.');
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Bildirim açılamadı.', 'hata');
  }
  ciz();
}

async function telefonaBildirim() {
  try {
    const { kod } = await api<{ kod: string }>('POST', '/bildirim/telefon-kodu', undefined, panelBasligi(depo!));
    await pencere({
      baslik: 'Telefona Bildirim Ekle',
      kaydet: 'Kapat',
      vazgecYok: true,
      icerik: h(
        'div',
        { class: 'form-grid' },
        h(
          'ol',
          { class: 'adim-liste' },
          h('li', null, 'Telefonunuzda şu adresi açın: ', h('strong', null, `${site.url.replace('https://', '')}/yonetim/bildirim/`)),
          h('li', null, 'iPhone\'da: Safari\'de Paylaş → "Ana Ekrana Ekle" deyin ve sayfayı ana ekrandaki simgeden açın.'),
          h('li', null, 'Aşağıdaki kodu girip "Bildirimleri Aç"a basın ve izin verin.'),
        ),
        h('div', { class: 'kod-kutu' }, kod),
        h('p', { class: 'hint' }, 'Kod 10 dakika geçerlidir. Bildirimde kişisel bilgi bulunmaz; yalnızca "Yeni randevu talebi" yazar.'),
      ),
    });
    ciz();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Kod alınamadı.', 'hata');
  }
}

function ayarlar(): Node[] {
  const sunucu = V().sunucu;
  const cihazlar = h('div', null, bos('Yükleniyor…'));
  if (sunucuAcik && sunucu)
    void api<{ aboneler: { ad: string; olusturma: number; endpoint: string }[] }>('GET', '/bildirim/aboneler', undefined, panelBasligi(depo!))
      .then(({ aboneler }) =>
        cihazlar.replaceChildren(
          aboneler.length
            ? h(
                'ul',
                { class: 'liste' },
                aboneler.map((a) =>
                  h(
                    'li',
                    null,
                    h('div', { class: 'ana' }, h('strong', null, a.ad), h('span', null, ` · eklenme ${tarihSaat(a.olusturma)}`)),
                    h('div', { class: 'eylemler' }, dugme('Kaldır', async () => {
                      await api('DELETE', '/bildirim/abone', { endpoint: a.endpoint });
                      ciz();
                    }, 'btn btn-outline btn-xs')),
                  ),
                ),
              )
            : bos('Bildirim alan cihaz yok.'),
        ),
      )
      .catch(() => cihazlar.replaceChildren(bos('Cihaz listesi alınamadı.')));

  const sablonlar = h(
    'div',
    { class: 'form-grid' },
    Object.entries(SABLONLAR)
      .filter(([k]) => (sunucuAcik ? !['takibimGuncelleme', 'sonrakiRandevu'].includes(k) : k !== 'yeniSonuc' && (!['takibim', 'takibimGuncelleme', 'sonrakiRandevu'].includes(k) || takibimGorunur)))
      .map(([k, s]) => {
      const ta = metinAlani(`s-${k}`, V().sablonlar[k] ?? s.metin, { rows: 4 });
      ta.addEventListener('change', async () => {
        const v = (ta as HTMLTextAreaElement).value;
        if (v.trim() && v !== s.metin) V().sablonlar[k] = v;
        else delete V().sablonlar[k];
        await depo!.kaydet();
        toast('Şablon kaydedildi.');
      });
      return alan(s.ad, ta);
    }),
    h(
      'p',
      { class: 'hint' },
      `Kullanılabilen alanlar: {ad} (ilk ad), {adSoyad}, {tarih}, {gun}, {saat}, {adres}, {konum}, {paket}, {bitis}, {tur}${takibimGorunur ? ', {baglanti}' : ''}${sunucuAcik ? ', {takibim}' : ''}. Ödeme şablonundaki IBAN bilgisini kendi hesabınızla değiştirin.`,
    ),
    dugme('Varsayılan Şablonlara Dön', async () => {
      V().sablonlar = {};
      await depo!.kaydet();
      ciz();
    }),
  );

  return [
    bolumBasligi('Ayarlar'),
    sunucuAcik ? null : kart('Veriler Nerede?', h('p', null, 'Tüm danışan kayıtları yalnızca bu bilgisayarda, panel parolasıyla şifreli olarak saklanır; internete gönderilmez. Bu yüzden düzenli yedek almanız önemlidir; yedek dosyasını USB bellek veya harici diskte saklayın.'),
      qrKipi ? h('p', null, 'Takibim QR kodu, danışanın özetini (ölçümler, paket, yaklaşan randevular) doğrudan danışanın telefonuna aktarır; sunucuya gönderilmez. Alerji, hastalık, ilaç bilgileri ve notlarınız QR\'a eklenmez.') : null,
    ),
    islemKayitlariKarti(),
    saklamaKarti(),
    !sunucuAcik ? null : kart(
      'Sunucu Bağlantısı',
      sunucu
        ? h('p', null, h('strong', null, 'Bağlı. '), `Bağlantı tarihi: ${tarihSaat(sunucu.baglandi)}. Sitedeki randevu talepleri bu panele gelir; Takibim etkin.`)
        : h('p', null, 'Bağlı değil. Randevu talepleri WhatsApp\'a gitmeye devam eder; Takibim kullanılamaz.'),
      sunucuUyarisi ? h('div', { class: 'bilgi-kutu uyari' }, h('p', null, sunucuUyarisi)) : null,
      h('div', { class: 'eylemler' }, dugme(sunucu ? 'Yeniden Bağlan' : 'Sunucuya Bağlan', () => sunucuBagla(), sunucu ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm')),
    ),
    !sunucuAcik ? null : kart(
      'Bildirimler',
      h('p', null, 'Siteden yeni randevu talebi geldiğinde bildirim alırsınız. Bildirimde kişisel bilgi yer almaz.'),
      sunucu
        ? h(
            'div',
            { class: 'eylemler genis-eylem' },
            pushDestekli() ? dugme('Bu Bilgisayarda Bildirimleri Aç', () => buBilgisayardaBildirim(), 'btn btn-primary btn-sm') : null,
            dugme('Telefona Bildirim Ekle', () => telefonaBildirim()),
            dugme('Deneme Bildirimi Gönder', async (e) => {
              const r = await mesgul(e.currentTarget as HTMLButtonElement, () =>
                api<{ gonderilen: number }>('POST', '/bildirim/dene', undefined, panelBasligi(depo!)).catch(() => ({ gonderilen: -1 })),
              );
              toast(r && r.gonderilen > 0 ? `Deneme bildirimi ${r.gonderilen} cihaza gönderildi.` : 'Bildirim gönderilemedi veya kayıtlı cihaz yok.', r && r.gonderilen > 0 ? 'tamam' : 'hata');
            }),
          )
        : bos('Önce sunucuya bağlanın.'),
      sunucu ? cihazlar : null,
    ),
    kart('Mesaj Şablonları', sablonlar),
    kart(
      'Yedek',
      h('p', null, V().sonYedek ? `Son yedek: ${tarihSaat(V().sonYedek!)}.` : 'Henüz yedek alınmadı.', ' Yedek dosyası panel parolanızla şifrelidir; açmak için yedeği aldığınız sıradaki parola gerekir.'),
      h('div', { class: 'eylemler' }, dugme('Yedek İndir', () => yedekIndir(), 'btn btn-primary btn-sm'), dugme('Yedekten Yükle', () => yedektenYukle())),
    ),
    kart(
      'Güvenlik',
      h('p', null, `Panel ${sinirlar.panelKilitDakika} dakika işlem yapılmazsa kendini kilitler.`),
      h(
        'div',
        { class: 'eylemler' },
        dugme('Parolayı Değiştir', () =>
          pencere({
            baslik: 'Parolayı Değiştir',
            icerik: h(
              'div',
              { class: 'form-grid' },
              alan('Yeni parola', h('input', { class: 'input', type: 'password', name: 'parola', autocomplete: 'new-password' })),
              alan('Yeni parola (tekrar)', h('input', { class: 'input', type: 'password', name: 'tekrar', autocomplete: 'new-password' })),
              h('p', { class: 'hint' }, 'Eski yedek dosyaları eski parolayla açılır. Parolayı değiştirdikten sonra yeni bir yedek alın.'),
            ),
            onKaydet: async (form) => {
              const f = formNesnesi(form);
              try {
                parolaKurallari(f.parola);
              } catch (e) {
                throw new Uyari((e as Error).message, 'Yeni parola');
              }
              if (f.parola !== f.tekrar) throw new Uyari('Parolalar aynı değil.', 'Yeni parola (tekrar)');
              islemKaydet('Panel parolası değiştirildi');
              await depo!.parolaDegistir(f.parola);
              toast('Parola değiştirildi. Yeni bir yedek alın.');
            },
          }),
        ),
        dugme('Bu Bilgisayardaki Panel Verilerini Sil', () => parolaUnuttum(), 'btn btn-tehlike btn-sm'),
      ),
    ),
  ].filter(Boolean) as Node[];
}

function islemKayitlariKarti(): Node {
  const liste = [...(V().islemler ?? [])].reverse();
  const csv = () => {
    const satirlar = [['Tarih', 'İşlem'], ...[...(V().islemler ?? [])].map((x) => [new Date(x.t).toLocaleString('tr-TR'), x.ne])];
    const metin = satirlar.map((r) => r.map((h_) => `"${String(h_).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    indir(new Blob(['\ufeff' + metin], { type: 'text/csv;charset=utf-8' }), `panel-islem-kayitlari-${bugun()}.csv`);
  };
  return kart(
    'İşlem Kayıtları',
    h(
      'p',
      null,
      'Panelde yapılan işlemler (açılış ve kilitlenme, kayıt değişiklikleri, QR / bağlantı paylaşımları, yedek, silme) son 2 yıl için kayda geçirilir. Kayıtlar da panel parolasıyla şifrelidir ve yalnızca bu bilgisayardadır.',
    ),
    liste.length
      ? h(
          'details',
          { class: 'tablo-ac' },
          h('summary', null, `Son işlemler (${liste.length})`),
          h('ul', { class: 'liste' }, liste.slice(0, 40).map((x) => h('li', null, h('div', { class: 'ana' }, h('span', { class: 'ince' }, tarihSaat(x.t)), h('span', null, ` ${x.ne}`))))),
        )
      : bos('Henüz kayıt yok.'),
    h('div', { class: 'eylemler' }, dugme('Kayıtları İndir (CSV)', () => csv(), 'btn btn-outline btn-sm')),
  );
}

function saklamaKarti(): Node {
  const dolanlar = saklamaSuresiDolanlar();
  return kart(
    'Saklama Süreleri',
    h(
      'p',
      null,
      'KVKK aydınlatma metnine göre: danışan kayıtları son işlemden itibaren 10 yıl saklanır, süresi dolanlar aşağıda listelenir ve silinmelidir. Danışana dönüşmeyen randevu talepleri 1 yıl sonra kendiliğinden silinir.',
    ),
    dolanlar.length
      ? h(
          'ul',
          { class: 'liste' },
          dolanlar.map((d) =>
            h(
              'li',
              null,
              h('div', { class: 'ana' }, h('strong', null, d.ad), h('span', null, ` · son işlem ${tarih(d.guncelleme)}`)),
              h(
                'div',
                { class: 'eylemler' },
                dugme('Sil', async () => {
                  const ok = await pencere({ baslik: 'Saklama Süresi Dolan Kaydı Sil', tehlikeli: true, kaydet: 'Kalıcı Olarak Sil', icerik: h('p', null, `${d.ad} ve tüm kayıtları silinsin mi? Bu işlem geri alınamaz.`) });
                  if (!ok) return;
                  V().danisanlar = V().danisanlar.filter((x) => x !== d);
                  V().randevular = V().randevular.filter((r) => r.danisanId !== d.id);
                  islemKaydet(`Saklama süresi dolan danışan kaydı silindi: ${d.ad}`);
                  await depo!.simdiKaydet();
                  ciz();
                }, 'btn btn-tehlike btn-xs'),
              ),
            ),
          ),
        )
      : bos('Saklama süresi dolan danışan kaydı yok.'),
    h('p', { class: 'hint' }, 'Yedek dosyalarında silinen kayıtlar kalır; eski yedekleri (USB bellek vb.) en fazla 1 yıl saklayın, sonra silin.'),
  );
}

// ================================================================ Başlangıç

async function baslat() {
  if (!('indexedDB' in window) || !crypto?.subtle) {
    ortaKart(h('h1', null, 'Tarayıcı desteklenmiyor'), h('p', null, 'Paneli güncel bir Chrome, Edge, Firefox veya Safari ile açın.'));
    return;
  }
  const devam = async () => {
    if (await Depo.var()) kilitEkrani();
    else kurulumEkrani();
  };
  // Panel aynı anda tek sekmede açık olabilir (iki sekme birbirinin kaydını ezmesin)
  if ('locks' in navigator) {
    void navigator.locks.request('diyetisyen-paneli', { ifAvailable: true }, async (kilit) => {
      if (!kilit) {
        ortaKart(h('h1', null, 'Panel başka bir sekmede açık'), h('p', null, 'Kayıtların karışmaması için panel aynı anda yalnızca bir sekmede açılabilir. Diğer sekmeyi kapatıp bu sayfayı yenileyin.'));
        return;
      }
      await devam();
      await new Promise(() => undefined); // sekme kapanana kadar kilidi tut
    });
  } else await devam();
}

addEventListener('beforeunload', () => {
  void depo?.simdiKaydet();
});

void baslat();
