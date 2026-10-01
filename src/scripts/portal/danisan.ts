// Danışan paneli (tek sayfa, bölümler adres çubuğundaki #bolum ile açılır)

import {
  $,
  alan,
  api,
  ApiError,
  boyut,
  bugun,
  durumBandi,
  formHatasi,
  formNesnesi,
  formTemizle,
  gunFarki,
  h,
  mesgul,
  para,
  pencere,
  sayi,
  sure,
  tarih,
  tarihSaat,
  toast,
  turAdi,
  whatsapp,
} from './lib';
import { cizgiGrafik, type Nokta } from './chart';
import {
  aktiviteSecenekleri,
  belgeSiniri,
  danisanOlcumAlanlari,
  gebelikSecenekleri,
  hastalikSecenekleri,
  hedefSecenekleri,
  olcumAlanlari,
  paketDurumlari,
  randevuDurumlari,
  sehirler,
} from '../../data/portal';

type Olcum = { id: string; tarih: string; kaynak: string; degerler: Record<string, number> };
type Panel = {
  mod: string;
  kullanici: { ad: string; eposta: string; telefon: string; durum: string; kayit: number };
  profil: any;
  olcumler: Olcum[];
  paketler: { id: string; ad: string; ozet: string; icerik: string[]; sure: string; fiyat: number | null }[];
  aboneliklerim: { id: string; paketAdi: string; durum: string; baslangic: string; bitis: string; fiyat: number | null; odemeNotu: string; tarih: number }[];
  randevular: { id: string; tarih: string; saat: string; tur: string; durum: string; not: string }[];
  belgeler: { id: string; baslik: string; dosyaAdi: string; tur: string; boyut: number; yukleyen: string; tarih: number }[];
  mesajlar: { id: string; baslik: string; metin: string; tur: string; tarih: number; okundu: boolean }[];
  takvim: { ileriGun: number; bugun: string };
  whatsapp: string;
};
type Ben = {
  mod: string;
  kullanici: { ad: string; durum: string };
  onayGerekli: string[];
  belgeler: Record<string, { baslik: string; yol: string }>;
};

const app = $('[data-uygulama]');
let ben: Ben;
let veri: Panel;

const BOLUMLER: [string, string][] = [
  ['ozet', 'Özet'],
  ['gelisim', 'Gelişimim'],
  ['olcumler', 'Ölçümlerim'],
  ['paketim', 'Paketim'],
  ['randevular', 'Randevularım'],
  ['belgeler', 'Belgelerim'],
  ['mesajlar', 'Mesajlar'],
  ['profil', 'Profilim'],
  ['hesap', 'Hesap ve Gizlilik'],
];

const alanTanim = Object.fromEntries(olcumAlanlari.map((f) => [f.key, f]));

/** Ölçüm değeri; yağ kütlesi yoksa kilo × yağ oranından hesaplanır */
function deger(m: Olcum, key: string): number | null {
  const d = m.degerler;
  if (d[key] !== undefined) return d[key];
  if (key === 'yagKg' && d.kilo && d.yagOrani) return Math.round(d.kilo * d.yagOrani) / 100;
  return null;
}

function seri(key: string): Nokta[] {
  const out: Nokta[] = [];
  for (const m of veri.olcumler) {
    const v = deger(m, key);
    if (v !== null) out.push({ x: m.tarih, y: v });
  }
  // Aynı güne ait birden fazla ölçümde son girilen kullanılır
  const gun = new Map(out.map((p) => [p.x, p]));
  return [...gun.values()].sort((a, b) => a.x.localeCompare(b.x));
}

function degisimMetni(key: string) {
  const s = seri(key);
  if (s.length < 2) return null;
  const fark = Math.round((s[s.length - 1].y - s[0].y) * 10) / 10;
  const gun = gunFarki(s[0].x, s[s.length - 1].x);
  return { fark, gun, ilk: s[0], son: s[s.length - 1] };
}

async function cikis() {
  await api('POST', '/cikis').catch(() => {});
  location.replace('/danisan/giris/');
}

function ustEylemler() {
  const kutu = document.querySelector('[data-ust-eylemler]');
  kutu?.replaceChildren(h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: cikis }, 'Çıkış Yap'));
}

async function basla() {
  durumBandi();
  try {
    ben = await api<Ben>('GET', '/ben');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return location.replace('/danisan/giris/');
    app.replaceChildren(h('p', { class: 'form-hata' }, (e as Error).message));
    return;
  }
  ustEylemler();
  if (ben.onayGerekli.length) return onayEkrani();
  await yenile();
  window.addEventListener('hashchange', ciz);
}

async function yenile() {
  try {
    veri = await api<Panel>('GET', '/panel');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return location.replace('/danisan/giris/');
    if (e instanceof ApiError && e.status === 428) return location.reload();
    app.replaceChildren(h('p', { class: 'form-hata' }, (e as Error).message));
    return;
  }
  ciz();
}

function okunmamis() {
  return veri.mesajlar.filter((m) => !m.okundu).length;
}

