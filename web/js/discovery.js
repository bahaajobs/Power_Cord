/* Find strips on the local network.
 *
 * Sweeps a /24 for anything that answers Tasmota's command endpoint. Only
 * useful in the Android build: a browser cannot make these requests because
 * the strips send no CORS headers. */

import { probe } from './direct.js';
import { isNative } from './net.js';

export const canScan = () => isNative();

/**
 * Probe every address in `base` (e.g. "192.168.1"). Runs in batches so a
 * phone is not asked to open 254 sockets at once, and reports progress so the
 * UI can show something moving during the ~20 seconds this takes.
 */
export async function scanSubnet(base, { onProgress, batch = 24, timeoutMs = 1200, signal } = {}) {
  const found = [];
  let done = 0;
  const addrs = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);

  for (let i = 0; i < addrs.length; i += batch) {
    if (signal?.aborted) break;
    const slice = addrs.slice(i, i + batch);
    const results = await Promise.allSettled(slice.map((ip) => probe(`${ip}:80`, { timeoutMs })));
    for (const r of results) if (r.status === 'fulfilled') found.push(r.value);
    done += slice.length;
    onProgress?.({ done, total: addrs.length, found: found.length });
  }
  return found;
}

/** Guess the /24 the phone is on, from an address the user already reached. */
export function subnetFrom(host) {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}/.exec(String(host || ''));
  return m ? m[1] : null;
}
