import type { CollectionEntry } from 'astro:content';
import type { SpriteRef } from '../utils/sprite';

export type Decoration = CollectionEntry<'decorations'>['data'];
export type Category = CollectionEntry<'categories'>['data'];

/** One decoration in the Recently Added panel. */
export interface ChangeLogEntry {
  id: number;
  name: string;
  sprite?: SpriteRef;
}

/** The decorations first added on one day. */
export interface ChangeLogDay {
  day: string;
  entries: ChangeLogEntry[];
}

export type DecorationRecipe = NonNullable<Decoration['recipe']>;
export type DecorationRecipeIngredient = DecorationRecipe['ingredients'][number];