function ciz() {
  const bolum = BOLUMLER.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'ozet';
  const menu = h(
    'nav',
    { class: 'panel-menu', 'aria-label': 'Panel bölümleri' },
    BOLUMLER.map(([k, ad]) =>
      h(
        'a',
        { href: `#${k}`, 'aria-current': k === bolum ? 'page' : null },
        ad,
        k === 'mesajlar' && okunmamis() ? h('span', { class: 'rozet', 'aria-label': `${okunmamis()} okunmamış` }, okunmamis()) : null,
      ),
    ),
  );
  const icerik = h('div', { class: 'panel-icerik' });
  if (veri.kullanici.durum === 'silme_talebi')
    icerik.append(
      h(
        'p',
        { class: 'bilgi-kutu uyari' },
        'Hesabınız için silme talebiniz alındı. Talebiniz işleme alınana kadar panel kullanılabilir; talebinizi Hesap ve Gizlilik bölümünden geri alabilirsiniz.',
      ),
    );
  const bolumler: Record<string, () => Node[]> = {
    ozet: ozetBolumu,
    gelisim: gelisimBolumu,
    olcumler: olcumBolumu,
    paketim: paketBolumu,
    randevular: randevuBolumu,
    belgeler: belgeBolumu,
    mesajlar: mesajBolumu,
    profil: profilBolumu,
    hesap: hesapBolumu,
  };
  icerik.append(...bolumler[bolum]());
  app.replaceChildren(h('div', { class: 'panel' }, menu, icerik));
  if (bolum === 'mesajlar') okunduIsaretle();
}

const baslik = (b: string, alt?: string, ...eylem: Node[]) =>
  h('div', { class: 'bolum-baslik' }, h('div', null, h('h1', null, b), alt ? h('p', null, alt) : null), eylem.length ? h('div', { class: 'eylemler' }, eylem) : null);

const durumEtiketi = (durum: string, sozluk: Record<string, string>) => h('span', { class: `durum ${durum}` }, sozluk[durum] ?? durum);

// ============================================================== Özet

function ozetBolumu(): Node[] {
  const ad = veri.kullanici.ad.split(' ')[0];
  const aktif = veri.aboneliklerim.find((a) => a.durum === 'aktif');
  const bekleyen = veri.aboneliklerim.find((a) => a.durum === 'talep' || a.durum === 'odeme');
  const bugunTarih = bugun();
  const sonraki = [...veri.randevular]
    .filter((r) => (r.durum === 'talep' || r.durum === 'onaylandi') && r.tarih >= bugunTarih)
    .sort((a, b) => (a.tarih + a.saat).localeCompare(b.tarih + b.saat))[0];

  const paketKart = h(
    'div',
    { class: 'kart gosterge' },
    h('span', { class: 'etiket' }, 'Paketim'),
    aktif
      ? [
          h('span', { class: 'deger', style: 'font-size:1.25rem' }, aktif.paketAdi),
          h(
            'span',
            { class: 'alt' },
            aktif.bitis ? `Bitiş: ${tarih(aktif.bitis)} (${Math.max(0, gunFarki(bugunTarih, aktif.bitis))} gün kaldı)` : 'Aktif',
          ),
        ]
      : bekleyen
        ? [h('span', { class: 'deger', style: 'font-size:1.25rem' }, bekleyen.paketAdi), durumEtiketi(bekleyen.durum, paketDurumlari)]
        : [h('span', { class: 'alt' }, 'Henüz aktif bir paketiniz yok.'), h('a', { href: '#paketim', class: 'metin-dugme' }, 'Paketleri İncele')],
  );
  const randevuKart = h(
    'div',
    { class: 'kart gosterge' },
    h('span', { class: 'etiket' }, 'Sonraki Randevum'),
    sonraki
      ? [
          h('span', { class: 'deger', style: 'font-size:1.25rem' }, `${tarih(sonraki.tarih)} · ${sonraki.saat}`),
          h('span', { class: 'alt' }, turAdi(sonraki.tur), ' · ', durumEtiketi(sonraki.durum, randevuDurumlari)),
        ]
      : [h('span', { class: 'alt' }, 'Planlanmış randevunuz yok.'), h('a', { href: '#randevular', class: 'metin-dugme' }, 'Randevu Talebi Oluştur')],
  );
  const mesajKart = h(
    'div',
    { class: 'kart gosterge' },
    h('span', { class: 'etiket' }, 'Mesajlar'),
    h('span', { class: 'deger' }, String(okunmamis())),
    h('span', { class: 'alt' }, okunmamis() ? h('a', { href: '#mesajlar', class: 'metin-dugme' }, 'Okunmamış mesajları gör') : 'Okunmamış mesaj yok'),
  );

  return [
    baslik(`Merhaba ${ad}`, 'Sürecinizin özeti'),
    h('div', { class: 'izgara' }, paketKart, randevuKart, mesajKart),
    h('div', { class: 'izgara' }, ...ozetGostergeleri()),
    h(
      'div',
      { class: 'kart' },
      h('h2', null, 'Kilo Gelişimi'),
      cizgiGrafik({ baslik: 'Kilo', birim: 'kg', noktalar: seri('kilo'), hedef: veri.profil?.hedefKilo }),
      h('p', { class: 'form-alt' }, h('a', { href: '#gelisim' }, 'Tüm gelişim grafikleri')),
    ),
  ];
}

