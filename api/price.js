// Edge proxy for CoinGecko /simple/price.
//
// Same story as fdv-history.js — free-tier rate limit is per-IP, so sharing
// one server-side fetch across all users gives a stable, fast response that
// doesn't contend with the browser's other CoinGecko calls.

export const config = { runtime: 'edge' };

const ALLOWED_IDS = new Set([
  'monad', 'binancecoin', 'solana', 'arbitrum',
]);

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id || !ALLOWED_IDS.has(id)) {
    // Cache the rejection — a missing/unknown id is deterministic, so the
    // CDN can serve it without hitting our function (prevents DoS via
    // repeated bogus ids with cache-busting query params).
    return new Response(JSON.stringify({ error: 'invalid id' }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=3600',
      },
    });
  }

  const upstream = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`;
  try {
    const r = await fetch(upstream, {
      headers: { 'accept': 'application/json' },
    });
    const body = await r.text();
    const cache = r.ok
      ? 'public, s-maxage=120, stale-while-revalidate=600'
      : 'no-store';
    return new Response(body, {
      status: r.status,
      headers: {
        'content-type': r.headers.get('content-type') || 'application/json',
        'cache-control': cache,
        'access-control-allow-origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'upstream fetch failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
