import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const pages = ['index.html', 'about.html', 'support.html', 'privacy.html'];
let links = 0;
for (const page of pages) {
  const html = await fs.readFile(page, 'utf8');
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${page}: one main heading`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page}: unique IDs`);
  assert.ok(!html.includes('\uFFFD'), `${page}: valid text`);
  for (const [, value] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:)/.test(value) || value === '#') continue;
    const url = new URL(value, `https://vika.local/${page}`);
    let file = decodeURIComponent(url.pathname).slice(1) || 'index.html';
    if (!path.extname(file)) file += '.html';
    await fs.access(file);
    if (url.hash) {
      const target = file === page ? html : await fs.readFile(file, 'utf8');
      assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${page}: missing ${value}`);
    }
    links++;
  }
}
console.log(`Passed ${pages.length} public pages and ${links} local asset/link checks.`);
