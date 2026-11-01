import { parseLinks, type Film, type WatchLink } from './domain.js';
import { downloadJson, element, escapeHtml, toast } from './dom.js';

// v2: films 26-60 were renumbered on 2026-11-01, so earlier previews point at the wrong films.
const KEY: string = 'gyorgyi-link-preview-v2';
type EditorState = { readonly kind: 'new' } | { readonly kind: 'existing'; readonly index: number };

export interface LinkManager {
  current(): readonly WatchLink[];
  open(): void;
}

export function createLinkManager(
  films: readonly Film[],
  published: readonly WatchLink[],
  onChange: () => void,
): LinkManager {
  let links: readonly WatchLink[] = published;
  try {
    const saved: string | null = localStorage.getItem(KEY);
    if (saved !== null) {
      const value: unknown = JSON.parse(saved);
      links = parseLinks(value);
    }
  } catch {
    toast('A helyi linkelőnézet nem olvasható. A közzétett filmoldalakat használjuk.');
  }
  const dialog: HTMLDialogElement = element('manager-dialog', HTMLDialogElement);
  const select: HTMLSelectElement = element('manage-film', HTMLSelectElement);
  const sourceSelect: HTMLSelectElement = element('manage-source', HTMLSelectElement);
  const removeButton: HTMLButtonElement = element('remove-link', HTMLButtonElement);
  let editor: EditorState = { kind: 'new' };
  const url: HTMLInputElement = element('manage-url', HTMLInputElement);
  const provider: HTMLInputElement = element('manage-provider', HTMLInputElement);
  const language: HTMLSelectElement = element('manage-language', HTMLSelectElement);
  const access: HTMLSelectElement = element('manage-access', HTMLSelectElement);
  const note: HTMLTextAreaElement = element('manage-note', HTMLTextAreaElement);
  const reviewed: HTMLInputElement = element('manage-reviewed', HTMLInputElement);
  const status: HTMLElement = element('manager-status', HTMLElement);
  select.innerHTML = films
    .map(
      (film: Film): string =>
        `<option value="${film.id}">${escapeHtml(film.title)} (${film.year})</option>`,
    )
    .join('');
  function populateSelected(): void {
    const index: number = Number(sourceSelect.value);
    const existing: WatchLink | undefined = sourceSelect.value === 'new' ? undefined : links[index];
    editor = existing === undefined ? { kind: 'new' } : { kind: 'existing', index };
    url.value = existing?.url ?? '';
    provider.value = existing?.provider ?? '';
    language.value = existing?.language ?? 'Magyar hang';
    access.value = existing?.availability ?? 'free';
    note.value = existing?.note ?? '';
    removeButton.hidden = existing === undefined;
    reviewed.checked = false;
  }
  function populate(preferredIndex?: number): void {
    sourceSelect.innerHTML =
      links
        .flatMap((link: WatchLink, index: number): string[] =>
          link.id === Number(select.value)
            ? [`<option value="${index}">${escapeHtml(link.provider)}</option>`]
            : [],
        )
        .join('') + '<option value="new">Új filmoldal hozzáadása</option>';
    if (preferredIndex !== undefined) sourceSelect.value = String(preferredIndex);
    populateSelected();
  }
  select.addEventListener('change', (): void => populate());
  sourceSelect.addEventListener('change', populateSelected);
  element('link-form', HTMLFormElement).addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    const availability: string = access.value;
    if (
      availability !== 'free' &&
      availability !== 'free-registration' &&
      availability !== 'unverified'
    )
      return;
    const link: WatchLink = {
      id: Number(select.value),
      url: url.value.trim(),
      provider: provider.value.trim(),
      language: language.value,
      checkedAt: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Belgrade' }).format(
        new Date(),
      ),
      note: note.value.trim(),
      evidenceUrl: url.value.trim(),
      availability,
    };
    try {
      parseLinks([link]);
      const editedIndex: number | undefined = editor.kind === 'existing' ? editor.index : undefined;
      if (
        links.some(
          (item: WatchLink, index: number): boolean =>
            item.id === link.id && item.url === link.url && index !== editedIndex,
        )
      ) {
        throw new Error(
          'Ez a filmoldal már szerepel ennél a filmnél. Válaszd ki a szerkesztéshez!',
        );
      }
      const updated: WatchLink[] =
        editedIndex === undefined
          ? [...links, link]
          : links.map((item: WatchLink, index: number): WatchLink =>
              index === editedIndex ? link : item,
            );
      localStorage.setItem(KEY, JSON.stringify(updated));
      links = updated;
      populate(editedIndex ?? updated.length - 1);
      status.textContent =
        'Helyi előnézet mentve. A másik eszközön látható oldal az exportálás és újratelepítés után frissül.';
      onChange();
      toast('A filmhivatkozás helyi előnézete elmentve.');
    } catch (error: unknown) {
      status.textContent =
        error instanceof Error ? error.message : 'A linket nem sikerült menteni.';
    }
  });
  removeButton.addEventListener('click', (): void => {
    if (
      editor.kind !== 'existing' ||
      !window.confirm('Eltávolítod ezt a filmoldalt a helyi előnézetből?')
    )
      return;
    const removedIndex: number = editor.index;
    const updated: WatchLink[] = links.filter(
      (_item: WatchLink, index: number): boolean => index !== removedIndex,
    );
    try {
      localStorage.setItem(KEY, JSON.stringify(updated));
      links = updated;
      populate();
      onChange();
      status.textContent =
        'A filmoldal eltávolítva a helyi előnézetből. A közzétett oldal nem változott.';
    } catch {
      status.textContent = 'A böngésző nem engedte a helyi előnézet mentését.';
    }
  });
  element('export-links', HTMLButtonElement).addEventListener('click', (): void => {
    downloadJson(links, 'links.json');
    status.textContent =
      'Linklista exportálva. Ezt a fájlt tedd az apps/web/public/data/links.json helyére, majd telepítsd újra az oldalt.';
  });
  element('restore-links', HTMLButtonElement).addEventListener('click', (): void => {
    if (!window.confirm('Visszaállítod a közzétett linklistát? A helyi linkmódosítások elvesznek.'))
      return;
    try {
      localStorage.removeItem(KEY);
      links = published;
      populate();
      onChange();
      status.textContent = 'A közzétett linklista visszaállítva.';
    } catch {
      status.textContent = 'A böngésző nem engedte a helyi előnézet törlését.';
    }
  });
  return {
    current: (): readonly WatchLink[] => links,
    open: (): void => {
      populate();
      dialog.showModal();
    },
  };
}
