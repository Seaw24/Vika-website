const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  // A popover sits in the top layer, above any open dialog. Hiding it first puts it above a dialog that opened after
  // the last toast; it stays open between toasts, and the show class does the fading.
  if (el.showPopover) {
    try { el.hidePopover(); } catch { /* not open yet */ }
    try { el.showPopover(); } catch { /* no popover attribute: the toast stays a fixed box */ }
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function firstLine(text, max = 80) {
  const line = String(text ?? '').split('\n').find((l) => l.trim()) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// Unsent edits survive the member switching to the Threads app and back.
export const draftStore = {
  get(key) { try { return localStorage.getItem(`studio.draft.${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`studio.draft.${key}`, value); } catch { /* storage blocked */ } },
  drop(key) { try { localStorage.removeItem(`studio.draft.${key}`); } catch { /* storage blocked */ } },
};

// First letter for an avatar: the name's last word (Vietnamese given name), or the handle's first letter.
export function initial(name) {
  const words = String(name ?? '').replace(/^@/, '').trim().split(/\s+/);
  return (words.at(-1) || '?').charAt(0);
}

// Textareas grow with their text, so a post is never clipped inside a scroll box.
export function autoGrow(area) {
  const fit = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };
  area.addEventListener('input', fit);
  fit();
}

const PATHS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  stats: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
  feedback: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  out: '<path d="M7 17 17 7M9 7h8v8"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  pin: '<path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z"/>',
  ask: '<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5"/><circle cx="12" cy="12" r="9.5"/>',
  line: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  tiktok: '<rect x="5" y="2.5" width="14" height="19" rx="3.5"/><path d="M10.5 9.2v5.6l4.6-2.8z"/>',
  play: '<path d="M8 5.2v13.6L19 12z"/>',
  threads: '<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.3a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 6.9"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bookmark: '<path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v16l-6.5-4.3L5.5 21V5A1.5 1.5 0 0 1 7 3.5z"/>',
  stack: '<rect x="4" y="9" width="16" height="11.5" rx="2.5"/><path d="M6.5 5.8h11M9 2.8h6"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;

// Short labels for the card's two predictions.
export function cardTags(card, { dark = false } = {}) {
  const engine = { ask: ['ask', 'Hỏi'], line: ['line', 'Một câu'] }[card?.engine];
  const pull = { strong: 'Lan mạnh', some: 'Lan vừa' }[card?.pull];
  return `${engine ? `<span class="tag${dark ? ' line' : ''}">${icon(engine[0])}${engine[1]}</span>` : ''}${pull
    ? `<span class="tag ${card.pull === 'strong' ? 'gold' : 'line'}">${card.pull === 'strong' ? icon('bolt') : ''}${pull}</span>` : ''}`;
}
