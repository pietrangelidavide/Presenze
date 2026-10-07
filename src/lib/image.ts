// Lettura e ritaglio della foto del profilo (solo nel browser).
import { AVATAR_MAX_CHARS, AVATAR_SIZE, type Crop } from './profile';

export class ImageError extends Error {}

export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

const MAX_BYTES = 25 * 1024 * 1024;

/** Apre un'immagine scelta dall'utente rispettando l'orientamento della fotocamera. */
export async function readImage(file: File): Promise<LoadedImage> {
  const looksLikeImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
  if (!looksLikeImage) throw new ImageError('Scegli un file immagine (JPG, PNG o WebP).');
  if (file.size > MAX_BYTES) throw new ImageError('La foto è troppo grande: il massimo è 25 MB.');
  if (typeof createImageBitmap === 'function') {
    for (const opts of [{ imageOrientation: 'from-image' as const }, undefined]) {
      try {
        const bmp = opts ? await createImageBitmap(file, opts) : await createImageBitmap(file);
        return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
      } catch { /* si prova il metodo successivo */ }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageError('Non riesco ad aprire questa immagine. Prova con una foto JPG o PNG.');
  }
}

/** Ritaglia la parte visibile nel riquadro e la riduce a una foto quadrata (JPEG, come testo). */
export function renderAvatar(img: LoadedImage, view: number, crop: Crop, out = AVATAR_SIZE): string {
  const f = out / view;
  // Si scende in due passaggi: ridurre una foto enorme in un colpo solo la rende seghettata.
  const mid = document.createElement('canvas');
  mid.width = mid.height = out * 2;
  const mg = mid.getContext('2d');
  if (!mg) throw new ImageError('Il browser non riesce a preparare la foto.');
  mg.fillStyle = '#fff';
  mg.fillRect(0, 0, mid.width, mid.height);
  mg.imageSmoothingQuality = 'high';
  mg.drawImage(img.source, crop.ox * f * 2, crop.oy * f * 2, crop.w * f * 2, crop.h * f * 2);

  const c = document.createElement('canvas');
  c.width = c.height = out;
  const g = c.getContext('2d');
  if (!g) throw new ImageError('Il browser non riesce a preparare la foto.');
  g.imageSmoothingQuality = 'high';
  g.drawImage(mid, 0, 0, out, out);
  for (const q of [0.88, 0.78, 0.66, 0.5]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.startsWith('data:image/jpeg') && url.length <= AVATAR_MAX_CHARS) return url;
  }
  throw new ImageError('La foto è troppo pesante, anche dopo averla compressa. Provane un’altra.');
}
