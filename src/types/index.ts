import type { CollectionEntry } from 'astro:content';

export type Decoration = CollectionEntry<'decorations'>['data'];
export type Category = CollectionEntry<'categories'>['data'];

export type ChangeLogEntryType =
  | 'New Item'
  | 'Item Update'
  | 'Image Update'
  | 'Recipe Added'
  | 'Recipe Updated';

export interface ChangeLogFieldChange {
  field: string;
  detail?: string;
  before: unknown;
  after: unknown;
}

export interface ChangeLogHistoryEntry {
  day: string;
  type: ChangeLogEntryType;
  name: string;
  changes?: ChangeLogFieldChange[];
}

export interface ChangeLogEntry {
  id: number;
  type: ChangeLogEntryType;
  name: string;
  changes?: ChangeLogFieldChange[];
}

export interface ChangeLogDay {
  day: string;
  entries: ChangeLogEntry[];
}

export type DecorationRecipe = NonNullable<Decoration['recipe']>;
export type DecorationRecipeIngredient = DecorationRecipe['ingredients'][number];
