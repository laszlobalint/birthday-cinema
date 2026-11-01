# 70 év, 70 történet

A Hungarian-language birthday cinema for Vikor Györgyi, born 4 November 1956. Built for her 70th birthday on 4 November 2026. The site shows exactly 70 films.

## Run and check

This is a pnpm workspace. Use Node.js 24+ and the pinned pnpm version.

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm --filter @gyorgyi/cinema test:browser
pnpm build
```

`pnpm dev` serves http://127.0.0.1:4173. Browser checks use Chromium; install the test browser with `pnpm --filter @gyorgyi/cinema exec playwright install chromium` when needed. `pnpm build` compiles the web package and copies its static output to the root `dist/` directory for hosting.

No runtime dependencies, database, external API keys, analytics, or subscriptions are required. The static website can also be hosted on another service that supports HTTPS.

## Film data and direct links

- `apps/web/public/data/catalog.json`: film titles, years, categories, descriptions, and local image paths. IDs 1–70 are the selection; films 26–31 are Hungarian films from 1994–2020, added on 2026-11-01 in place of the six oldest titles.
- `apps/web/public/data/links.json`: direct film pages, language, provider, check date, and a short note (length, subtitles, version). All current links are unofficial uploads on video-sharing sites (Videa, OK.ru, Indavideo, YouTube, Twitch); the site's info window says so once. Several links may belong to one film (A keresztapa has three).
- `apps/web/public/data/availability.csv`: review sheet for every title, downloadable from **Kezelés**.

**A checked page does not guarantee playback from Serbia.** On 2026-11-01 each link's page title and length were matched to the film. Uploads can be removed at any time, so check playback on your mother's device. A film without a link shows **Linkre vár**; search-results URLs are rejected.

The image collection contains real film posters and stills; sources are linked in each film's details. The opening Körhinta photograph is credited to Schandl Teréz / NFI Filmarchívum. Fonts and images are served locally.

## Maintain the selection

Open **Kezelés** in the footer, select a film and source, and enter the direct HTTPS film-page URL and access details. You can edit a link, add another one to the same film, or remove one from the local preview. Search-results URLs are rejected.

**The editor is a local preview, not a public write endpoint.** Its changes affect only the current browser. To publish them:

1. Export `links.json` from **Kezelés**.
2. Replace `apps/web/public/data/links.json` with the exported file.
3. Run `pnpm --filter @gyorgyi/cinema refresh-review` to update the availability CSV, then run the checks and build and deploy a new version through Sites.

The existing Sites project ID is retained in `.openai/hosting.json`. Reuse this project for future publishing so the URL and your mother's browser storage remain stable. The site is public by explicit request and uses `noindex,nofollow`; anyone with its URL can open it without signing in.

## Film journal and backups

Watched marks and favourites are stored in `localStorage`, independently for each browser and website origin. They survive normal reloads but do not sync between devices or survive clearing browser data. The website reports when browser storage is unavailable.

**Filmnaplóm → Biztonsági másolat** exports both sets of marks. **Mentés betöltése** restores them after confirmation. The original demo's version-1 `70-film-megnezett.json` file is also supported. Import validates the complete file before replacing existing marks. Marks for film IDs outside 1–70 are kept in the backup but not counted.

The link editor also uses browser-local storage. Its preview can be reset to the published list without affecting watched marks or favourites.
