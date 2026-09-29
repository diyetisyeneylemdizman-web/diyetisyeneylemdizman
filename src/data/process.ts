// Ana sayfadaki "Süreç nasıl işler?" adımları. Site asistanı da bu bilgileri kullanır.

export const processSteps = [
  {
    icon: 'calendar',
    title: 'Randevu talebi',
    text: 'Takvimden uygun gün ve saat seçilir; randevu talebi WhatsApp üzerinden iletilir ve onaydan sonra kesinleşir.',
  },
  {
    icon: 'consult',
    title: 'Tanışma ve değerlendirme',
    text: 'Beslenme alışkanlıkları, sağlık geçmişi ve hedefler konuşulur; uygun olduğunda vücut bileşimi ölçümüyle başlangıç noktası belirlenir.',
  },
  {
    icon: 'clipboard',
    title: 'Kişiye özel beslenme planı',
    text: 'Günlük rutine ve kişisel ihtiyaçlara uygun, uygulanabilir bir beslenme planı hazırlanır.',
  },
  {
    icon: 'chart',
    title: 'Düzenli takip',
    text: 'Süreç kontrol görüşmeleriyle izlenir; plan ihtiyaçlara göre güncellenir.',
  },
] as const;
