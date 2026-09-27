// Sertifika görselleri src/assets/sertifikalar klasörüne eklenir (jpg, png veya webp).
// Dosya adı sıralamayı belirler (ör. 01-....jpg, 02-....jpg).
// İstenirse aşağıya dosya adına göre başlık, kurum ve yıl bilgisi yazılabilir.

export type CertificateInfo = { title: string; institution?: string; year?: string };

export const certificateInfo: Record<string, CertificateInfo> = {
  // 'ornek-sertifika.jpg': { title: 'Sertifika adı', institution: 'Kurum', year: '2024' },
};
