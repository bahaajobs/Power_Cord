/* HTTP that works in both shells.
 *
 * In the Android build, requests go through Capacitor's native HTTP layer.
 * That matters more than it sounds: a WebView doing `fetch()` at a strip on
 * 192.168.x.x is blocked by CORS, because the strip's firmware sends no
 * Access-Control-Allow-Origin header and never will. Native requests are not
 * subject to CORS at all, which is precisely why direct-to-strip control needs
 * the app rather than a browser tab. */

const cap = () =>
  globalThis.CapacitorHttp || globalThis.Capacitor?.Plugins?.CapacitorHttp || null;

export const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.();

export class HttpError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * GET a URL and parse JSON. Rejects on timeout, transport failure, or a
 * non-2xx status — a strip that answers 401 is a different problem from one
 * that does not answer, and the UI says so.
 */
export async function getJson(url, { timeoutMs = 4000, headers = {} } = {}) {
  const native = cap();

  if (native) {
    let res;
    try {
      res = await native.get({ url, headers, connectTimeout: timeoutMs, readTimeout: timeoutMs });
    } catch (err) {
      throw new HttpError(err?.message || 'unreachable');
    }
    if (res.status < 200 || res.status >= 300) throw new HttpError(`HTTP ${res.status}`, res.status);
    if (typeof res.data === 'string') {
      try { return JSON.parse(res.data); } catch { throw new HttpError('unexpected reply'); }
    }
    return res.data;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers, cache: 'no-store' });
    if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status);
    return await res.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // In a browser this is where CORS lands, indistinguishable from the strip
    // being off. The message says both, because both are worth checking.
    throw new HttpError(
      err.name === 'AbortError' ? 'timed out' : (err.message || 'unreachable'),
    );
  } finally {
    clearTimeout(timer);
  }
}
