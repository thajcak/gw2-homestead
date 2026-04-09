export interface Decoration {
  id: number;
  name: string;
  description: string;
  categories: number[];
  max_count: number;
  icon: string;
  wikiTitle?: string;
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

export type ChangeLogEntryType = 'New Item' | 'Item Update' | 'Item Removed' | 'Image Update';

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
