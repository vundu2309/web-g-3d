const paths: Record<string, string> = {
  jail: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M8 3v18M16 3v18M3 9h18M3 15h18"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01"/>',
  assets: '<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  trade: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  buy: '<circle cx="15" cy="6" r="3"/><path d="M3 13h4l3-2h5a2 2 0 0 1 0 4h-3m-5 4h8l7-6M3 12v9h4v-9"/>',
  auction: '<path d="m14 3 7 7-3 3-7-7Zm-5 5 7 7-3 3-7-7ZM3 21l8-8m5 8h6"/>',
  back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  house: '<path d="m3 11 9-8 9 8M5 10v11h14V10m-10 11v-7h6v7"/>',
  wallet:
    '<path d="M4 5h15v15H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm10 6h8v5h-8Z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  next: '<path d="M3 12h18m-7-7 7 7-7 7"/>',
  settings:
    '<path d="m9 3-1 3-3 1v4l-2 1 2 2v4l3 1 1 3h6l1-3 3-1v-4l2-2-2-1V7l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a5 5 0 0 1 8 0m-4 4h.01"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  trophy:
    '<path d="M7 3h10v7a5 5 0 0 1-10 0Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v6m-4 0h8"/>',
};
export function glyph(name: string): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.next}</svg>`;
}
export const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
