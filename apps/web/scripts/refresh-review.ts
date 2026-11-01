import { readFile, writeFile } from 'node:fs/promises';
import { parseCatalog, parseLinks, type Film, type WatchLink } from '../src/domain.ts';

const catalogUrl: URL = new URL('../public/data/catalog.json', import.meta.url);
const linksUrl: URL = new URL('../public/data/links.json', import.meta.url);
const catalogValue: unknown = JSON.parse(await readFile(catalogUrl, 'utf8'));
const linksValue: unknown = JSON.parse(await readFile(linksUrl, 'utf8'));
const films: Film[] = parseCatalog(catalogValue);
const links: WatchLink[] = parseLinks(linksValue);

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const rows: (string | number)[][] = [
  [
    'Sorszám',
    'Cím',
    'Év',
    'Kategória',
    'Állapot',
    'Filmoldalak',
    'Ellenőrzés dátuma',
    'Megjegyzés',
  ],
  ...films.map((film: Film): (string | number)[] => {
    const sources: WatchLink[] = links.filter((link: WatchLink): boolean => link.id === film.id);
    return [
      film.id,
      film.title,
      film.year,
      film.category,
      sources.length > 0 ? 'Van filmoldal' : 'Nincs filmoldal',
      sources.map((link: WatchLink): string => link.url).join(' | '),
      [...new Set<string>(sources.map((link: WatchLink): string => link.checkedAt))].join(' | '),
      sources.map((link: WatchLink): string => link.note).join(' | '),
    ];
  }),
];
const csv: string =
  '\ufeff' +
  rows.map((row: (string | number)[]): string => row.map(csvCell).join(',')).join('\r\n') +
  '\r\n';
await writeFile(new URL('../public/data/availability.csv', import.meta.url), csv, 'utf8');
console.info(`Availability review refreshed for ${films.length} films.`);
