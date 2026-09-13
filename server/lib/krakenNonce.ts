/**
 * Shared Kraken nonce + request serializer.
 *
 * Kraken requires the nonce to strictly increase per API key, otherwise it
 * rejects the request with "EAPI:Invalid nonce". Two failure modes caused the
 * intermittent error:
 *   1. Date.now()*1000 has millisecond granularity — two calls in the same ms
 *      produced an identical nonce.
 *   2. The frontend routes (kraken.ts) and the server bot (botEngine.ts) signed
 *      requests independently with the same key, so concurrent requests could
 *      reach Kraken out of nonce order.
 *
 * nextKrakenNonce() guarantees a monotonically increasing value process-wide.
 * krakenSerialize() runs private calls one at a time so their nonces also
 * arrive at Kraken in order.
 */

let lastNonce = 0;

export function nextKrakenNonce(): string {
  let n = Date.now() * 1000;
  if (n <= lastNonce) n = lastNonce + 1;
  lastNonce = n;
  return String(n);
}

let chain: Promise<unknown> = Promise.resolve();

export function krakenSerialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => undefined, () => undefined);
  return run as Promise<T>;
}