function ozetGostergeleri(): Node[] {
  const out: Node[] = [];
  for (const [key, ad] of [
    ['kilo', 'Kilo'],
    ['yagKg', 'Yağ Kütlesi'],
    ['kasKg', 'Kas Kütlesi'],
  ] as const) {
    const s = seri(key);
    if (!s.length) continue;
    const d = degisimMetni(key);
    out.push(
      h(
        'div',
        { class: 'kart gosterge' },
        h('span', { class: 'etiket' }, ad),
        h('span', { class: 'deger' }, `${sayi(s[s.length - 1].y)} kg`),
        d
          ? h(
              'span',
              { class: 'alt' },
              h('span', { class: `degisim ${d.fark < 0 ? 'asagi iyi' : d.fark > 0 ? 'yukari iyi' : ''}` }, `${d.fark > 0 ? '+' : ''}${sayi(d.fark)} kg`),
              ` · ${d.gun ? sure(d.gun) : 'aynı gün'} (${tarih(d.ilk.x)} → ${tarih(d.son.x)})`,
            )
          : h('span', { class: 'alt' }, `Son ölçüm: ${tarih(s[s.length - 1].x)}`),
      ),
    );
  }
  const hedef = veri.profil?.hedefKilo;
  const kilo = seri('kilo');
  if (hedef && kilo.length) {
    const kalan = Math.round((kilo[kilo.length - 1].y - hedef) * 10) / 10;
    out.push(
      h(
        'div',
        { class: 'kart gosterge' },
        h('span', { class: 'etiket' }, 'Hedef Kiloya Kalan'),
        h('span', { class: 'deger' }, `${sayi(Math.abs(kalan))} kg`),
        h('span', { class: 'alt' }, `Hedef: ${sayi(hedef)} kg`),
      ),
    );
  }
  if (!out.length) out.push(h('div', { class: 'kart' }, h('p', { class: 'bos' }, 'Ölçümleriniz eklendikçe değişimleriniz burada görünür.')));
  return out;
}

// ============================================================== Gelişim

function gelisimBolumu(): Node[] {
  const grafikler: Node[] = [];
  for (const key of ['kilo', 'yagKg', 'kasKg', 'yagOrani', 'bel', 'kalca']) {
    const s = seri(key);
    if (!s.length) continue;
    const f = alanTanim[key];
    grafikler.push(
      h('div', { class: 'kart' }, cizgiGrafik({ baslik: f.label, birim: f.unit, noktalar: s, hedef: key === 'kilo' ? veri.profil?.hedefKilo : null })),
    );
  }
  return [
    baslik('Gelişimim', 'Ölçümlerinizin zaman içindeki değişimi. Grafiğin üzerine gelerek ya da ok tuşlarıyla tarihleri inceleyebilirsiniz.'),
    h('div', { class: 'izgara' }, ...ozetGostergeleri()),
    grafikler.length
      ? h('div', { class: 'izgara', style: 'grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))' }, ...grafikler)
      : h('div', { class: 'kart' }, h('p', { class: 'bos' }, 'Henüz ölçüm yok.')),
    h(
      'p',
      { class: 'bilgi-kutu' },
      'Yağ ve kas ölçümleri klinikteki vücut analizinden sonra diyetisyeniniz tarafından eklenir. Değerler kişiden kişiye değişir; yorumlamak için diyetisyeninize danışın.',
    ),
  ];
}

// ============================================================== Ölçümler

function olcumBolumu(): Node[] {
  const kullanilan = olcumAlanlari.filter((f) => veri.olcumler.some((m) => deger(m, f.key) !== null));
  const satirlar = [...veri.olcumler].reverse();
  const tablo = h(
    'div',
    { class: 'tablo-kap' },
    h(
      'table',
      { class: 'tablo' },
      h(
        'thead',
        null,
        h('tr', null, h('th', null, 'Tarih'), kullanilan.map((f) => h('th', { class: 'sayi' }, `${f.label}${f.unit ? ` (${f.unit})` : ''}`)), h('th', null, 'Kaynak'), h('th', null, '')),
      ),
      h(
        'tbody',
        null,
        satirlar.map((m) =>
          h(
            'tr',
            null,
            h('td', null, tarih(m.tarih)),
            kullanilan.map((f) => h('td', { class: 'sayi' }, sayi(deger(m, f.key)))),
            h('td', null, m.kaynak === 'klinik' ? 'Klinik ölçümü' : m.kaynak === 'kayit' ? 'Kayıt bilgisi' : 'Kendi girişim'),
            h(
              'td',
              null,
              m.kaynak === 'danisan'
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'metin-dugme',
                      onclick: async () => {
                        const ok = await pencere({
                          baslik: 'Ölçümü Sil',
                          icerik: h('p', null, `${tarih(m.tarih)} tarihli ölçüm silinsin mi?`),
                          kaydet: 'Sil',
                          tehlikeli: true,
                          onKaydet: async () => {
                            await api('DELETE', `/olcum/${m.id}`);
                          },
                        });
                        if (ok) {
                          toast('Ölçüm silindi.');
                          yenile();
                        }
                      },
                    },
                    'Sil',
                  )
                : null,
            ),
          ),
        ),
      ),
    ),
  );
  return [
    baslik(
      'Ölçümlerim',
      'Klinik ölçümleri diyetisyeniniz ekler. Evde tartıldığınızda kilo, bel ve kalça ölçünüzü kendiniz ekleyebilirsiniz.',
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: olcumEkle }, 'Ölçüm Ekle'),
    ),
    h('div', { class: 'kart' }, veri.olcumler.length ? tablo : h('p', { class: 'bos' }, 'Henüz ölçüm yok.')),
  ];
}

