import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterFilms,
  normalize,
  parseCatalog,
  parseLinks,
  parseProgress,
  safeHttps,
  type Film,
  type Filters,
  type SavedProgress,
  type WatchLink,
} from '../src/domain.ts';

const defaultFilters: Filters = {
  query: '',
  category: '',
  shelf: 'all',
  sort: 'selection',
};

function film(id: number, overrides: Partial<Film> = {}): Film {
  return {
    id,
    title: `Film ${id}`,
    year: 1956,
    category: 'Magyar klasszikus',
    desc: 'Emlékek és történetek.',
    poster: `/posters/${id}.jpg`,
    imageSource: 'https://example.org/poster',
    ...overrides,
  };
}

function watchLink(id: number, overrides: Partial<WatchLink> = {}): WatchLink {
  return {
    id,
    url: `https://example.org/films/${id}`,
    provider: 'Filmarchívum',
    language: 'Magyar hang',
    checkedAt: '2026-11-01',
    note: 'Szerbiai lejátszás nincs ellenőrizve.',
    evidenceUrl: 'https://example.org/licence',
    availability: 'free',
    ...overrides,
  };
}

const noIds: ReadonlySet<number> = new Set<number>();

function selectedIds(
  films: readonly Film[],
  overrides: Partial<Filters> = {},
  watched: ReadonlySet<number> = noIds,
  favorites: ReadonlySet<number> = noIds,
): number[] {
  const filters: Filters = { ...defaultFilters, ...overrides };
  return filterFilms(films, filters, watched, favorites).map((item: Film): number => item.id);
}

test('Hungarian search ignores accents, case and surrounding whitespace', (): void => {
  assert.equal(normalize('  ŐRÜLT TÜKÖR  '), 'orult tukor');
  const films: readonly Film[] = [film(1, { title: 'Körhinta' }), film(2, { title: 'Édes Anna' })];
  assert.deepEqual(selectedIds(films, { query: '  KORHINTA  ' }), [1]);
  assert.deepEqual(selectedIds(films, { query: 'edes anna' }), [2]);
});

test('search also matches descriptions, release years and categories', (): void => {
  const films: readonly Film[] = [
    film(1, { year: 1956, desc: 'Szerelem a faluban.' }),
    film(2, { year: 1971, category: 'Szívmelengető', desc: 'Barátság a városban.' }),
  ];
  assert.deepEqual(selectedIds(films, { query: 'baratsag' }), [2]);
  assert.deepEqual(selectedIds(films, { query: '1971' }), [2]);
  assert.deepEqual(selectedIds(films, { query: 'szivmelengeto' }), [2]);
});

test('query, category and shelf filters are combined', (): void => {
  const films: readonly Film[] = [
    film(1, { title: 'Szerelem' }),
    film(2, { title: 'Szerelem újra' }),
    film(3, { title: 'Szerelem máskor', category: 'Szívmelengető' }),
    film(4, { title: 'Régi idők' }),
  ];
  const favorites: ReadonlySet<number> = new Set<number>([1, 3, 4]);
  assert.deepEqual(
    selectedIds(
      films,
      { query: 'szerelem', category: 'Magyar klasszikus', shelf: 'favorites' },
      noIds,
      favorites,
    ),
    [1],
  );
});

test('the watched shelf leaves only watched films', (): void => {
  const films: readonly Film[] = [film(1), film(2), film(3)];
  const watched: ReadonlySet<number> = new Set<number>([1, 3]);
  assert.deepEqual(selectedIds(films, { shelf: 'watched' }, watched), [1, 3]);
  assert.deepEqual(selectedIds(films, { query: 'nincs ilyen film' }), []);
});

test('selection and year sorting are deterministic and do not mutate the input', (): void => {
  const films: readonly Film[] = [
    film(3, { year: 1971 }),
    film(2, { year: 1956 }),
    film(1, { year: 1956 }),
  ];
  assert.deepEqual(selectedIds(films), [1, 2, 3]);
  assert.deepEqual(selectedIds(films, { sort: 'year-asc' }), [1, 2, 3]);
  assert.deepEqual(selectedIds(films, { sort: 'year-desc' }), [3, 1, 2]);
  assert.deepEqual(
    films.map((item: Film): number => item.id),
    [3, 2, 1],
  );
});

test('title sorting follows Hungarian alphabetical order', (): void => {
  const films: readonly Film[] = [
    film(3, { title: 'Zongora' }),
    film(2, { title: 'Édes Anna' }),
    film(1, { title: 'Ábel a rengetegben' }),
  ];
  assert.deepEqual(selectedIds(films, { sort: 'title' }), [1, 2, 3]);
});

