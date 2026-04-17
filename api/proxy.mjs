// Same-origin proxy for the dashboard's upstream data sources.
// Routes: /api/proxy?host=llama&path=/v2/chains
//         /api/proxy?host=stablecoins&path=/stablecoins
//         /api/proxy?host=coingecko&path=/api/v3/simple/price&q=ids%3Dmonad...
//         /api/proxy?host=treasury&path=/services/...
//
// Runs on Vercel's Edge runtime — low-latency (V8 isolate, no cold-start
// warmup) so user-facing latency is dominated by upstream fetch time, not
// function boot. Server-to-server fetch also bypasses Cloudflare bot-checks
// and browser extensions/firewalls that block api.llama.fi / api.coingecko.com.
//
// Edge cache: s-maxage=1800 means a 30-minute fresh window per URL on
// Vercel's CDN — most requests short-circuit at the edge with no upstream
// call. stale-while-revalidate=7200 means even after 30 min, users get the
// cached payload instantly while a revalidation runs in the background.

export const config = { runtime: 'edge' };

const HOSTS = {
  llama: 'https://api.llama.fi',
  stablecoins: 'https://stablecoins.llama.fi',
  coingecko: 'https://api.coingecko.com',
  treasury: 'https://api.fiscaldata.treasury.gov',
  hyperliquid: 'https://api.hyperliquid.xyz',
};

// POSTs (Hyperliquid) aren't cacheable on Vercel's CDN, so use a short
// in-isolate memo to at least coalesce rapid repeats. GETs get the long CDN TTL.
const POST_CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';
const GET_CACHE_HEADER  = 'public, s-maxage=1800, stale-while-revalidate=7200';

export default async function handler(req) {
  const url = new URL(req.url);
  const host = url.searchParams.get('host');
  const path = url.searchParams.get('path');
  const q = url.searchParams.get('q') || '';
  const base = HOSTS[host];
  if (!base || typeof path !== 'string' || !path.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'bad request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const target = base + path + (q ? (path.includes('?') ? '&' : '?') + q : '');
  const isPost = req.method === 'POST';
  try {
    const init = {
      method: req.method,
      headers: {
        'accept': 'application/json',
        'user-agent': 'mega-vs-monad-dashboard/1.0',
      },
    };
    if (isPost) {
      init.headers['content-type'] = 'application/json';
      init.body = await req.text();
    }
    const upstream = await fetch(target, init);
    const body = await upstream.text();
    // Only cache 2xx responses. A pinned 5xx or 4xx on the edge would keep
    // the dashboard broken for up to 30 min.
    const cacheHeader = upstream.ok
      ? (isPost ? POST_CACHE_HEADER : GET_CACHE_HEADER)
      : 'no-store';
    const headers = {
      'access-control-allow-origin': '*',
      'cache-control': cacheHeader,
      'content-type': upstream.headers.get('content-type') || 'application/json',
    };
    return new Response(body, { status: upstream.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream fetch failed', detail: String(e) }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