async function olcumEkle() {
  const tarihInput = h('input', { class: 'input', type: 'date', name: 'tarih', value: bugun(), max: bugun(), required: true, 'data-alan': 'Tarih' });
  const alanlar = danisanOlcumAlanlari.map((k) => {
    const f = alanTanim[k];
    return alan(`${f.label} (${f.unit})`, h('input', { class: 'input', name: `degerler.${k}`, inputmode: 'decimal', 'data-alan': f.label }));
  });
  const ok = await pencere({
    baslik: 'Ölçüm Ekle',
    icerik: h('div', { class: 'form-grid' }, alan('Tarih', tarihInput), h('div', { class: 'form-grid uc' }, alanlar)),
    onKaydet: async (form) => {
      const d = formNesnesi(form);
      await api('POST', '/olcum', d);
    },
  });
  if (ok) {
    toast('Ölçümünüz eklendi.');
    yenile();
  }
}

// ============================================================== Paketler

function paketBolumu(): Node[] {
  const aboneler = veri.aboneliklerim.length
    ? h(
        'ul',
        { class: 'liste' },
        veri.aboneliklerim.map((a) =>
          h(
            'li',
            null,
            h(
              'div',
              { class: 'ana' },
              h('strong', null, a.paketAdi),
              h(
                'span',
                null,
                a.baslangic ? `${tarih(a.baslangic)}${a.bitis ? ` – ${tarih(a.bitis)}` : ''}` : `Talep: ${tarih(a.tarih)}`,
                a.fiyat !== null ? ` · ${para(a.fiyat)}` : '',
              ),
              a.odemeNotu ? h('p', null, a.odemeNotu) : null,
            ),
            durumEtiketi(a.durum, paketDurumlari),
          ),
        ),
      )
    : h('p', { class: 'bos' }, 'Henüz paket kaydınız yok.');
  const katalog = veri.paketler.length
    ? h(
        'div',
        { class: 'izgara' },
        veri.paketler.map((p) =>
          h(
            'div',
            { class: 'kart' },
            h('h3', { style: 'font-family:var(--font-serif);font-size:1.2rem' }, p.ad),
            p.sure ? h('p', { class: 'chip' }, p.sure) : null,
            p.ozet ? h('p', null, p.ozet) : null,
            p.icerik.length ? h('ul', null, p.icerik.map((i) => h('li', null, i))) : null,
            p.fiyat !== null ? h('p', { class: 'gosterge' }, h('span', { class: 'deger', style: 'font-size:1.4rem' }, para(p.fiyat))) : null,
            h('button', { type: 'button', class: 'btn btn-primary btn-sm btn-block', onclick: () => paketSec(p) }, 'Bu Paketi Seç'),
          ),
        ),
      )
    : h('p', { class: 'bos' }, 'Paketler yakında burada listelenecek. Bilgi almak için diyetisyeninize yazabilirsiniz.');
  return [
    baslik('Paketim', 'Sahip olduğunuz paketler ve seçebileceğiniz paketler.'),
    h('div', { class: 'kart' }, h('h2', null, 'Paketlerim'), aboneler),
    h('div', { class: 'kart' }, h('h2', null, 'Paketler'), katalog),
  ];
}

async function paketSec(p: Panel['paketler'][number]) {
  const ok = await pencere({
    baslik: p.ad,
    kaydet: 'Paket Talebi Gönder',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h(
        'p',
        { class: 'bilgi-kutu' },
        'Talebiniz diyetisyeninize iletilir. Ödeme ve başlangıç bilgileri size ayrıca bildirilir; paketiniz onaydan sonra aktif olur.',
      ),
      alan('Not (isteğe bağlı)', h('textarea', { class: 'textarea', name: 'not', maxlength: 500, 'data-alan': 'Not' })),
    ),
    onKaydet: async (form) => {
      await api('POST', '/paket-talebi', { paketId: p.id, not: formNesnesi(form).not });
    },
  });
  if (ok) {
    toast('Paket talebiniz alındı.');
    location.hash = 'paketim';
    yenile();
  }
}

// ============================================================== Randevular

function randevuBolumu(): Node[] {
  const b = bugun();
  const gelecek = veri.randevular.filter((r) => r.tarih >= b && r.durum !== 'iptal').sort((x, y) => (x.tarih + x.saat).localeCompare(y.tarih + y.saat));
  const gecmis = veri.randevular.filter((r) => !gelecek.includes(r));
  const satir = (r: Panel['randevular'][number], iptalEdilebilir: boolean) =>
    h(
      'li',
      null,
      h('div', { class: 'ana' }, h('strong', null, `${tarih(r.tarih, true)} · ${r.saat}`), h('span', null, turAdi(r.tur)), r.not ? h('p', null, r.not) : null),
      h(
        'div',
        { class: 'eylemler' },
        durumEtiketi(r.durum, randevuDurumlari),
        iptalEdilebilir
          ? h(
              'button',
              {
                type: 'button',
                class: 'metin-dugme',
                onclick: async () => {
                  const ok = await pencere({
                    baslik: 'Randevuyu İptal Et',
                    icerik: h('p', null, `${tarih(r.tarih)} ${r.saat} randevunuz iptal edilsin mi?`),
                    kaydet: 'İptal Et',
                    tehlikeli: true,
                    onKaydet: async () => {
                      await api('POST', `/randevu/${r.id}/iptal`);
                    },
                  });
                  if (ok) {
                    toast('Randevunuz iptal edildi.');
                    yenile();
                  }
                },
              },
              'İptal Et',
            )
          : null,
      ),
    );
  return [
    baslik(
      'Randevularım',
      'Seçtiğiniz gün ve saat bir taleptir; randevunuz onaylandıktan sonra kesinleşir.',
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: randevuTalebi }, 'Randevu Talebi Oluştur'),
    ),
    h('div', { class: 'kart' }, h('h2', null, 'Yaklaşan'), gelecek.length ? h('ul', { class: 'liste' }, gelecek.map((r) => satir(r, true))) : h('p', { class: 'bos' }, 'Yaklaşan randevunuz yok.')),
    gecmis.length ? h('div', { class: 'kart' }, h('h2', null, 'Geçmiş ve İptal Edilenler'), h('ul', { class: 'liste' }, gecmis.map((r) => satir(r, false)))) : null,
  ].filter(Boolean) as Node[];
}