test('equal titles use film ID as a deterministic sort tie-breaker', (): void => {
  const films: readonly Film[] = [film(2, { title: 'Szerelem' }), film(1, { title: 'Szerelem' })];
  assert.deepEqual(selectedIds(films, { sort: 'title' }), [1, 2]);
});

test('watched and favorite shelves are independent', (): void => {
  const films: readonly Film[] = [film(1), film(2), film(69), film(70)];
  const watched: ReadonlySet<number> = new Set<number>([1, 69]);
  const favorites: ReadonlySet<number> = new Set<number>([2, 70]);
  assert.deepEqual(selectedIds(films, { shelf: 'watched' }, watched, favorites), [1, 69]);
  assert.deepEqual(selectedIds(films, { shelf: 'favorites' }, watched, favorites), [2, 70]);
});

test('version 1 progress migrates watched films without inventing favorites', (): void => {
  const progress: SavedProgress = parseProgress({
    format: '70ev70film',
    version: 1,
    watched: [70, 1, 1],
    exportedAt: '2026-11-01T00:00:00.000Z',
  });
  assert.deepEqual(progress, {
    format: '70ev70film',
    version: 2,
    watched: [70, 1],
    favorites: [],
  });
});

test('legacy browser arrays migrate into version 2 progress', (): void => {
  assert.deepEqual(parseProgress([2, 2, 70]), {
    format: '70ev70film',
    version: 2,
    watched: [2, 70],
    favorites: [],
  });
});

test('progress keeps marks for films that are no longer listed', (): void => {
  assert.deepEqual(
    parseProgress({
      format: '70ev70film',
      version: 2,
      watched: [1, 71, 1000],
      favorites: [1000],
    }),
    {
      format: '70ev70film',
      version: 2,
      watched: [1, 71, 1000],
      favorites: [1000],
    },
  );
});

test('version 2 progress deduplicates both independent shelves', (): void => {
  const input: SavedProgress = {
    format: '70ev70film',
    version: 2,
    watched: [1, 1, 70],
    favorites: [70, 70, 3],
  };
  assert.deepEqual(parseProgress(input), { ...input, watched: [1, 70], favorites: [70, 3] });
  assert.deepEqual(input.watched, [1, 1, 70]);
  assert.deepEqual(input.favorites, [70, 70, 3]);
});

test('progress rejects malformed formats and unsupported versions', (): void => {
  const invalid: readonly unknown[] = [
    null,
    {},
    { format: 'other', version: 2, watched: [], favorites: [] },
    { format: '70ev70film', version: 3, watched: [], favorites: [] },
    { format: '70ev70film', version: 2, watched: [] },
    { format: '70ev70film', version: 1, watched: '1,2' },
  ];
  invalid.forEach((value: unknown): void => {
    assert.throws((): SavedProgress => parseProgress(value));
  });
});

test('progress rejects every invalid film ID in watched and favorites', (): void => {
  const invalidIds: readonly unknown[] = [0, -1, 1001, 1.5, '1', null, NaN, Infinity];
  invalidIds.forEach((id: unknown): void => {
    assert.throws((): SavedProgress => parseProgress([1, id]));
    assert.throws((): SavedProgress =>
      parseProgress({
        format: '70ev70film',
        version: 2,
        watched: [1],
        favorites: [id],
      }),
    );
  });
});

test('HTTPS validation rejects executable, insecure and credential-bearing URLs', (): void => {
  const invalid: readonly unknown[] = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.org/film',
    'ftp://example.org/film',
    'https://user:password@example.org/film',
    'https://user@example.org/film',
    '//example.org/film',
    '/films/1',
    'not a URL',
    null,
    1,
  ];
  invalid.forEach((value: unknown): void => assert.equal(safeHttps(value), false));
  assert.equal(safeHttps('https://example.org/films/1?language=hu'), true);
});

test('direct links retain verification and language metadata', (): void => {
  const link: WatchLink = watchLink(1);
  assert.deepEqual(parseLinks([link]), [link]);
  assert.deepEqual(parseLinks([]), []);
  assert.deepEqual(parseLinks([watchLink(71), watchLink(1000)]), [watchLink(71), watchLink(1000)]);
});

test('several links can share one film ID', (): void => {
  const parts: readonly WatchLink[] = [
    watchLink(60, { url: 'https://example.org/films/a-keresztapa-1' }),
    watchLink(60, { url: 'https://example.org/films/a-keresztapa-2' }),
  ];
  assert.deepEqual(parseLinks(parts), parts);
});

