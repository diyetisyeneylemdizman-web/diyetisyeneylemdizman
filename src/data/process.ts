// Ana sayfadaki "Süreç nasıl işler?" adımları. Site asistanı da bu bilgileri kullanır.

export const processSteps = [
  {
    icon: 'calendar',
    title: 'Randevunuzu oluşturun',
    text: 'Takvimden size uygun gün ve saati seçin, talebiniz WhatsApp üzerinden bize ulaşsın. Randevunuzu birlikte onaylayalım.',
  },
  {
    icon: 'consult',
    title: 'Tanışma ve değerlendirme',
    text: 'Beslenme alışkanlıklarınızı, sağlık geçmişinizi ve hedeflerinizi konuşuyor; vücut analiziyle başlangıç noktanızı belirliyoruz.',
  },
  {
    icon: 'clipboard',
    title: 'Size özel beslenme planı',
    text: 'Günlük rutininize, damak tadınıza ve ihtiyaçlarınıza uygun, uygulanabilir bir plan hazırlıyoruz.',
  },
  {
    icon: 'chart',
    title: 'Düzenli takip',
    text: 'Kontrol görüşmeleriyle sürecinizi izliyor, planınızı ihtiyaçlarınıza göre güncelliyoruz.',
  },
] as const;