async function randevuTalebi() {
  const bitis = new Date(Date.parse(`${bugun()}T00:00:00Z`) + veri.takvim.ileriGun * 86_400_000).toISOString().slice(0, 10);
  const tarihInput = h('input', { class: 'input', type: 'date', name: 'tarih', min: bugun(), max: bitis, required: true, 'data-alan': 'Tarih' });
  const saat = h('select', { class: 'select', name: 'saat', required: true, 'data-alan': 'Saat', disabled: true }, h('option', { value: '' }, 'Önce tarih seçin'));
  tarihInput.addEventListener('change', async () => {
    saat.disabled = true;
    saat.replaceChildren(h('option', { value: '' }, 'Yükleniyor…'));
    try {
      const r = await api<{ saatler: { saat: string; dolu: boolean }[] }>('GET', `/musait?tarih=${tarihInput.value}`);
      const bos = r.saatler.filter((s) => !s.dolu);
      saat.replaceChildren(
        h('option', { value: '' }, bos.length ? 'Saat seçin' : 'Bu gün için uygun saat yok'),
        ...r.saatler.map((s) => h('option', { value: s.saat, disabled: s.dolu }, s.dolu ? `${s.saat} (dolu)` : s.saat)),
      );
      saat.disabled = !bos.length;
    } catch (e) {
      saat.replaceChildren(h('option', { value: '' }, (e as Error).message));
    }
  });
  const ok = await pencere({
    baslik: 'Randevu Talebi Oluştur',
    kaydet: 'Talebi Gönder',
    icerik: h(
      'div',
      { class: 'form-grid' },
      h('p', { class: 'bilgi-kutu' }, 'Seçiminiz bir tercihtir; randevunuz onaylandıktan sonra kesinleşir. Pazar günleri ve resmî tatillerde kapalıyız.'),
      h(
        'div',
        { class: 'field' },
        h('p', { class: 'label' }, 'Görüşme Türü'),
        h(
          'div',
          { class: 'secim-grup', 'data-alan': 'Görüşme türü', tabindex: '-1' },
          h('label', { class: 'secim' }, h('input', { type: 'radio', name: 'tur', value: 'yuz-yuze', checked: true }), 'Yüz Yüze'),
          h('label', { class: 'secim' }, h('input', { type: 'radio', name: 'tur', value: 'online' }), 'Online'),
        ),
      ),
      h('div', { class: 'form-grid iki' }, alan('Tarih', tarihInput), alan('Saat', saat)),
      alan('Not (isteğe bağlı)', h('textarea', { class: 'textarea', name: 'not', maxlength: 500, 'data-alan': 'Not' })),
    ),
    onKaydet: async (form) => {
      await api('POST', '/randevu', formNesnesi(form));
    },
  });
  if (ok) {
    toast('Randevu talebiniz alındı.');
    yenile();
  }
}

// ============================================================== Belgeler

