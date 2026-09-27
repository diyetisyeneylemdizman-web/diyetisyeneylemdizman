import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Blog yazıları: src/content/blog klasörüne eklenen her .md dosyası otomatik olarak yayınlanır.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    category: z.string(),
    tone: z.enum(['sage', 'beige', 'terracotta']).default('sage'),
    icon: z.enum(['leaf', 'heart', 'bloom', 'scale', 'chart', 'flask', 'clipboard']).default('leaf'),
    relatedService: z.string().optional(),
  }),
});

export const collections = { blog };
