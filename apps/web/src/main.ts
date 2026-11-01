import {
  filterFilms,
  parseCatalog,
  parseLinks,
  parseProgress,
  type Film,
  type FilmSort,
  type Filters,
  type SavedProgress,
  type Shelf,
  type WatchLink,
} from './domain.js';
import {
  closeOnBackdrop,
  downloadJson,
  element,
  escapeHtml,
  icon,
  toast,
  type IconName,
} from './dom.js';
import { cardMarkup, detailMarkup, handleBrokenImages } from './film-view.js';
import { createLinkManager, type LinkManager } from './manager.js';
import { Progress, type SaveResult, type ToggleResult } from './progress.js';

const iconNames: ReadonlySet<string> = new Set<string>([
  'film',
  'heart',
  'check',
  'play',
  'search',
  'arrow',
  'close',
  'shuffle',
  'download',
  'upload',
  'settings',
  'spark',
  'info',
  'external',
]);
function isIconName(value: string): value is IconName {
  return iconNames.has(value);
}
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((target: HTMLElement): void => {
  const name: string = target.dataset.icon ?? '';
  if (isIconName(name)) target.innerHTML = icon(name);
});

const grid: HTMLElement = element('film-grid', HTMLElement);
const movieDialog: HTMLDialogElement = element('movie-dialog', HTMLDialogElement);
const journalDialog: HTMLDialogElement = element('journal-dialog', HTMLDialogElement);
const progress: Progress = new Progress();
let films: Film[] = [];
let manager: LinkManager | undefined;
let selectedFilm: Film | undefined;
let filters: Filters = {
  query: '',
  category: '',
  shelf: 'all',
  sort: 'selection',
};

function currentLinks(): readonly WatchLink[] {
  return manager?.current() ?? [];
}

function renderSummary(): void {
  const filmIds: ReadonlySet<number> = new Set<number>(films.map((film: Film): number => film.id));
  const countListed = (ids: ReadonlySet<number>): number =>
    [...ids].filter((id: number): boolean => filmIds.has(id)).length;
  const watchedCount: number = countListed(progress.watched);
  const favoriteCount: number = countListed(progress.favorites);
  element('watched-count', HTMLElement).textContent = String(watchedCount);
  element('progress-percent', HTMLElement).textContent =
    `${Math.round((watchedCount / 70) * 100)}%`;
  const bar: HTMLProgressElement = element('watch-progress', HTMLProgressElement);
  bar.value = watchedCount;
  bar.textContent = `${watchedCount} / 70`;
  ['favorite-count', 'favorite-tab-count'].forEach((id: string): void => {
    element(id, HTMLElement).textContent = String(favoriteCount);
  });
  element('watched-tab-count', HTMLElement).textContent = String(watchedCount);
  element('progress-message', HTMLElement).textContent =
    watchedCount === 70
      ? 'Hetven történet, megannyi élmény ♡'
      : watchedCount > 0
        ? 'Máris gazdagabb vagy néhány történettel ♡'
        : 'Egy szép történet kezdete ♡';
  element('journal-summary', HTMLElement).textContent =
    `${watchedCount} / 70 film megnézve · ${favoriteCount} kedvenc.`;
}

