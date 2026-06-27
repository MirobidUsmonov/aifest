import { defineCollection, z } from 'astro:content';

const speakers = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    role: z.string(),
    company: z.string(),
    photo: z.string(),
    talk: z.string(),
    order: z.number().default(99),
  }),
});

export const collections = { speakers };