function belgeBolumu(): Node[] {
  const liste = veri.belgeler.length
    ? h(
        'ul',
        { class: 'liste' },
        veri.belgeler.map((b) =>
          h(
            'li',
            null,
            h(
              'div',
              { class: 'ana' },
              h('strong', null, b.baslik),
              h('span', null, `${tarih(b.tarih)} · ${b.tur} · ${boyut(b.boyut)} · ${b.yukleyen === 'danisan' ? 'Sizin yüklediğiniz' : 'Diyetisyeniniz ekledi'}`),
            ),
            h('a', { class: 'btn btn-outline btn-xs', href: `/api/portal/belge/${b.id}`, target: '_blank', rel: 'noopener' }, 'Aç'),
          ),
        ),
      )
    : h('p', { class: 'bos' }, 'Henüz belge yok. Beslenme planlarınız ve diyetisyeninizin paylaştığı belgeler burada görünür.');

  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h('div', { class: 'form-grid iki' }, alan('Belge Adı', h('input', { class: 'input', name: 'baslik', maxlength: 120, placeholder: 'Örn. Kan tahlili – Ekim 2026', 'data-alan': 'Belge adı' })), alan('Dosya (PDF, JPG, PNG, WEBP · en fazla 10 MB)', h('input', { class: 'input', type: 'file', name: 'dosya', accept: Object.keys(belgeSiniri.turler).join(','), required: true }))),
    h('button', { type: 'submit', class: 'btn btn-sage btn-sm' }, 'Yükle'),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    const fd = new FormData(form);
    const dosya = fd.get('dosya') as File | null;
    if (!dosya || !dosya.size) return formHatasi(form, new ApiError(400, 'Bir dosya seçin.'));
    if (dosya.size > belgeSiniri.enFazlaBayt) return formHatasi(form, new ApiError(400, 'Dosya en fazla 10 MB olabilir.'));
    mesgul(form.querySelector('button'), async () => {
      try {
        await api('POST', '/belge', fd);
        toast('Belgeniz yüklendi.');
        yenile();
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  return [
    baslik('Belgelerim', 'Beslenme planlarınız, raporlar ve paylaştığınız tahliller.'),
    h('div', { class: 'kart' }, liste),
    h(
      'div',
      { class: 'kart' },
      h('h2', null, 'Belge Yükle (İsteğe Bağlı)'),
      h(
        'p',
        { class: 'bilgi-kutu' },
        'Mevcut sağlık raporlarınızı ve yakın tarihli tahlil sonuçlarınızı paylaşmayı tercih ederseniz buradan yükleyebilirsiniz. Belgeler şifrelenerek saklanır ve yalnızca diyetisyeniniz görür. Tıbbi değerlendirme gerektiren durumlarda hekime yönlendirilirsiniz.',
      ),
      form,
    ),
  ];
}

// ============================================================== Mesajlar

function mesajBolumu(): Node[] {
  return [
    baslik('Mesajlar', 'Diyetisyeninizden gelen mesajlar, duyurular ve hatırlatmalar.'),
    h(
      'div',
      { class: 'kart' },
      veri.mesajlar.length
        ? h(
            'ul',
            { class: 'liste' },
            veri.mesajlar.map((m) =>
              h(
                'li',
                { class: `mesaj${m.okundu ? '' : ' okunmadi'}` },
                h('div', { class: 'ana' }, h('strong', null, m.baslik), h('span', null, `${tarihSaat(m.tarih)} · ${m.tur === 'duyuru' ? 'Duyuru' : m.tur === 'hatirlatma' ? 'Hatırlatma' : 'Mesaj'}`), h('p', null, m.metin)),
              ),
            ),
          )
        : h('p', { class: 'bos' }, 'Henüz mesaj yok.'),
      h(
        'p',
        { class: 'form-alt' },
        'Diyetisyeninize yazmak için: ',
        h('a', { href: whatsapp(veri.whatsapp.replace(/^90/, ''), 'Merhaba, danışan panelinden yazıyorum.'), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
      ),
    ),
  ];
}

async function okunduIsaretle() {
  const yeni = veri.mesajlar.filter((m) => !m.okundu);
  for (const m of yeni) {
    await api('POST', `/mesaj/${m.id}/okundu`).catch(() => {});
    m.okundu = true;
  }
  if (yeni.length) {
    const rozet = document.querySelector('.panel-menu .rozet');
    rozet?.remove();
  }
}

// ============================================================== Profil

function secenekler(liste: string[], secili: string, bos = 'Seçin') {
  return [h('option', { value: '' }, bos), ...liste.map((s) => h('option', { value: s, selected: s === secili ? true : null }, s))];
}

function profilBolumu(): Node[] {
  const p = veri.profil;
  const sg = p.saglik ?? {};
  const inp = (name: string, value: any, extra: Record<string, any> = {}) => h('input', { class: 'input', name, value: value ?? '', ...extra });
  const form = h(
    'form',
    { novalidate: true, class: 'form-grid' },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h('h2', null, 'Kişisel Bilgiler'),
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Doğum Tarihi', inp('dogumTarihi', p.dogumTarihi, { type: 'date', max: bugun(), 'data-alan': 'Doğum tarihi' })),
      alan('Cinsiyet', h('select', { class: 'select', name: 'cinsiyet', 'data-alan': 'Cinsiyet' }, secenekler(['Kadın', 'Erkek'], p.cinsiyet))),
      alan('Yaşadığınız Şehir', h('select', { class: 'select', name: 'sehir', 'data-alan': 'Yaşadığınız şehir' }, secenekler(sehirler, p.sehir))),
      alan('Meslek', inp('meslek', p.meslek, { maxlength: 80, 'data-alan': 'Meslek' })),
    ),
    h('h2', null, 'Hedef ve Ölçüler'),
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Boy (cm)', inp('boy', p.boy, { inputmode: 'decimal', 'data-alan': 'Boy' })),
      alan('Hedef Kilo (kg)', inp('hedefKilo', p.hedefKilo, { inputmode: 'decimal', 'data-alan': 'Hedef kilo' })),
      alan('Hedefiniz', h('select', { class: 'select', name: 'hedef', 'data-alan': 'Hedefiniz' }, secenekler(hedefSecenekleri, p.hedef))),
      alan('Günlük Hareket Düzeyi', h('select', { class: 'select', name: 'aktivite', 'data-alan': 'Günlük hareket düzeyi' }, secenekler(aktiviteSecenekleri, p.aktivite))),
    ),
    h('h2', null, 'Sağlık Bilgileri'),
    h(
      'div',
      { class: 'field' },
      h('p', { class: 'label' }, 'Tanı Konmuş Hastalıklarınız'),
      h(
        'div',
        { class: 'secim-grup' },
        hastalikSecenekleri.map((s) =>
          h('label', { class: 'secim' }, h('input', { type: 'checkbox', name: 'saglik.hastaliklar[]', value: s, checked: (sg.hastaliklar ?? []).includes(s) }), s),
        ),
      ),
    ),
    alan('Diğer Hastalıklar', inp('saglik.digerHastalik', sg.digerHastalik, { maxlength: 300, 'data-alan': 'Diğer hastalıklar' })),
    alan('Kullandığınız İlaç ve Takviyeler', h('textarea', { class: 'textarea', name: 'saglik.ilaclar', maxlength: 600, 'data-alan': 'Kullandığınız ilaç ve takviyeler' }, sg.ilaclar ?? '')),
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Besin Alerjileri', inp('saglik.alerjiler', sg.alerjiler, { maxlength: 400, 'data-alan': 'Besin alerjileri' })),
      alan('Besin İntoleransları', inp('saglik.intoleranslar', sg.intoleranslar, { maxlength: 400, 'data-alan': 'Besin intoleransları' })),
      alan('Gebelik / Emzirme', h('select', { class: 'select', name: 'saglik.gebelik', 'data-alan': 'Gebelik / emzirme' }, gebelikSecenekleri.map((s) => h('option', { value: s, selected: s === (sg.gebelik ?? 'Yok') ? true : null }, s)))),
      alan('Geçirilmiş Ameliyatlar', inp('saglik.ameliyatlar', sg.ameliyatlar, { maxlength: 400, 'data-alan': 'Geçirilmiş ameliyatlar' })),
    ),
    alan('Eklemek İstedikleriniz', h('textarea', { class: 'textarea', name: 'saglik.notlar', maxlength: 1000, 'data-alan': 'Eklemek istedikleriniz' }, sg.notlar ?? '')),
    h('div', null, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Kaydet')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    mesgul(form.querySelector<HTMLButtonElement>('button[type=submit]'), async () => {
      try {
        await api('PUT', '/profil', formNesnesi(form));
        toast('Bilgileriniz güncellendi.');
        yenile();
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  const u = veri.kullanici;
  return [
    baslik('Profilim', 'Bilgileriniz değiştiğinde güncel tutmanız, beslenme planınızın doğru hazırlanmasına yardımcı olur.'),
    h(
      'div',
      { class: 'kart' },
      h('h2', null, 'Hesap Bilgileri'),
      h('dl', { class: 'sabit-bilgi' }, h('dt', null, 'Ad Soyad'), h('dd', null, u.ad), h('dt', null, 'E-posta'), h('dd', null, u.eposta), h('dt', null, 'Telefon'), h('dd', null, `0${u.telefon}`)),
      h('p', { class: 'form-alt' }, 'Ad, e-posta veya telefon değişikliği için diyetisyeninizle iletişime geçin.'),
    ),
    h('div', { class: 'kart' }, form),
  ];
}

// ============================================================== Hesap ve gizlilik

function hesapBolumu(): Node[] {
  const sifreForm = h(
    'form',
    { novalidate: true, class: 'form-grid' },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Mevcut Şifre', h('input', { class: 'input', type: 'password', name: 'eski', autocomplete: 'current-password', 'data-alan': 'Mevcut şifre' })),
      alan('Yeni Şifre', h('input', { class: 'input', type: 'password', name: 'yeni', autocomplete: 'new-password', 'data-alan': 'Şifre' }), 'En az 8 karakter; en az bir harf ve bir rakam.'),
    ),
    h('div', null, h('button', { type: 'submit', class: 'btn btn-sage btn-sm' }, 'Şifreyi Değiştir')),
  );
  sifreForm.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(sifreForm);
    mesgul(sifreForm.querySelector('button'), async () => {
      try {
        await api('POST', '/sifre-degistir', formNesnesi(sifreForm));
        toast('Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.');
        sifreForm.reset();
      } catch (err) {
        formHatasi(sifreForm, err);
      }
    });
  });

  const silmeTalebiVar = veri.kullanici.durum === 'silme_talebi';
  const belgeler = ben.belgeler;
  return [
    baslik('Hesap ve Gizlilik', 'Şifreniz, verileriniz ve KVKK kapsamındaki haklarınız.'),
    h('div', { class: 'kart' }, h('h2', null, 'Şifre'), sifreForm),
    h(
      'div',
      { class: 'kart' },
      h('h2', null, 'Verileriniz ve Haklarınız'),
      h(
        'p',
        null,
        'Panelde sizinle ilgili tutulan tüm bilgileri indirebilirsiniz. KVKK md. 11 kapsamındaki haklarınız ',
        h('a', { href: belgeler.aydinlatma.yol, target: '_blank', rel: 'noopener' }, 'Aydınlatma Metni'),
        '’nde yer alır.',
      ),
      h('div', { class: 'eylemler' }, h('a', { class: 'btn btn-outline btn-sm', href: '/api/portal/verilerim', download: true }, 'Verilerimi İndir')),
      h(
        'ul',
        { class: 'form-alt' },
        Object.values(belgeler).map((b) => h('li', null, h('a', { href: b.yol, target: '_blank', rel: 'noopener' }, b.baslik))),
      ),
    ),
    h(
      'div',
      { class: 'kart' },
      h('h2', null, 'Açık Rızayı Geri Çekme'),
      h(
        'p',
        null,
        'Sağlık verilerinizin panelde işlenmesine verdiğiniz açık rızayı geri çekebilirsiniz. Bu durumda paneli yeniden onay verene kadar kullanamazsınız; beslenme danışmanlığı panel olmadan sürdürülebilir.',
      ),
      h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: rizaGeriCek }, 'Açık Rızamı Geri Çek'),
    ),
    h(
      'div',
      { class: 'kart' },
      h('h2', null, 'Hesabı Silme'),
      silmeTalebiVar
        ? [
            h('p', null, 'Silme talebiniz alındı. Hesabınız ve paneldeki verileriniz diyetisyeniniz tarafından silinecektir.'),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-outline btn-sm',
                onclick: async () => {
                  await api('POST', '/silme-talebi/iptal');
                  toast('Silme talebiniz geri alındı.');
                  yenile();
                },
              },
              'Talebimi Geri Al',
            ),
          ]
        : [
            h('p', null, 'Hesabınızın ve paneldeki verilerinizin silinmesini talep edebilirsiniz. Yasal saklama yükümlülüğü bulunan kayıtlar süresi boyunca saklanır.'),
            h('button', { type: 'button', class: 'btn btn-tehlike btn-sm', onclick: silmeTalebi }, 'Hesabımın Silinmesini İstiyorum'),
          ],
    ),
  ];
}

