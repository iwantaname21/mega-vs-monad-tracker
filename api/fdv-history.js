// Edge proxy for CoinGecko /coins/{id}/market_chart.
//
// Why: CoinGecko's free tier rate-limits aggressively per-IP. On a fresh
// browser with no cache, the client's direct call can 429 and leave the
// FDV Multiple chart blank. Proxying server-side:
//   1. Shares one edge-cached response across ALL visitors, so the first
//      user per 30-min window pays the fetch cost and everyone else hits
//      the edge cache in <100ms.
//   2. Server IP has its own rate-limit budget, not contested by other
//      CoinGecko-hitting code paths in the browser tab (price, mcap).

export const config = { runtime: 'edge' };

const ALLOWED_IDS = new Set([
  'monad', 'binancecoin', 'solana', 'arbitrum',
]);

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const days = url.searchParams.get('days') || '90';

  if (!id || !ALLOWED_IDS.has(id)) {
    return new Response(JSON.stringify({ error: 'invalid id' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!/^\d{1,4}$/.test(days)) {
    return new Response(JSON.stringify({ error: 'invalid days' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const upstream = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  try {
    const r = await fetch(upstream, {
      headers: { 'accept': 'application/json' },
    });
    const body = await r.text();

    // Only cache good responses at the edge. A 429 or 5xx should NOT poison
    // the cache for the next 30 minutes.
    const cache = r.ok
      ? 'public, s-maxage=1800, stale-while-revalidate=7200'
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
