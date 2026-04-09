export interface DecorationRecipeIngredient {
  slot: number;
  quantity: number | null;
  item: string;
}

export interface DecorationRecipe {
  name?: string;
  source?: string;
  sheet?: string;
  type?: string;
  disciplines?: string;
  rating?: number;
  /** Recipe id(s) from the wiki; may be a number or comma-separated string when multiple ids are listed. */
  id?: number | string;
  quantity?: number;
  upper_quantity?: number;
  guild_upgrade?: string;
  timegate?: boolean;
  ingredients: DecorationRecipeIngredient[];
}

export interface Decoration {
  id: number;
  name: string;
  description: string;
  categories: number[];
  max_count: number;
  icon: string;
  wikiTitle?: string;
  recipe?: DecorationRecipe | null;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  original?: {
    source: string;
    width: number;
    height: number;
  };
}

export interface Category {
  id: number;
  name: string;
}

export type ChangeLogEntryType =
  | 'New Item'
  | 'Item Update'
  | 'Item Removed'
  | 'Image Update'
  | 'Recipe Added'
  | 'Recipe Updated';

export interface ChangeLogFieldChange {
  field: string;
  detail?: string;
  before: unknown;
  after: unknown;
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

export interface ChangeLogData {
  days: ChangeLogDay[];
}
