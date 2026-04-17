// Same-origin proxy for the dashboard's upstream data sources.
// Routes: /api/proxy?host=llama&path=/v2/chains
//         /api/proxy?host=stablecoins&path=/stablecoins
//         /api/proxy?host=coingecko&path=/api/v3/simple/price&q=ids%3Dmonad...
//         /api/proxy?host=treasury&path=/services/...
// Server-to-server fetch bypasses Cloudflare bot-checks and browser
// extensions/firewalls that block api.llama.fi or api.coingecko.com.

const HOSTS = {
  llama: 'https://api.llama.fi',
  stablecoins: 'https://stablecoins.llama.fi',
  coingecko: 'https://api.coingecko.com',
  treasury: 'https://api.fiscaldata.treasury.gov',
};

export default async function handler(req, res) {
  const { host, path, q } = req.query || {};
  const base = HOSTS[host];
  if (!base || typeof path !== 'string' || !path.startsWith('/')) {
    res.status(400).json({ error: 'bad request' });
    return;
  }
  const target = base + path + (q ? (path.includes('?') ? '&' : '?') + q : '');
  try {
    const upstream = await fetch(target, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'mega-vs-monad-dashboard/1.0',
      },
    });
    const body = await upstream.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.status(upstream.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(e) });
  }
}
