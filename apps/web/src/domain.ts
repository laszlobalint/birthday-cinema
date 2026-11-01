export interface Film {
  readonly id: number;
  readonly title: string;
  readonly year: number;
  readonly category: string;
  readonly desc: string;
  readonly poster: string;
  readonly imageSource: string;
}

export interface WatchLink {
  readonly id: number;
  readonly url: string;
  readonly provider: string;
  readonly language: string;
  readonly checkedAt: string;
  readonly note: string;
  readonly evidenceUrl: string;
  readonly availability: 'free' | 'free-registration' | 'unverified';
}

export interface SavedProgress {
  readonly format: '70ev70film';
  readonly version: 2;
  readonly watched: readonly number[];
  readonly favorites: readonly number[];
}

export type Shelf = 'all' | 'favorites' | 'watched';
export type FilmSort = 'selection' | 'year-asc' | 'year-desc' | 'title';

export interface Filters {
  readonly query: string;
  readonly category: string;
  readonly shelf: Shelf;
  readonly sort: FilmSort;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}

function ids(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((id: unknown): id is number => validId(id))) {
    throw new Error('Érvénytelen filmjelölések.');
  }
  return [...new Set<number>(value)];
}

export function parseProgress(value: unknown): SavedProgress {
  if (Array.isArray(value)) {
    return { format: '70ev70film', version: 2, watched: ids(value), favorites: [] };
  }
  if (
    !isRecord(value) ||
    value.format !== '70ev70film' ||
    (value.version !== 1 && value.version !== 2)
  ) {
    throw new Error('Ez nem megfelelő filmnapló-mentés.');
  }
  return {
    format: '70ev70film',
    version: 2,
    watched: ids(value.watched),
    favorites: value.version === 1 ? [] : ids(value.favorites),
  };
}

export function safeHttps(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url: URL = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date: Date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isSearchUrl(url: URL): boolean {
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).normalize('NFC');
  } catch {
    return true;
  }
  if (/(?:^|\/)(?:results|kereses|keresés|search)(?:\/|$)/i.test(path)) return true;
  const searchKeys: ReadonlySet<string> = new Set<string>(['q', 'query', 'search', 'search_query']);
  return [...url.searchParams.keys()].some((key: string): boolean =>
    searchKeys.has(key.toLowerCase()),
  );
}

export function parseLinks(value: unknown): WatchLink[] {
  if (!Array.isArray(value)) throw new Error('A linklista formátuma hibás.');
  return value.map((item: unknown): WatchLink => {
    if (
      !isRecord(item) ||
      !validId(item.id) ||
      !safeHttps(item.url) ||
      typeof item.provider !== 'string' ||
      !item.provider.trim() ||
      typeof item.language !== 'string' ||
      !validDate(item.checkedAt) ||
      typeof item.note !== 'string' ||
      !safeHttps(item.evidenceUrl) ||
      (item.availability !== 'free' &&
        item.availability !== 'free-registration' &&
        item.availability !== 'unverified')
    ) {
      throw new Error('Érvénytelen filmhivatkozás. Csak teljes HTTPS filmoldal adható meg.');
    }
    const url: URL = new URL(item.url);
    if (isSearchUrl(url)) {
      throw new Error('Keresőoldal helyett közvetlen filmoldalt adj meg.');
    }
    return {
      id: item.id,
      url: item.url,
      provider: item.provider,
      language: item.language,
      checkedAt: item.checkedAt,
      note: item.note,
      evidenceUrl: item.evidenceUrl,
      availability: item.availability,
    };
  });
}

export function parseCatalog(value: unknown): Film[] {
  if (!Array.isArray(value) || value.length !== 70)
    throw new Error('A válogatásnak pontosan 70 filmet kell tartalmaznia.');
  const seen: Set<number> = new Set<number>();
  const films: Film[] = value.map((item: unknown): Film => {
    if (
      !isRecord(item) ||
      !validId(item.id) ||
      seen.has(item.id) ||
      typeof item.title !== 'string' ||
      typeof item.year !== 'number' ||
      !Number.isInteger(item.year) ||
      typeof item.category !== 'string' ||
      typeof item.desc !== 'string' ||
      typeof item.poster !== 'string' ||
      !/^\/posters\/\d+\.(jpg|png|webp)$/.test(item.poster) ||
      typeof item.imageSource !== 'string' ||
      (item.imageSource !== '' && !safeHttps(item.imageSource))
    )
      throw new Error('Érvénytelen filmadat.');
    seen.add(item.id);
    return {
      id: item.id,
      title: item.title,
      year: item.year,
      category: item.category,
      desc: item.desc,
      poster: item.poster,
      imageSource: item.imageSource,
    };
  });
  const expectedIds: number[] = Array.from(
    { length: 70 },
    (_value: unknown, index: number): number => index + 1,
  );
  if (expectedIds.some((id: number): boolean => !seen.has(id))) {
    throw new Error('A válogatásnak pontosan 70 filmet kell tartalmaznia.');
  }
  return films;
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hu')
    .trim();
}

export function filterFilms(
  films: readonly Film[],
  filters: Filters,
  watched: ReadonlySet<number>,
  favorites: ReadonlySet<number>,
): Film[] {
  const query: string = normalize(filters.query);
  return films
    .filter(
      (film: Film): boolean =>
        (!query ||
          normalize(`${film.title} ${film.year} ${film.desc} ${film.category}`).includes(query)) &&
        (!filters.category || film.category === filters.category) &&
        (filters.shelf !== 'watched' || watched.has(film.id)) &&
        (filters.shelf !== 'favorites' || favorites.has(film.id)),
    )
    .sort((a: Film, b: Film): number => {
      if (filters.sort === 'title') return a.title.localeCompare(b.title, 'hu') || a.id - b.id;
      if (filters.sort === 'year-asc') return a.year - b.year || a.id - b.id;
      if (filters.sort === 'year-desc') return b.year - a.year || a.id - b.id;
      return a.id - b.id;
    });
}