function render(): void {
  const visible: Film[] = filterFilms(films, filters, progress.watched, progress.favorites);
  grid.innerHTML = visible
    .map((film: Film): string => cardMarkup(film, currentLinks(), progress))
    .join('');
  handleBrokenImages(grid);
  element('result-count', HTMLElement).innerHTML =
    `<strong>${visible.length} film</strong> ${filters.shelf === 'favorites' ? 'a kedvenceid között' : filters.shelf === 'watched' ? 'a filmnaplódban' : 'a születésnapi válogatásban'}`;
  element('empty-state', HTMLElement).hidden = visible.length > 0;
  element('empty-description', HTMLElement).textContent =
    filters.shelf === 'favorites'
      ? 'A filmkártyákon a szívre kattintva gyűjtheted a kedvenceidet.'
      : filters.shelf === 'watched'
        ? 'A „Láttam” gombbal jelöld meg, amit már megnéztél.'
        : 'Próbálj másik keresést vagy kategóriát!';
  document
    .querySelectorAll<HTMLButtonElement>('[data-shelf]')
    .forEach((button: HTMLButtonElement): void => {
      const active: boolean = button.dataset.shelf === filters.shelf;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  renderSummary();
}

function showFilm(film: Film): void {
  selectedFilm = film;
  const content: HTMLElement = element('movie-content', HTMLElement);
  content.innerHTML = detailMarkup(film, currentLinks(), progress);
  movieDialog.setAttribute('aria-labelledby', 'movie-title');
  handleBrokenImages(content);
  if (!movieDialog.open) movieDialog.showModal();
}

function updateMovieAction(action: string, id: number, trigger: HTMLButtonElement): void {
  const film: Film | undefined = films.find((item: Film): boolean => item.id === id);
  if (film === undefined) return;
  if (action === 'details') {
    showFilm(film);
    return;
  }
  if (action !== 'watched' && action !== 'favorite') return;
  const kind: 'watched' | 'favorites' = action === 'watched' ? 'watched' : 'favorites';
  const result: ToggleResult = progress.toggle(kind, id);
  const selected: boolean = result.selected;
  const inDialog: boolean = movieDialog.contains(trigger);
  render();
  if (inDialog) showFilm(film);
  const root: HTMLElement = inDialog ? movieDialog : grid;
  root
    .querySelector<HTMLButtonElement>(`button[data-action="${action}"][data-id="${id}"]`)
    ?.focus({ preventScroll: true });
  if (result.persistence.status === 'memory-only') {
    toast(
      'A jelölés most csak erre a látogatásra marad meg. A böngésző nem engedi a mentést. Készíts biztonsági másolatot a Filmnaplónál!',
    );
    return;
  }
  toast(
    action === 'watched'
      ? selected
        ? 'Újabb történet a filmnaplódban. Jó volt veled utazni! ♡'
        : 'A film újra a még nem látottak között van.'
      : selected
        ? 'A kedvenceid közé került. ♡'
        : 'A film kikerült a kedvenceid közül.',
  );
}

function onFilmAction(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const button: HTMLButtonElement | null =
    event.target.closest<HTMLButtonElement>('button[data-action]');
  if (button === null) return;
  updateMovieAction(button.dataset.action ?? '', Number(button.dataset.id), button);
}
grid.addEventListener('click', onFilmAction);
movieDialog.addEventListener('click', onFilmAction);
movieDialog.addEventListener('close', (): void => {
  selectedFilm = undefined;
});

function setShelf(shelf: Shelf): void {
  filters = { ...filters, shelf, query: '', category: '' };
  element('search', HTMLInputElement).value = '';
  renderCategories();
  render();
  element('collection', HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCategories(): void {
  const categories: string[] = [
    ...new Set<string>(films.map((film: Film): string => film.category)),
  ];
  element('categories', HTMLElement).innerHTML = ['', ...categories]
    .map(
      (category: string): string =>
        `<button class="category-chip${filters.category === category ? ' active' : ''}" data-category="${escapeHtml(category)}" aria-pressed="${filters.category === category}">${escapeHtml(category || 'Minden történet')}</button>`,
    )
    .join('');
}
element('categories', HTMLElement).addEventListener('click', (event: MouseEvent): void => {
  if (!(event.target instanceof Element)) return;
  const button: HTMLButtonElement | null =
    event.target.closest<HTMLButtonElement>('[data-category]');
  if (button === null) return;
  filters = { ...filters, category: button.dataset.category ?? '' };
  renderCategories();
  render();
  element('categories', HTMLElement)
    .querySelector<HTMLButtonElement>('.active')
    ?.focus({ preventScroll: true });
});

document
  .querySelectorAll<HTMLButtonElement>('[data-shelf]')
  .forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => {
      const shelf: string | undefined = button.dataset.shelf;
      if (shelf === 'all' || shelf === 'favorites' || shelf === 'watched') setShelf(shelf);
    });
  });
element('search', HTMLInputElement).addEventListener('input', (event: Event): void => {
  if (!(event.target instanceof HTMLInputElement)) return;
  filters = { ...filters, query: event.target.value };
  render();
});
element('sort', HTMLSelectElement).addEventListener('change', (event: Event): void => {
  if (!(event.target instanceof HTMLSelectElement)) return;
  const value: string = event.target.value;
  const sort: FilmSort =
    value === 'title' || value === 'year-asc' || value === 'year-desc' ? value : 'selection';
  filters = { ...filters, sort };
  render();
});
element('reset-filters', HTMLButtonElement).addEventListener('click', (): void => setShelf('all'));
element('start-viewing', HTMLAnchorElement).addEventListener('click', (): void => setShelf('all'));
element('surprise', HTMLButtonElement).addEventListener('click', (): void => {
  const pool: Film[] = filterFilms(films, filters, progress.watched, progress.favorites);
  const unseen: Film[] = pool.filter((film: Film): boolean => !progress.watched.has(film.id));
  const candidates: Film[] = unseen.length > 0 ? unseen : pool;
  const film: Film | undefined = candidates[Math.floor(Math.random() * candidates.length)];
  if (film !== undefined) showFilm(film);
  else toast('Ezzel a szűréssel nincs film. Próbálj másik kategóriát!');
});

document.querySelectorAll<HTMLDialogElement>('dialog').forEach(closeOnBackdrop);
document
  .querySelectorAll<HTMLButtonElement>('[data-close]')
  .forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => {
      element(button.dataset.close ?? '', HTMLDialogElement).close();
    });
  });
