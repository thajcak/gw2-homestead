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

const decorationSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().default(''),
  categories: z.array(z.number()),
  icon: z.string(),
  /** The GW2 API's icon URL; a change re-downloads the local icon. */
  iconSource: z.string().optional(),
  wikiTitle: z.string().optional(),
  recipe: decorationRecipeSchema.nullable().optional(),
  original: imageSchema.optional(),
  /** Day the decoration first appeared. What happened since is in src/data/changes/. */
  added: z.string().optional(),
  /** Day a removal was confirmed (the API stopped listing it on two runs in a row). */
  removed: z.string().optional(),
  /** Day the GW2 API first stopped listing this item; it is removed if the next run agrees. */
  missingSince: z.string().optional(),
  /** Day the pinned wiki page first reported no preview image. */
  previewMissingSince: z.string().optional(),
});

const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  added: z.string().optional(),
  removed: z.string().optional(),
  missingSince: z.string().optional(),
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
