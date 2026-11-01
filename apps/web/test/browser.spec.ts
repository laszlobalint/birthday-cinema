import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIResponse,
  type Dialog,
  type Download,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';

interface JsonUpload {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

function card(page: Page, id: number): Locator {
  return page.locator(`#film-grid article[data-film-id="${id}"]`);
}

interface PublishedFilm {
  readonly id: number;
  readonly category: string;
}

async function publishedFilms(page: Page): Promise<PublishedFilm[]> {
  const catalog: APIResponse = await page.request.get('/data/catalog.json');
  return (await catalog.json()) as PublishedFilm[];
}

async function chooseShelf(page: Page, shelf: 'all' | 'watched' | 'favorites'): Promise<void> {
  await page.locator(`.collection-tab[data-shelf="${shelf}"]`).click();
}

async function readDownloadedJson(download: Download): Promise<unknown> {
  const path: string | null = await download.path();
  if (path === null) throw new Error('The downloaded JSON file is unavailable.');
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return value;
}

async function uploadProgress(page: Page, value: unknown): Promise<void> {
  const file: JsonUpload = {
    name: '70-film-megnezett.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  };
  await page.locator('#progress-file').setInputFiles(file);
}

async function expectImagesLoaded(page: Page): Promise<void> {
  await page.locator('img').evaluateAll((nodes: Element[]): void => {
    nodes.forEach((node: Element): void => {
      if (node instanceof HTMLImageElement) node.loading = 'eager';
    });
  });
  await expect
    .poll(async (): Promise<number> =>
      page
        .locator('img')
        .evaluateAll(
          (nodes: Element[]): number =>
            nodes.filter(
              (node: Element): boolean =>
                node instanceof HTMLImageElement && (!node.complete || node.naturalWidth === 0),
            ).length,
        ),
    )
    .toBe(0);
  await expect(page.locator('.poster-placeholder')).toHaveCount(0);
}

test.beforeEach(async ({ page }: { page: Page }): Promise<void> => {
  await page.goto('/');
  await expect(page.locator('#film-grid article')).toHaveCount(70);
});

test('the selection holds exactly 70 films', async ({ page }: { page: Page }): Promise<void> => {
  await expect(page).toHaveTitle(/70 év, 70 történet/);
  await expect(page.locator('#hero-title')).toContainText('70');
  await expect(page.locator('#watched-count')).toHaveText('0');
  await expect(card(page, 1)).toBeVisible();
  await expect(card(page, 26)).toContainText('Sátántangó');
  await expect(card(page, 70)).toBeVisible();
  await expect(card(page, 71)).toHaveCount(0);
  await expect(page.locator('.collection-tab')).toHaveCount(3);
});

test('accent-insensitive search finds Hungarian titles and can recover from no results', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.locator('#search').fill('korhinta');
  await expect(page.locator('#film-grid article')).toHaveCount(1);
  await expect(card(page, 1)).toContainText('Körhinta');
  await page.locator('#search').fill('nincsilyenfilm12345');
  await expect(page.locator('#film-grid article')).toHaveCount(0);
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#reset-filters').click();
  await expect(page.locator('#film-grid article')).toHaveCount(70);
});

test('category chips show only the films of that category', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const films: PublishedFilm[] = await publishedFilms(page);
  const inCategory = (category: string): number =>
    films.filter((film: PublishedFilm): boolean => film.category === category).length;
  for (const category of ['Magyar klasszikus', 'Kortárs magyar film', 'Francia és olasz']) {
    await page.locator('#categories').getByRole('button', { name: category, exact: true }).click();
    await expect(page.locator('#film-grid article')).toHaveCount(inCategory(category));
  }
});

test('Abigél details link the complete series in one video', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await card(page, 25).locator('.details-button').click();
  await expect(page.locator('#movie-dialog')).toBeVisible();
  await expect(page.locator('#movie-title')).toHaveText('Abigél');
  const links: Locator = page.locator('#movie-content .watch-source a');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute('href', /^https:\/\/ok\.ru\/video\/\d+$/);
  await expect(links).toContainText('OK.ru');
  await expect(page.locator('#movie-content .watch-source')).toContainText('Mind a négy rész');
  await page.keyboard.press('Escape');
  await expect(page.locator('#movie-dialog')).not.toBeVisible();
});

