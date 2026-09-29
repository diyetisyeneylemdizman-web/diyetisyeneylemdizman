// Site asistanının bilgi dosyası (/asistan-bilgi.json).
// Site her derlendiğinde src/data/assistant.ts, hizmetler ve blog yazılarından otomatik oluşturulur; elle düzenlemeye
// gerek yoktur. Asistan penceresi açıldığında tarayıcı bu dosyayı bir kez indirir; eşleştirme tarayıcıda yapılır.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { allServices } from '../data/services';
import {
  assistantPages,
  emergency,
  fallback,
  fold,
  greeting,
  personal,
  resolveAction,
  sensitive,
  serviceKeywords,
  serviceNotes,
  thanks,
  topics,
  type AssistantAction,
  type ResolvedAction,
  type Topic,
} from '../data/assistant';

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog')).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const pages: Record<string, string> = {
    ...assistantPages,
    ...Object.fromEntries(posts.map((p) => [`/blog/${p.id}/`, `Yazı: ${p.data.title}`])),
  };
  const serviceNames = allServices.map((s) => s.name);

  const resolve = (tags: AssistantAction[] = []) =>
    tags.map((t) => resolveAction(t, pages, serviceNames)).filter((a): a is ResolvedAction => Boolean(a));

  const keywords = (list: string[]) => [...new Set(list.map(fold).filter((k) => k.length >= 2))];

  const pack = (t: Topic, kind: string, extra: Partial<{ a: string; actions: ResolvedAction[] }> = {}) => ({
    id: t.id,
    kind,
    q: t.q ?? '',
    a: extra.a ?? t.a,
    actions: extra.actions ?? resolve(t.actions),
    k: keywords(t.k),
  });

  for (const name of Object.keys(serviceKeywords)) {
    if (!serviceNames.includes(name)) console.warn(`[asistan] serviceKeywords içinde bilinmeyen hizmet: ${name}`);
  }

  const topicIntents = topics.map((t) => {
    if (t.id === 'blog' && posts.length) {
      return pack(t, 'topic', {
        a: `${t.a}\nSon yazılar:\n${posts.map((p) => `- ${p.data.title}`).join('\n')}`,
      });
    }
    return pack(t, 'topic');
  });

  const serviceIntents = allServices.map((s) => {
    const note = serviceNotes[s.name] ?? {};
    const post = posts.find((p) => p.data.relatedService === s.name);
    const a = [
      `${s.name}: ${s.description}`,
      note.extra ?? '',
      note.noOnline || /online/i.test(s.name) ? '' : 'Yüz yüze veya online olarak destek alınabilir.',
    ]
      .filter(Boolean)
      .join(' ');
    const actions = resolve([
      `randevu:${s.name}`,
      post ? (`sayfa:/blog/${post.id}/` as const) : 'sayfa:/hizmetler/',
    ]);
    return {
      id: `hizmet-${s.slug}`,
      kind: 'service',
      q: s.name,
      a,
      actions,
      k: keywords([s.name, ...(serviceKeywords[s.name] ?? [])]),
    };
  });

  const body = {
    version: new Date().toISOString(),
    chips: topics.filter((t) => t.chip).map((t) => t.id),
    intents: [...topicIntents, ...serviceIntents],
    special: {
      emergency: pack(emergency, 'emergency'),
      sensitive: pack(sensitive, 'sensitive'),
      personal: pack(personal, 'personal'),
      greeting: pack(greeting, 'greeting'),
      thanks: pack(thanks, 'thanks'),
      fallback: pack(fallback, 'fallback'),
    },
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
