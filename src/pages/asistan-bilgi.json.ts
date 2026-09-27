// Site asistanının bilgi dosyası (/asistan-bilgi.json).
// Site her derlendiğinde sitedeki güncel bilgilerden otomatik oluşturulur; elle düzenlemeye gerek yoktur.
// Cloudflare Worker (worker/index.ts) yapay zekâya bu dosyadaki talimatları gönderir.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { site, fullAddress } from '../data/site';
import { serviceCategories, allServices } from '../data/services';
import { processSteps } from '../data/process';
import { onlineSteps, onlinePrepare, onlineTech, onlineFaqs } from '../data/online-gorusme';
import { certificateGroups } from '../data/certificates';
import {
  actionDefs,
  assistantExamples,
  assistantPages,
  assistantRules,
  hoursSummary,
  quickReplies,
} from '../data/assistant';

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog')).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const pages: Record<string, string> = {
    ...assistantPages,
    ...Object.fromEntries(posts.map((p) => [`/blog/${p.id}/`, `Blog: ${p.data.title}`])),
  };

  const certCount = certificateGroups.reduce(
    (n, g) => n + g.sets.reduce((m, s) => m + s.items.length, 0),
    0,
  );

  const knowledge = [
    'SİTE BİLGİLERİ',
    '',
    'KLİNİK VE DİYETİSYEN',
    `- ${site.name}, İzmir Katip Çelebi Üniversitesi Sağlık Bilimleri Fakültesi Beslenme ve Diyetetik Bölümü mezunudur (lisans, 2022).`,
    `- ${site.clinicName} (Seyhan/Adana) bünyesinde yüz yüze, ${site.onlinePlatform} ile de online beslenme danışmanlığı verir.`,
    '- Yaklaşım: bilimsel temelli, kişiye özel (yaşam tarzı, damak tadı, sağlık durumu ve hedefler birlikte değerlendirilir), sürdürülebilir (yasaklar yerine uzun vadede uygulanabilir dengeli alışkanlıklar) ve düzenli takip.',
    `- Sertifikalar sayfasında lisans diploması ile katıldığı eğitim, kongre ve seminerlere ait toplam ${certCount} belge yer alır. Gruplar: ${certificateGroups.map((g) => g.title).join(', ')}.`,
    '',
    'İLETİŞİM VE ÇALIŞMA SAATLERİ',
    `- Telefon ve WhatsApp: ${site.phoneDisplay}`,
    `- E-posta: ${site.email}`,
    `- Adres: ${fullAddress}`,
    `- Çalışma saatleri: ${hoursSummary()}.`,
    `- Instagram: ${site.instagramHandle}`,
    '',
    'GÖRÜŞME YÖNTEMLERİ',
    '- Yüz yüze: Seyhan/Adana’daki klinikte.',
    `- Online: ${site.onlinePlatform}; Türkiye’nin her yerinden ve yurt dışından yapılabilir.`,
    '',
    'SÜREÇ',
    ...processSteps.map((s, i) => `${i + 1}. ${s.title}: ${s.text}`),
    '',
    'RANDEVU',
    '- Randevu Oluştur sayfasındaki formda ad soyad, telefon, görüşme türü (yüz yüze/online), ilgilenilen konu ve tercih edilen gün/saat seçilir; bilgiler hazır bir WhatsApp mesajına dönüştürülür ve kişi mesajı gönderdiğinde kliniğe ulaşır. Form bilgileri sitede saklanmaz.',
    '- Doğrudan WhatsApp’tan yazmak veya telefonla aramak da mümkündür.',
    '',
    'ONLINE GÖRÜŞME',
    ...onlineSteps.map((s, i) => `${i + 1}. ${s.title}: ${s.text}`),
    `- Görüşmeden önce hazırlanması önerilenler: ${onlinePrepare.join('; ')}.`,
    `- Gerekenler: ${onlineTech.map((t) => t.text).join('; ')}.`,
    ...onlineFaqs.map((f) => `- Soru: ${f.q} Cevap: ${f.a}`),
    '',
    'ÜCRET',
    '- Sitede ücret bilgisi yer almaz. Görüşme ücreti ve ödeme bilgileri randevu netleştiğinde kişiye ayrıca iletilir.',
    '',
    'HİZMETLER (randevu etiketlerinde bu adları birebir kullan)',
    ...serviceCategories.flatMap((c) => [
      `${c.title}: ${c.intro}`,
      ...c.services.map((s) => `- ${s.name}: ${s.description}`),
    ]),
    '',
    'VÜCUT KİTLE İNDEKSİ (VKİ)',
    '- VKİ hesaplama sayfasında boy ve kilo girilerek VKİ değeri ve kategorisi öğrenilebilir; bilgiler cihazda hesaplanır, hiçbir yere gönderilmez. Sonuç fazla kilolu veya üstü çıkarsa sayfa randevuya yönlendirir.',
    '',
    'BLOG YAZILARI',
    ...posts.map((p) => `- ${p.data.title} (/blog/${p.id}/): ${p.data.description}`),
    '',
    'SAYFALAR (sayfa etiketlerinde yalnızca bu yolları kullan)',
    ...Object.entries(pages).map(([path, title]) => `- ${path} ${title}`),
    '',
    'SIK SORULANLAR (hazır cevaplar)',
    ...quickReplies.map((r) => `- ${r.q} → ${r.a.replace(/\n/g, ' ')}`),
  ].join('\n');

  const body = {
    version: new Date().toISOString(),
    system: `${assistantRules}\n\n${knowledge}\n\n${assistantExamples}`,
    actions: actionDefs,
    services: allServices.map((s) => s.name),
    pages,
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