test('watched status persists through reload and the journal filter', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await card(page, 1).locator('[data-action="watched"]').click();
  await expect(card(page, 1).locator('[data-action="watched"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#watched-count')).toHaveText('1');
  await page.reload();
  await expect(card(page, 1).locator('[data-action="watched"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await chooseShelf(page, 'watched');
  await expect(page.locator('#film-grid article')).toHaveCount(1);
  await expect(card(page, 1)).toBeVisible();
});

test('favorites persist through reload and can be removed from their shelf', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await card(page, 2).locator('[data-action="favorite"]').click();
  await expect(page.locator('#favorite-count')).toHaveText('1');
  await page.reload();
  await chooseShelf(page, 'favorites');
  await expect(page.locator('#film-grid article')).toHaveCount(1);
  await expect(card(page, 2).locator('[data-action="favorite"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await card(page, 2).locator('[data-action="favorite"]').click();
  await expect(page.locator('#film-grid article')).toHaveCount(0);
  await expect(page.locator('#favorite-count')).toHaveText('0');
});

test('progress backup downloads watched and favorite IDs', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await card(page, 1).locator('[data-action="watched"]').click();
  await card(page, 2).locator('[data-action="favorite"]').click();
  await page.locator('#journal-open').click();
  const pendingDownload: Promise<Download> = page.waitForEvent('download');
  await page.locator('#export-progress').click();
  const download: Download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  expect(await readDownloadedJson(download)).toMatchObject({
    format: '70ev70film',
    version: 2,
    watched: [1],
    favorites: [2],
  });
});

test('the original demo version 1 backup restores watched films', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.locator('#journal-open').click();
  page.once('dialog', async (dialog: Dialog): Promise<void> => dialog.accept());
  await uploadProgress(page, { format: '70ev70film', version: 1, watched: [1, 25] });
  await expect(page.locator('#toast')).toContainText('visszaállítva');
  await page.locator('[data-close="journal-dialog"]').click();
  await expect(page.locator('#watched-count')).toHaveText('2');
  await chooseShelf(page, 'watched');
  await expect(page.locator('#film-grid article')).toHaveCount(2);
  await expect(card(page, 25)).toBeVisible();
  await page.reload();
  await expect(page.locator('#watched-count')).toHaveText('2');
});

test('invalid backup rejection preserves the existing journal', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await card(page, 1).locator('[data-action="watched"]').click();
  await page.locator('#journal-open').click();
  await uploadProgress(page, { format: '70ev70film', version: 1, watched: [1001] });
  await expect(page.locator('#toast')).toContainText('Érvénytelen');
  await expect(page.locator('#watched-count')).toHaveText('1');
  await page.locator('[data-close="journal-dialog"]').click();
  await page.reload();
  await expect(card(page, 1).locator('[data-action="watched"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('link management previews and exports locally without writing to the server', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const writes: string[] = [];
  page.on('request', (request: Request): void => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url());
  });
  const previewUrl: string = 'https://example.org/films/korhinta';
  await page.locator('#manage-open').click();
  await page.locator('#manage-film').selectOption('1');
  await page.locator('#manage-url').fill(previewUrl);
  await page.locator('#manage-provider').fill('Teszt filmarchívum');
  await page.locator('#manage-note').fill('Csak helyi tesztelőnézet.');
  await page.locator('#manage-reviewed').check();
  await page.locator('#link-form button[type="submit"]').click();
  await expect(page.locator('#manager-status')).toContainText('előnézet mentve');
  const pendingDownload: Promise<Download> = page.waitForEvent('download');
  await page.locator('#export-links').click();
  const download: Download = await pendingDownload;
  expect(await readDownloadedJson(download)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 1, url: previewUrl, provider: 'Teszt filmarchívum' }),
    ]),
  );
  await page.locator('[data-close="manager-dialog"]').click();
  await card(page, 1).locator('.details-button').click();
  await expect(page.locator('#movie-content .watch-source a')).toHaveAttribute('href', previewUrl);
  await page.keyboard.press('Escape');
  await page.reload();
  await card(page, 1).locator('.details-button').click();
  await expect(page.locator('#movie-content .watch-source a')).toHaveAttribute('href', previewUrl);
  const published: APIResponse = await page.request.get('/data/links.json');
  expect(await published.text()).not.toContain(previewUrl);
  expect(writes).toEqual([]);
});

test('all film images load successfully', async ({ page }: { page: Page }): Promise<void> => {
  await expectImagesLoaded(page);
});

