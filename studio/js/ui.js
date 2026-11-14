import { pillarTag } from './lib/pillars.js?v=20261113a';
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

let toastTimer;
// action { label, href, onClick } adds one link after the message (Insights's "Xem"); the toast then stays longer.
export function toast(message, action = null) {
  const el = document.getElementById('toast');
  el.textContent = message;
  if (action) {
    const a = document.createElement('a');
    a.className = 'toast-act';
    a.href = action.href;
    a.textContent = action.label;
    a.addEventListener('click', () => { action.onClick?.(); el.classList.remove('show'); });
    el.append(' ', a);
  }
  // A popover sits in the top layer, above any open dialog. Hiding it first puts it above a dialog that opened after
  // the last toast; it stays open between toasts, and the show class does the fading.
  if (el.showPopover) {
    try { el.hidePopover(); } catch { /* not open yet */ }
    try { el.showPopover(); } catch { /* no popover attribute: the toast stays a fixed box */ }
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2400);
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

// Profile pictures by member id (Nam, 2026-11-04), filled from the team at sign-in and after she changes hers.
const faces = new Map();
export function setFaces(members) {
  faces.clear();
  for (const m of members ?? []) if (m.avatar_url) faces.set(m.id, m.avatar_url);
}
export function setFace(id, url) {
  if (url) faces.set(id, url); else faces.delete(id);
}
// What goes inside an avatar: her photo when she set one, else her first letter.
export function faceInner(member) {
  const letter = initial(member?.name);
  const url = member?.id ? faces.get(member.id) : null;
  return url ? `<img src="${esc(url)}" alt="" data-face="${esc(letter)}" loading="lazy" decoding="async" draggable="false">` : esc(letter);
}
// The round avatar used across Studio, <i class="av">.
export const face = (member, cls = '') => `<i class="av${cls ? ` ${cls}` : ''}">${faceInner(member)}</i>`;
// A photo that fails to load turns back into her letter.
if (typeof document !== 'undefined') {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.face != null) img.replaceWith(img.dataset.face);
  }, true);
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
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8.5 21h7M9.5 17.5h5"/>',
  flame: '<path d="M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.5-5.3 3.6-8.3.4 2 1.4 3 2.4 3.6.3-2.9 1.7-5.6 4-7.1-.4 2.6.4 4.6 1.8 6.4 1.2 1.6 1.7 3 1.7 5.3 0 3.6-3 6.3-7 6.3z"/><path d="M12 21.5c-1.6 0-2.8-1.2-2.8-2.8 0-1.9 1.6-2.7 2.3-4.5.9 1 3.3 2.4 3.3 4.6 0 1.5-1.2 2.7-2.8 2.7z"/>',
  crown: '<path d="M3.5 8.5 7.5 12 12 5l4.5 7 4-3.5-1.8 10H5.3z"/><path d="M5.5 21h13"/>',
  reply: '<path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.3a8.4 8.4 0 1 1 15.5-4.6z"/>',
  repost: '<path d="M17 3.5 20.5 7 17 10.5"/><path d="M4 12V10a3 3 0 0 1 3-3h13.5M7 20.5 3.5 17 7 13.5"/><path d="M20 12v2a3 3 0 0 1-3 3H3.5"/>',
  feedback: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  camera: '<path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h1.8l1.6-2.2h5.2L16.2 6H18a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/><circle cx="12" cy="12.8" r="3.6"/>',
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
  store: '<path d="M5.5 8h13l-1.1 11.2a1.5 1.5 0 0 1-1.5 1.3H8.1a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  dumbbell: '<rect x="2.5" y="9.2" width="3" height="5.6" rx="1.2"/><rect x="5.5" y="6.5" width="3.2" height="11" rx="1.4"/><rect x="15.3" y="6.5" width="3.2" height="11" rx="1.4"/><rect x="18.5" y="9.2" width="3" height="5.6" rx="1.2"/><path d="M8.7 12h6.6"/>',
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
  // Insights (2026-11-07).
  bulb: '<path d="M9.2 18h5.6M10.2 21h3.6"/><path d="M12 3a6.2 6.2 0 0 0-3.8 11.1c.8.6 1.2 1.4 1.2 2.4h5.2c0-1 .4-1.8 1.2-2.4A6.2 6.2 0 0 0 12 3z"/>',
  pen: '<path d="M4 20h4.2L19.4 8.8a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8z"/><path d="M13.5 6.3l4.2 4.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  hash: '<path d="M5 9.2h14.5M4.5 14.8H19M10.2 4 8.2 20M15.8 4l-2 16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M4.5 11.8 20 4.5l-5.6 15.2-3.2-6.4z"/><path d="M11.2 13.3 20 4.5"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  agree: '<path d="M7.5 10.5v9H4.5v-9zM7.5 19.5h9.2a2 2 0 0 0 2-1.6l1.2-6a2 2 0 0 0-2-2.4h-4.4l.7-3.6a1.8 1.8 0 0 0-3.4-1.1L7.5 10.5"/>',
  smile: '<circle cx="11" cy="12.5" r="8"/><path d="M7.8 14.6a4 4 0 0 0 6.4 0M8.6 10.2v.4M13.4 10.2v.4"/><path d="M19.5 2.5v5M17 5h5"/>',
  thread: '<path d="M6 3.5v9.5a4 4 0 0 0 4 4h9"/><path d="M15.5 13.5 19 17l-3.5 3.5"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;

// The card's content pillar (migration content_pillars), then short labels for its two predictions.
export function cardTags(card, { dark = false } = {}) {
  const engine = { ask: ['ask', 'Hỏi'], line: ['line', 'Một câu'] }[card?.engine];
  const pull = { strong: 'Lan mạnh', some: 'Lan vừa' }[card?.pull];
  return `${pillarTag(card?.pillar ?? null)}${engine ? `<span class="tag${dark ? ' line' : ''}">${icon(engine[0])}${engine[1]}</span>` : ''}${pull
    ? `<span class="tag ${card.pull === 'strong' ? 'gold' : 'line'}">${card.pull === 'strong' ? icon('bolt') : ''}${pull}</span>` : ''}`;
}