async function rizaGeriCek() {
  const ok = await pencere({
    baslik: 'Açık Rızamı Geri Çek',
    kaydet: 'Rızamı Geri Çek',
    tehlikeli: true,
    icerik: h(
      'p',
      null,
      'Rızanızı geri çektiğinizde panel kapanır ve sağlık verileriniz panelde işlenmez. Verilerinizin silinmesini ayrıca talep edebilirsiniz. Devam edilsin mi?',
    ),
    onKaydet: async () => {
      await api('POST', '/riza-geri-cek');
    },
  });
  if (ok) location.reload();
}

async function silmeTalebi() {
  const ok = await pencere({
    baslik: 'Hesap Silme Talebi',
    kaydet: 'Talebi Gönder',
    tehlikeli: true,
    icerik: h('p', null, 'Hesabınızın ve paneldeki verilerinizin silinmesi için talep oluşturulsun mu? Talebinizi işlem tamamlanana kadar geri alabilirsiniz.'),
    onKaydet: async () => {
      await api('POST', '/silme-talebi');
    },
  });
  if (ok) {
    toast('Silme talebiniz alındı.');
    if (veri) yenile();
    else location.reload();
  }
}

// ============================================================== Onay ekranı (metinler güncellendiğinde / rıza geri çekildiğinde)

