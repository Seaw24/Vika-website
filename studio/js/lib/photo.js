// A profile picture (Nam, 2026-11-04): the middle square of her photo, at most 320 px on a side, as a JPEG. A phone
// photo of several MB becomes about 30 KB, so every avatar on the page loads at once. White fills a transparent PNG,
// since JPEG has no transparency and would turn it black.
export const PHOTO_SIZE = 320;

// The largest square in the middle of a w by h picture, and the side of the output (never larger than the source).
export function squareCrop(w, h, size = PHOTO_SIZE) {
  const side = Math.min(w, h);
  return { sx: (w - side) / 2, sy: (h - side) / 2, side, out: Math.max(1, Math.min(size, Math.round(side))) };
}

// The browser turns a phone photo upright from its EXIF data in both routes.
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to an <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function squarePhoto(file, size = PHOTO_SIZE) {
  const img = await decode(file);
  const w = img.naturalWidth ?? img.width;
  const h = img.naturalHeight ?? img.height;
  if (!w || !h) throw new Error('empty image');
  const { sx, sy, side, out } = squareCrop(w, h, size);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, out, out);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, side, side, 0, 0, out, out);
  img.close?.();
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.86));
  if (!blob) throw new Error('no blob');
  return blob;
}
