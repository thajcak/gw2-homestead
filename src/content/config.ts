import { defineCollection, z } from 'astro:content';

const imageSchema = z.object({
  source: z.string(),
  width: z.number(),
  height: z.number(),
  /** Remote wiki URL retained for CI sync and changelog diffs only. */
  remoteSource: z.string().optional(),
});

const decorationRecipeIngredientSchema = z.object({
  slot: z.number(),
  quantity: z.number().nullable(),
  item: z.string(),
});

const decorationRecipeSchema = z.object({
  name: z.string().optional(),
  source: z.string().optional(),
  sheet: z.string().optional(),
  type: z.string().optional(),
  disciplines: z.string().optional(),
  rating: z.number().optional(),
  id: z.union([z.number(), z.string()]).optional(),
  quantity: z.number().optional(),
  upper_quantity: z.number().optional(),
  guild_upgrade: z.string().optional(),
  timegate: z.boolean().optional(),
  ingredients: z.array(decorationRecipeIngredientSchema),
});

const changeLogEntryTypeSchema = z.enum([
  'New Item',
  'Item Updated',
  'Item Removed',
  'Image Updated',
  'Recipe Updated',
]);

const changeLogFieldChangeSchema = z.object({
  field: z.string(),
  detail: z.string().optional(),
  before: z.unknown(),
  after: z.unknown(),
});

const historyEntrySchema = z.object({
  day: z.string(),
  type: changeLogEntryTypeSchema,
  name: z.string(),
  changes: z.array(changeLogFieldChangeSchema).optional(),
});

const decorationSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  categories: z.array(z.number()),
  icon: z.string(),
  wikiTitle: z.string().optional(),
  recipe: decorationRecipeSchema.nullable().optional(),
  original: imageSchema.optional(),
  history: z.array(historyEntrySchema).default([]),
});

const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  history: z.array(historyEntrySchema).default([]),
});

const decorations = defineCollection({
  type: 'data',
  schema: decorationSchema,
});

const categories = defineCollection({
  type: 'data',
  schema: categorySchema,
});

export const collections = {
  decorations,
  categories,
};