test('link import rejects search-result pages', (): void => {
  const searches: readonly string[] = [
    'https://www.youtube.com/results?search_query=film',
    'https://videa.hu/kereses?q=film',
    'https://example.org/search/films?q=film',
    'https://example.org/SEARCH/films',
    'https://example.org/%73earch/films',
    'https://example.org/keres%C3%A9s/films',
    'https://example.org/?q=film',
    'https://example.org/?SEARCH_QUERY=film',
  ];
  searches.forEach((url: string): void => {
    assert.throws((): WatchLink[] => parseLinks([watchLink(1, { url })]));
  });
});

test('direct film slugs containing search as part of a title remain valid', (): void => {
  const link: WatchLink = watchLink(1, { url: 'https://example.org/films/search-for-a-friend' });
  assert.deepEqual(parseLinks([link]), [link]);
});

test('verification dates must be real calendar days', (): void => {
  const invalidDates: readonly string[] = ['2026-99-99', '2026-02-29', '2026-04-31', '2026-00-01'];
  invalidDates.forEach((checkedAt: string): void => {
    assert.throws((): WatchLink[] => parseLinks([watchLink(1, { checkedAt })]));
  });
  const leapDay: WatchLink = watchLink(1, { checkedAt: '2024-02-29' });
  assert.deepEqual(parseLinks([leapDay]), [leapDay]);
});

test('link import rejects invalid IDs, unsafe URLs and incomplete metadata', (): void => {
  const invalid: readonly unknown[] = [
    null,
    {},
    watchLink(0),
    watchLink(1001),
    watchLink(1, { url: 'javascript:alert(1)' }),
    watchLink(1, { evidenceUrl: 'http://example.org/licence' }),
    watchLink(1, { provider: '  ' }),
    watchLink(1, { checkedAt: 'yesterday' }),
    { ...watchLink(1), availability: 'paid' },
  ];
  assert.throws((): WatchLink[] => parseLinks({ links: [] }));
  invalid.forEach((item: unknown): void => {
    assert.throws((): WatchLink[] => parseLinks([item]));
  });
});

test('catalog accepts exactly the 70 films', (): void => {
  const catalog: readonly Film[] = Array.from(
    { length: 70 },
    (_value: unknown, index: number): Film => film(index + 1),
  );
  const parsed: Film[] = parseCatalog(catalog);
  assert.equal(parsed.length, 70);
  assert.equal(new Set<number>(parsed.map((item: Film): number => item.id)).size, 70);
  assert.deepEqual(parsed, catalog);
  assert.throws((): Film[] => parseCatalog(catalog.slice(1)));
  assert.throws((): Film[] => parseCatalog([...catalog, film(71)]));
  assert.throws((): Film[] => parseCatalog([...catalog, film(70)]));
});

test('catalog rejects duplicate, out-of-range and noninteger IDs', (): void => {
  const catalog: readonly Film[] = Array.from(
    { length: 70 },
    (_value: unknown, index: number): Film => film(index + 1),
  );
  const invalidIds: readonly number[] = [1, 0, 1001, 1.5];
  invalidIds.forEach((id: number): void => {
    const changed: Film[] = catalog.map((item: Film): Film =>
      item.id === 70 ? { ...item, id } : item,
    );
    assert.throws((): Film[] => parseCatalog(changed));
  });
});

test('catalog requires the IDs 1 to 70', (): void => {
  const shifted: readonly Film[] = Array.from(
    { length: 70 },
    (_value: unknown, index: number): Film => film(index + 2),
  );
  assert.throws((): Film[] => parseCatalog(shifted));
});

test('catalog rejects unsafe poster paths and malformed metadata', (): void => {
  const catalog: readonly Film[] = Array.from(
    { length: 70 },
    (_value: unknown, index: number): Film => film(index + 1),
  );
  const invalidFields: readonly Record<string, unknown>[] = [
    { poster: 'https://example.org/tracking.png' },
    { poster: '/posters/../private.jpg' },
    { poster: '/posters/1.svg' },
    { title: null },
    { year: 1956.5 },
    { desc: 123 },
  ];
  invalidFields.forEach((fields: Record<string, unknown>): void => {
    const changed: unknown[] = catalog.map((item: Film): unknown =>
      item.id === 1 ? { ...item, ...fields } : item,
    );
    assert.throws((): Film[] => parseCatalog(changed));
  });
});

test('catalog rejects executable image credit URLs', (): void => {
  const catalog: Film[] = Array.from({ length: 70 }, (_value: unknown, index: number): Film =>
    film(index + 1),
  );
  catalog[0] = film(1, { imageSource: 'javascript:alert(1)' });
  assert.throws((): Film[] => parseCatalog(catalog));
});
