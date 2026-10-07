/**
 * Fa scaricare un testo come file.
 *
 * - Sul sito normale (Cloudflare, computer locale) usa il solito download del browser.
 * - Dentro la pagina di anteprima di Claude i download "fatti da soli" sono bloccati:
 *   lì si passa dalla funzione "downloads", che chiede conferma a chi guarda.
 */

type SaveFn = (req: { filename: string; data: string }) => Promise<unknown>;
type ClaudeRuntime = { use?: (name: string) => Promise<{ save?: SaveFn } | null> };

export type DownloadResult = 'saved' | 'declined' | 'failed';

function runtime(): ClaudeRuntime | null {
  try {
    const c = (globalThis as { claude?: ClaudeRuntime }).claude;
    return c && typeof c.use === 'function' ? c : null;
  } catch {
    return null;
  }
}

function viaBrowser(filename: string, text: string, mime: string): DownloadResult {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export async function download(filename: string, text: string, mime = 'text/plain;charset=utf-8'): Promise<DownloadResult> {
  const rt = runtime();
  if (!rt) return viaBrowser(filename, text, mime);
  try {
    const dl = await rt.use!('downloads');
    if (dl && typeof dl.save === 'function') {
      await dl.save({ filename, data: text });
      return 'saved';
    }
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'declined') return 'declined';
    return 'failed';
  }
  // Funzione non disponibile in questa vista: ci provo comunque col browser.
  return viaBrowser(filename, text, mime);
}
