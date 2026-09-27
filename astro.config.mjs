// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sitenin yayındaki adresi (SEO, sitemap ve paylaşım görselleri için kullanılır)
export default defineConfig({
  site: 'https://www.diyetisyeneylemdizman.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
});
