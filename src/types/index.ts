import type { CollectionEntry } from 'astro:content';

export type Decoration = CollectionEntry<'decorations'>['data'];
export type Category = CollectionEntry<'categories'>['data'];

/** One decoration in the Recently Added panel. */
export interface ChangeLogEntry {
  id: number;
  name: string;
}

/** The decorations first added on one day. */
export interface ChangeLogDay {
  day: string;
  entries: ChangeLogEntry[];
}

export type DecorationRecipe = NonNullable<Decoration['recipe']>;
export type DecorationRecipeIngredient = DecorationRecipe['ingredients'][number];