['journal-open', 'backup-open'].forEach((id: string): void => {
  element(id, HTMLButtonElement).addEventListener('click', (): void => {
    renderSummary();
    journalDialog.showModal();
  });
});
element('about-links', HTMLButtonElement).addEventListener('click', (): void =>
  element('info-dialog', HTMLDialogElement).showModal(),
);
element('show-watched', HTMLButtonElement).addEventListener('click', (): void => {
  journalDialog.close();
  setShelf('watched');
});
element('export-progress', HTMLButtonElement).addEventListener('click', (): void => {
  downloadJson(
    { ...progress.snapshot(), exportedAt: new Date().toISOString() },
    '70-film-megnezett.json',
  );
  toast('A filmnapló biztonsági másolata elkészült.');
});
element('import-progress', HTMLButtonElement).addEventListener('click', (): void =>
  element('progress-file', HTMLInputElement).click(),
);
element('progress-file', HTMLInputElement).addEventListener(
  'change',
  async (event: Event): Promise<void> => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const input: HTMLInputElement = event.target;
    const file: File | undefined = input.files?.[0];
    if (file === undefined) return;
    try {
      if (file.size > 100_000) throw new Error('A mentés túl nagy. Válassz filmnapló-mentést!');
      const value: unknown = JSON.parse(await file.text());
      const saved: SavedProgress = parseProgress(value);
      if (
        !window.confirm(
          'A mentés felülírja a jelenlegi megnézett jelöléseket és kedvenceket. Folytatod?',
        )
      )
        return;
      progress.restore(saved);
      const savedResult: SaveResult = progress.save();
      render();
      toast(
        savedResult.status === 'saved'
          ? 'A filmnapló és a kedvencek visszaállítva.'
          : 'A filmnapló betöltve erre a látogatásra. A böngésző nem engedi a tartós mentést. Őrizd meg a biztonsági másolatot!',
      );
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : 'A fájlt nem sikerült betölteni.');
    } finally {
      input.value = '';
    }
  },
);
element('manage-open', HTMLButtonElement).addEventListener('click', (): void => {
  if (manager !== undefined) manager.open();
  else toast('A filmek még nem töltődtek be. Próbáld újra!');
});

async function loadJson(path: string): Promise<unknown> {
  const response: Response = await fetch(path, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('A filmadatok nem érhetők el.');
  const value: unknown = await response.json();
  return value;
}

async function load(): Promise<void> {
  const retry: HTMLButtonElement = element('retry', HTMLButtonElement);
  retry.disabled = true;
  element('loading-error', HTMLElement).hidden = true;
  try {
    const [catalog, links]: [unknown, unknown] = await Promise.all([
      loadJson('/data/catalog.json'),
      loadJson('/data/links.json'),
    ]);
    films = parseCatalog(catalog);
    manager = createLinkManager(films, parseLinks(links), (): void => {
      render();
      if (selectedFilm !== undefined && movieDialog.open) showFilm(selectedFilm);
    });
    renderCategories();
    render();
  } catch {
    element('loading-error', HTMLElement).hidden = false;
    element('result-count', HTMLElement).textContent = 'A válogatás nem tölthető be.';
  } finally {
    retry.disabled = false;
  }
}
element('retry', HTMLButtonElement).addEventListener('click', (): void => {
  void load();
});
window.addEventListener('storage', (event: StorageEvent): void => {
  if (event.key !== 'gyorgyi-filmnaplo-v2' || event.newValue === null) return;
  try {
    const value: unknown = JSON.parse(event.newValue);
    progress.restore(parseProgress(value));
    render();
    if (selectedFilm !== undefined && movieDialog.open) showFilm(selectedFilm);
  } catch {
    /* Preserve the current film journal if another tab writes invalid data. */
  }
});
void load();
