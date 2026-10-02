// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { sunucuAcik } from './src/data/portal.ts';

// Sitenin yayındaki adresi (SEO, sitemap ve paylaşım görselleri için kullanılır)
export default defineConfig({
  site: 'https://www.diyetisyeneylemdizman.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      // Danışan ve diyetisyen panelleri arama motorlarına kapalıdır; Takibim kapalıyken Takibim metinleri yönlendirme sayfasıdır
      filter: (page) =>
        !page.includes('/404') &&
        !page.includes('/danisan/') &&
        !page.includes('/yonetim/') &&
        !page.includes('/takibim/') &&
        (sunucuAcik || (!page.includes('/acik-riza-metni/') && !page.includes('/danisan-sozlesmesi/'))),
    }),
  ],
});
