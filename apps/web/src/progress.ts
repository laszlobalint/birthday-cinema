import { parseProgress, type SavedProgress } from './domain.js';
import { toast } from './dom.js';

const KEY: string = 'gyorgyi-filmnaplo-v2';
const LEGACY_KEY: string = 'hetven-ev-hetven-film-v1';

export type SaveResult = { readonly status: 'saved' } | { readonly status: 'memory-only' };

export interface ToggleResult {
  readonly selected: boolean;
  readonly persistence: SaveResult;
}

export class Progress {
  public watched: Set<number> = new Set<number>();
  public favorites: Set<number> = new Set<number>();

  public constructor() {
    try {
      const raw: string | null = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
      if (raw === null) return;
      const value: unknown = JSON.parse(raw);
      this.restore(parseProgress(value));
    } catch {
      toast(
        'A korábbi mentés nem olvasható. Ha van biztonsági másolatod, töltsd be a Filmnaplónál.',
      );
    }
  }

  public snapshot(): SavedProgress {
    return {
      format: '70ev70film',
      version: 2,
      watched: [...this.watched].sort((a: number, b: number): number => a - b),
      favorites: [...this.favorites].sort((a: number, b: number): number => a - b),
    };
  }

  public restore(saved: SavedProgress): void {
    this.watched = new Set<number>(saved.watched);
    this.favorites = new Set<number>(saved.favorites);
  }

  public toggle(kind: 'watched' | 'favorites', id: number): ToggleResult {
    const collection: Set<number> = this[kind];
    const selected: boolean = !collection.has(id);
    if (selected) collection.add(id);
    else collection.delete(id);
    return { selected, persistence: this.save() };
  }

  public save(): SaveResult {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.snapshot()));
      return { status: 'saved' };
    } catch {
      return { status: 'memory-only' };
    }
  }
}
