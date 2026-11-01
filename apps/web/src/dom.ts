export type IconName =
  | 'film'
  | 'heart'
  | 'check'
  | 'play'
  | 'search'
  | 'arrow'
  | 'close'
  | 'shuffle'
  | 'download'
  | 'upload'
  | 'settings'
  | 'spark'
  | 'info'
  | 'external';

const paths: Record<IconName, string> = {
  film: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  play: '<path d="m9 5 11 7-11 7V5Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  shuffle:
    '<path d="m16 3 4 4-4 4m0 2 4 4-4 4M3 7h3c5 0 5 10 10 10h4M3 17h3c2 0 3-2 4-4m3-2c1-2 2-4 4-4h3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
};

export function icon(name: IconName): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function element<T extends HTMLElement>(id: string, ctor: { new (): T }): T {
  const node: HTMLElement | null = document.getElementById(id);
  if (!(node instanceof ctor)) throw new Error(`Hiányzó oldalrész: ${id}`);
  return node;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character: string): string => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string): void {
  const target: HTMLElement = element('toast', HTMLElement);
  target.textContent = message;
  target.classList.add('visible');
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = setTimeout((): void => target.classList.remove('visible'), 4200);
}

export function downloadJson(value: unknown, name: string): void {
  const blob: Blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout((): void => URL.revokeObjectURL(url), 5000);
}

export function closeOnBackdrop(dialog: HTMLDialogElement): void {
  dialog.addEventListener('click', (event: MouseEvent): void => {
    if (event.target !== dialog) return;
    const bounds: DOMRect = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  });
}