test('preview links for films no longer listed do not add cards', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const published: APIResponse = await page.request.get('/data/links.json');
  const stale: unknown[] = [
    ...((await published.json()) as unknown[]),
    {
      id: 71,
      url: 'https://example.org/films/removed',
      provider: 'Teszt',
      language: 'Magyar hang',
      checkedAt: '2026-11-01',
      note: '',
      evidenceUrl: 'https://example.org/films/removed',
      availability: 'free',
    },
  ];
  await page.evaluate((value: string): void => {
    localStorage.setItem('gyorgyi-link-preview-v2', value);
  }, JSON.stringify(stale));
  await page.reload();
  await expect(page.locator('#film-grid article')).toHaveCount(70);
  await expect(card(page, 71)).toHaveCount(0);
});

test('previews saved before the renumbering are ignored', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const oldNumbering: string = 'https://videa.hu/videok/film-animacio/az-elet-csoda-szep-1946';
  await page.evaluate((url: string): void => {
    localStorage.setItem(
      'gyorgyi-link-preview-v1',
      JSON.stringify([
        {
          id: 57,
          url,
          provider: 'Videa.hu',
          language: 'Magyar hang',
          checkedAt: '2026-11-01',
          note: '',
          evidenceUrl: url,
          availability: 'free',
        },
      ]),
    );
  }, oldNumbering);
  await page.reload();
  await card(page, 57).locator('.details-button').click();
  await expect(page.locator('#movie-title')).toHaveText('Hátsó ablak');
  await expect(page.locator('#movie-content .watch-source a')).not.toHaveAttribute(
    'href',
    oldNumbering,
  );
});

test('desktop and narrow mobile layouts render without horizontal overflow', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const expectNoHorizontalOverflow = async (): Promise<void> => {
    const measurements: { readonly viewport: number; readonly scroll: number } =
      await page.evaluate((): { readonly viewport: number; readonly scroll: number } => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
    expect(measurements.scroll).toBeLessThanOrEqual(measurements.viewport);
  };
  await expectImagesLoaded(page);
  await expectNoHorizontalOverflow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#film-grid article')).toHaveCount(70);
  await expectNoHorizontalOverflow();
  await page.locator('#search').fill('korhinta');
  await expect(card(page, 1)).toBeVisible();
  await card(page, 1).locator('.details-button').click();
  await expect(page.locator('#movie-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await expect(page.locator('#film-grid article')).toHaveCount(70);
  const narrowMeasurements: { readonly viewport: number; readonly scroll: number } =
    await page.evaluate((): { readonly viewport: number; readonly scroll: number } => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
  expect(narrowMeasurements.scroll).toBeLessThanOrEqual(narrowMeasurements.viewport);
  await page.screenshot({ path: '/tmp/gyorgyi-mobile-320.png', fullPage: false });
});

test('editing an added Abigél source repeatedly preserves every source', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.locator('#manage-open').click();
  await page.locator('#manage-film').selectOption('25');
  await page.locator('#manage-source').selectOption('new');
  await page.locator('#manage-url').fill('https://example.org/abigel/masodik-forras');
  await page.locator('#manage-provider').fill('Teszt forrás');
  await page.locator('#manage-note').fill('Második forrás – első helyi ellenőrzés.');
  await page.locator('#manage-reviewed').check();
  await page.locator('#link-form button[type="submit"]').click();
  await expect(page.locator('#manager-status')).toContainText('előnézet mentve');
  await page.locator('#manage-note').fill('Második forrás – második helyi ellenőrzés.');
  await page.locator('#manage-reviewed').check();
  await page.locator('#link-form button[type="submit"]').click();
  await page.locator('[data-close="manager-dialog"]').click();
  await card(page, 25).locator('.details-button').click();
  const sources: Locator = page.locator('#movie-content .watch-source');
  await expect(sources).toHaveCount(2);
  await expect(sources.nth(0)).toContainText('OK.ru');
  await expect(sources.nth(1)).toContainText('Teszt forrás');
  await expect(sources.nth(1)).toContainText('második helyi ellenőrzés');
});

test('blocked browser storage clearly reports temporary watched marks', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.addInitScript((): void => {
    Storage.prototype.setItem = (_key: string, _value: string): void => {
      throw new DOMException('Storage is blocked', 'QuotaExceededError');
    };
  });
  await page.reload();
  await expect(page.locator('#film-grid article')).toHaveCount(70);
  await card(page, 1).locator('[data-action="watched"]').click();
  await expect(page.locator('#toast')).toContainText('böngésző nem engedi a mentést');
  await page.waitForTimeout(300);
  await expect(page.locator('#toast')).toContainText('csak erre a látogatásra');
  await expect(card(page, 1).locator('[data-action="watched"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(card(page, 1).locator('[data-action="watched"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