function onayEkrani() {
  const form = h(
    'form',
    { novalidate: true, class: 'form-grid' },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    ben.onayGerekli.map((t) =>
      h(
        'label',
        { class: 'onay-satiri' },
        h('input', { type: 'checkbox', name: 'turler[]', value: t }),
        h(
          'span',
          null,
          h('a', { href: ben.belgeler[t].yol, target: '_blank', rel: 'noopener' }, ben.belgeler[t].baslik),
          t === 'aydinlatma' ? '’ni okudum.' : t === 'acikRiza' ? ' kapsamında açık rıza veriyorum.' : '’ni okudum ve kabul ediyorum.',
        ),
      ),
    ),
    h('div', { class: 'eylemler' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Onayla ve Devam Et'), h('button', { type: 'button', class: 'btn btn-outline', onclick: cikis }, 'Çıkış Yap')),
  );
  const silmeKutusu =
    ben.kullanici.durum === 'riza_geri_cekildi'
      ? h(
          'div',
          { class: 'form-alt' },
          h('p', null, 'Panelde kayıtlı verilerinizin silinmesini istiyorsanız talep oluşturabilirsiniz.'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-tehlike btn-sm',
              onclick: async () => {
                await silmeTalebi();
              },
            },
            'Verilerimin Silinmesini İstiyorum',
          ),
        )
      : ben.kullanici.durum === 'silme_talebi'
        ? h('p', { class: 'bilgi-kutu' }, 'Silme talebiniz alındı; hesabınız ve verileriniz diyetisyeniniz tarafından silinecektir.')
        : null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    const turler = formNesnesi(form).turler ?? [];
    if (turler.length !== ben.onayGerekli.length) return formHatasi(form, new ApiError(400, 'Devam etmek için tüm metinleri onaylayın.'));
    mesgul(form.querySelector('button'), async () => {
      try {
        await api('POST', '/onay', { turler });
        location.reload();
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  const geriCekildi = ben.kullanici.durum === 'riza_geri_cekildi';
  app.replaceChildren(
    h(
      'div',
      { class: 'auth genis' },
      h(
        'div',
        { class: 'card auth-kart' },
        h('h1', null, geriCekildi ? 'Panel Kapalı' : 'Güncellenen Metinler'),
        h(
          'p',
          null,
          geriCekildi
            ? 'Açık rızanızı geri çektiğiniz için panel kapalı. Paneli yeniden kullanmak isterseniz aşağıdaki metni onaylayabilirsiniz. Verilerinizin silinmesini istiyorsanız diyetisyeninize iletebilirsiniz.'
            : 'Kişisel verilerinizle ilgili metinlerimiz güncellendi. Paneli kullanmaya devam etmek için lütfen okuyup onaylayın.',
        ),
        form,
        silmeKutusu,
      ),
    ),
  );
}

basla();
