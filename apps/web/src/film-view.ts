import type { Film, WatchLink } from './domain.js';
import { escapeHtml, icon } from './dom.js';
import type { Progress } from './progress.js';

export function cardMarkup(film: Film, links: readonly WatchLink[], progress: Progress): string {
  const watched: boolean = progress.watched.has(film.id);
  const favorite: boolean = progress.favorites.has(film.id);
  const linked: boolean = links.some((link: WatchLink): boolean => link.id === film.id);
  const title: string = escapeHtml(film.title);
  return `<article class="film-card${watched ? ' is-watched' : ''}" data-film-id="${film.id}">
    <div class="poster-area">
      <button class="poster-open" data-action="details" data-id="${film.id}" aria-label="${title} – részletek"><img src="${film.poster}" alt="${title} – filmplakát vagy filmkép" width="300" height="400" loading="lazy" decoding="async" /></button>
      <span class="film-number">${String(film.id).padStart(2, '0')} / 70</span>
      <button class="favorite-button" data-action="favorite" data-id="${film.id}" aria-pressed="${favorite}" aria-label="${title} ${favorite ? 'eltávolítása a kedvencekből' : 'a kedvencekhez adása'}">${icon('heart')}</button>
      ${watched ? `<span class="poster-status">${icon('check')} Már láttad</span>` : ''}
    </div>
    <div class="film-body">
      <p class="film-meta"><span>${film.year}</span><span class="meta-dot">·</span><span>${escapeHtml(film.category)}</span></p>
      <h3 class="film-title"><button data-action="details" data-id="${film.id}">${title}</button></h3>
      <p class="film-description">${escapeHtml(film.desc)}</p>
      ${linked ? '' : '<span class="source-badge missing">Linkre vár</span>'}
      <div class="card-actions"><button class="details-button${linked ? ' linked' : ''}" data-action="details" data-id="${film.id}">${icon(linked ? 'play' : 'info')}${linked ? 'Film megnyitása' : 'Részletek'}</button><button class="watched-button" data-action="watched" data-id="${film.id}" aria-pressed="${watched}" aria-label="${title} – ${watched ? 'még nem láttam' : 'megnéztem'}">${icon('check')}${watched ? 'Már láttam' : 'Láttam'}</button></div>
    </div>
  </article>`;
}

function sourceMarkup(link: WatchLink): string {
  const access: string =
    link.availability === 'free-registration'
      ? ' · Ingyenes, regisztrációval'
      : link.availability === 'unverified'
        ? ' · Hozzáférés ellenőrzendő'
        : '';
  return `<div class="watch-source"><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${icon('play')} ${escapeHtml(link.provider)} ${icon('external')}</a><small>${escapeHtml(link.language)}${access}<br />${escapeHtml(link.note)}</small></div>`;
}

export function detailMarkup(film: Film, links: readonly WatchLink[], progress: Progress): string {
  const sources: WatchLink[] = links.filter((link: WatchLink): boolean => link.id === film.id);
  const watched: boolean = progress.watched.has(film.id);
  const favorite: boolean = progress.favorites.has(film.id);
  return `<div class="movie-layout"><img class="movie-poster" src="${film.poster}" alt="${escapeHtml(film.title)} – filmplakát vagy filmkép" width="300" height="450" /><div class="movie-info"><p class="eyebrow">${String(film.id).padStart(2, '0')} / 70 TÖRTÉNET</p><h2 id="movie-title">${escapeHtml(film.title)}</h2><p class="film-meta">${film.year}<span>·</span>${escapeHtml(film.category)}</p><p class="movie-desc">${escapeHtml(film.desc)}</p>
    ${sources.length > 0 ? `<div class="watch-sources">${sources.map(sourceMarkup).join('')}</div>` : '<div class="no-source"><h3>Ehhez a történethez még keressük az utat.</h3><p>Jelenleg nincs hozzá filmoldal.</p></div>'}
    <div class="dialog-actions"><button class="button ${watched ? 'primary' : 'secondary'}" data-action="watched" data-id="${film.id}" aria-pressed="${watched}">${icon('check')}${watched ? 'Már láttam' : 'Megnéztem'}</button><button class="button secondary" data-action="favorite" data-id="${film.id}" aria-pressed="${favorite}">${icon('heart')}${favorite ? 'Kedvencem' : 'Kedvencekhez'}</button></div>
    ${film.imageSource ? `<a class="image-credit" href="${escapeHtml(film.imageSource)}" target="_blank" rel="noopener noreferrer">Plakát / filmkép forrása ${icon('external')}</a>` : ''}
    </div></div>`;
}

export function handleBrokenImages(root: HTMLElement): void {
  root.querySelectorAll<HTMLImageElement>('img').forEach((image: HTMLImageElement): void => {
    image.addEventListener(
      'error',
      (): void => {
        const placeholder: HTMLDivElement = document.createElement('div');
        placeholder.className = 'poster-placeholder';
        placeholder.innerHTML = `${icon('film')}<span>${escapeHtml(image.alt.replace(' – filmplakát vagy filmkép', ''))}</span>`;
        image.replaceWith(placeholder);
      },
      { once: true },
    );
  });
}
