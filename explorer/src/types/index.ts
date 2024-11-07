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
