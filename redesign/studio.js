import { directions } from './directions.js';

const gallery = document.getElementById('gallery');
const viewer = document.getElementById('viewer');
const preview = document.getElementById('full-preview');
const directionSelect = document.getElementById('direction-select');
const note = document.getElementById('review-note');
let shortlist = new Set();
try {
  const saved = JSON.parse(localStorage.getItem('vika-website-review-v1') || '{}');
  if (Array.isArray(saved.shortlist)) shortlist = new Set(saved.shortlist.filter(id => directions.some(item => item.id === id)));
  note.value = typeof saved.note === 'string' ? saved.note : '';
} catch { /* The review still works when browser storage is unavailable. */ }

document.getElementById('directions').innerHTML = directions.map(direction => `
  <article class="direction-card">
    <div class="direction-top"><span>${direction.tone}</span><button class="shortlist-button" type="button" data-shortlist="${direction.id}" aria-pressed="false" aria-label="Shortlist ${direction.name}"><span aria-hidden="true">+</span> Shortlist</button></div>
    <a class="thumbnail" href="?view=${direction.id}" data-open="${direction.id}" aria-label="Explore ${direction.name}"><img src="previews/${direction.id}.png" width="1280" height="720" alt="${direction.name} homepage preview" loading="lazy"></a>
    <div class="direction-caption"><span class="direction-number">${direction.number}</span><div><h2><a href="?view=${direction.id}" data-open="${direction.id}">${direction.name}</a></h2><p>${direction.description}</p><p class="fit">${direction.fit}</p></div></div>
  </article>`).join('');

directionSelect.innerHTML = directions.map(item => `<option value="${item.id}">${item.number} / ${item.name}</option>`).join('');

function persist() {
  try { localStorage.setItem('vika-website-review-v1', JSON.stringify({shortlist: [...shortlist], note: note.value})); } catch { /* Keep the current in-memory selection. */ }
}

function updateShortlist() {
  document.querySelectorAll('[data-shortlist]').forEach(button => {
    const selected = shortlist.has(button.dataset.shortlist);
    button.setAttribute('aria-pressed', String(selected));
    button.innerHTML = `<span aria-hidden="true">${selected ? '✓' : '+'}</span> ${selected ? 'Shortlisted' : 'Shortlist'}`;
  });
  const names = directions.filter(item => shortlist.has(item.id)).map(item => `${item.number} ${item.name}`);
  document.getElementById('shortlist-status').textContent = names.length ? `Your shortlist: ${names.join(', ')}.` : 'Shortlist any directions you want to compare.';
}

document.querySelectorAll('[data-shortlist]').forEach(button => button.addEventListener('click', () => {
  const id = button.dataset.shortlist;
  shortlist.has(id) ? shortlist.delete(id) : shortlist.add(id);
  updateShortlist(); persist();
}));
note.addEventListener('input', persist);
updateShortlist();

function showFromUrl() {
  const query = new URLSearchParams(location.search);
  const direction = directions.find(item => item.id === query.get('view'));
  const mobile = query.get('device') === 'mobile';
  gallery.hidden = Boolean(direction);
  viewer.hidden = !direction;
  document.body.classList.toggle('viewing', Boolean(direction));
  if (!direction) {
    preview.removeAttribute('src');
    document.title = 'Vika · Website directions';
    return;
  }
  const src = `concept.html?direction=${direction.id}&embed=1`;
  if (preview.getAttribute('src') !== src) preview.src = src;
  preview.title = `${direction.name} ${mobile ? 'mobile' : 'desktop'} preview`;
  directionSelect.value = direction.id;
  document.querySelector('.preview-stage').classList.toggle('mobile', mobile);
  document.querySelectorAll('[data-device]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.device === 'mobile') === mobile)));
  document.getElementById('viewer-description').textContent = direction.difference;
  document.getElementById('viewport-label').textContent = mobile ? '390 px mobile preview' : 'Responsive desktop preview';
  document.getElementById('open-page').href = `concept.html?direction=${direction.id}`;
  document.title = `Vika · ${direction.name}`;
}

function openDirection(id, device = 'desktop') {
  const query = new URLSearchParams({view: id});
  if (device === 'mobile') query.set('device', 'mobile');
  history.pushState(null, '', `?${query}`);
  showFromUrl();
}

document.querySelectorAll('[data-open]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openDirection(link.dataset.open);
  document.getElementById('back-gallery').focus();
}));
document.getElementById('back-gallery').addEventListener('click', () => {
  const previous = directionSelect.value;
  history.pushState(null, '', 'index.html#directions');
  showFromUrl();
  document.querySelector(`[data-open="${previous}"]`).focus();
});
directionSelect.addEventListener('change', () => openDirection(directionSelect.value, new URLSearchParams(location.search).get('device') || 'desktop'));
document.querySelectorAll('[data-device]').forEach(button => button.addEventListener('click', () => openDirection(directionSelect.value, button.dataset.device)));
window.addEventListener('popstate', showFromUrl);
showFromUrl();

document.getElementById('copy-feedback').addEventListener('click', async () => {
  const names = directions.filter(item => shortlist.has(item.id)).map(item => `${item.number} ${item.name}`);
  const feedback = `Vika website feedback\nShortlist: ${names.length ? names.join(', ') : 'No direction selected yet'}\n${note.value.trim() || 'I would like to discuss these directions.'}`;
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(feedback);
    status.textContent = 'Copied. Paste it into this conversation.';
  } catch {
    note.value = feedback;
    note.focus(); note.select();
    status.textContent = 'Select and copy the text above, then paste it here.';
  }
});
