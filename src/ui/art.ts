export const icons: Record<string, string> = {
  plus: '<rect x="4" y="4" width="24" height="24" rx="7"/><path d="M16 10v12M10 16h12"/>',
  door: '<path d="M7 27V5l16-3v28L7 27Zm16-20h5v20h-5"/><circle cx="18" cy="16" r="1"/>',
  back: '<path d="m14 7-9 9 9 9M6 16h22"/>',
  help: '<circle cx="16" cy="16" r="12"/><path d="M12 12a4 4 0 0 1 8 0c0 3-4 3-4 6m0 4h.01"/>',
  copy: '<rect x="9" y="9" width="18" height="20" rx="3"/><path d="M21 9V3H3v20h6"/>',
  play: '<path d="m9 4 19 12L9 28V4Z"/>',
  check: '<path d="m6 16 7 7L27 8"/>',
  clock: '<circle cx="16" cy="16" r="12"/><path d="M16 8v9h7"/>',
};
export function icon(name: string): string {
  return `<svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ""}</svg>`;
}
export function pawn(seat: number): string {
  return `<svg aria-hidden="true" class="pawn pawn-${seat}" viewBox="0 0 100 100"><ellipse cx="50" cy="88" rx="35" ry="8" fill="#153b80" opacity=".1"/><path d="M35 42 21 83Q50 96 79 83L65 42Z" fill="currentColor"/><circle cx="50" cy="29" r="22" fill="currentColor"/><ellipse cx="43" cy="22" rx="11" ry="8" fill="white" opacity=".16"/></svg>`;
}
export const emblem = `<svg class="emblem" aria-hidden="true" viewBox="0 0 500 300"><defs><filter id="paper-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="4" flood-color="#153b80" flood-opacity=".15"/></filter></defs><g filter="url(#paper-shadow)"><g transform="translate(128 12) rotate(-17 65 65)"><rect width="130" height="130" rx="22" fill="#fbf7e9"/><g fill="#153b80"><circle cx="33" cy="33" r="10"/><circle cx="97" cy="33" r="10"/><circle cx="65" cy="65" r="10"/><circle cx="33" cy="97" r="10"/><circle cx="97" cy="97" r="10"/></g></g><g transform="translate(272 30) rotate(17 60 60)"><rect width="120" height="120" rx="22" fill="#fffbf0"/><g fill="#153b80"><circle cx="29" cy="90" r="10"/><circle cx="60" cy="60" r="10"/><circle cx="91" cy="30" r="10"/></g></g><ellipse cx="250" cy="270" rx="204" ry="19" fill="#fff9e8"/><path d="M58 195 126 142 194 195v72H58Z" fill="#2d8bd3"/><path d="m49 194 77-61 77 61" fill="none" stroke="#2273bf" stroke-width="18" stroke-linejoin="round"/><path d="m308 195 66-53 67 53v72H308Z" fill="#40a75e"/><path d="m299 194 75-61 76 61" fill="none" stroke="#2b9147" stroke-width="18" stroke-linejoin="round"/><path d="m162 161 88-72 88 72v110H162Z" fill="#ffd35a"/><path d="m151 162 99-82 99 82" fill="none" stroke="#e97760" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/><g fill="#153b80"><path d="M230 272v-39a20 20 0 0 1 40 0v39Z"/><rect x="226" y="153" width="19" height="19" rx="3"/><rect x="255" y="153" width="19" height="19" rx="3"/><rect x="226" y="181" width="19" height="19" rx="3"/><rect x="255" y="181" width="19" height="19" rx="3"/></g><g fill="#fffbef"><path d="M105 207h17v17h-17Zm26 0h17v17h-17Zm-26 26h17v17h-17Zm26 0h17v17h-17ZM353 207h17v17h-17Zm26 0h17v17h-17Zm-26 26h17v17h-17Zm26 0h17v17h-17Z"/></g></g><g fill="#ffd35a"><path d="m53 110-27-19-8 15 33 13ZM45 143 9 135l-2 17 38-1ZM450 110l26-19 8 15-32 13ZM457 143l35-8 2 17-37-1Z"/></g></svg>`;
