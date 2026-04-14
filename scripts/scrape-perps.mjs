// Daily scraper: visits DefiLlama with a headless browser, pulls 24h perps
// volume for the protocols + chain totals we care about, and writes the result
// to public/data/perps.json so the static dashboard can read it.
//
// Runs inside .github/workflows/scrape-perps.yml — see that file for the cron.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

// Protocols to snapshot — matches what DefiLlama lists for each chain's perps.
// If you add a new native perps app, just append it here.
const PROTOCOLS = [
  { slug: 'world-markets',  chain: 'MegaETH', name: 'World Markets' },
  { slug: 'gmx-v2-perps',   chain: 'MegaETH', name: 'GMX V2 Perps'  },
  { slug: 'perpl',          chain: 'Monad',   name: 'Perpl'         },
  { slug: 'leverup',        chain: 'Monad',   name: 'LeverUp'       },
];
const CHAINS = ['MegaETH', 'Monad'];

// "$1.23m" / "$4.5K" / "$1,234" → number of USD.
function parseUsd(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\s+/g, '');
  const m = s.match(/\$?([\d,]+(?:\.\d+)?)\s*([BbMmKk]?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const suffix = m[2].toLowerCase();
  const mult = suffix === 'b' ? 1e9 : suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1;
  return n * mult;
}

// Waits for the page to hydrate past the Cloudflare interstitial.
async function waitForHydration(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  // The real content has $ values; the Cloudflare wall doesn't.
  await page.waitForFunction(
    () => /\$[\d,.]+[BbMmKk]?/.test(document.body.innerText || ''),
    null,
    { timeout: 45_000 }
  ).catch(() => {});
  await page.waitForTimeout(1500); // settle any lazy chunks
}

// Scrape one DefiLlama protocol page → returns its 24h perps volume.
async function scrapeProtocol(page, slug) {
  const url = `https://defillama.com/protocol/perps/${slug}`;
  console.log('→ protocol:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForHydration(page);

  // Find "24h volume" label and grab the adjacent $ value.
  const raw = await page.evaluate(() => {
    const labelRe = /24h\s*volume/i;
    const valRe   = /\$\s*[\d,]+(?:\.\d+)?\s*[BbMmKk]?/;
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      const txt = (el.innerText || '').trim();
      if (!labelRe.test(txt) || txt.length > 400) continue;
      // Same element often contains "24h Volume $1.23m"
      const same = txt.match(valRe);
      if (same) return same[0];
      // Otherwise scan the nearest parent's text.
      const parent = el.parentElement;
      if (parent) {
        const pm = (parent.innerText || '').match(valRe);
        if (pm) return pm[0];
      }
    }
    return null;
  });
  return { slug, value: parseUsd(raw), raw };
}

// Scrape one chain page → returns that chain's aggregate 24h perps volume.
async function scrapeChain(page, chain) {
  const url = `https://defillama.com/chain/${chain}`;
  console.log('→ chain:   ', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForHydration(page);

  const raw = await page.evaluate(() => {
    const labelRe = /perps?\s*volume\s*\(24h\)/i;
    const valRe   = /\$\s*[\d,]+(?:\.\d+)?\s*[BbMmKk]?/;
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      const txt = (el.innerText || '').trim();
      if (!labelRe.test(txt) || txt.length > 400) continue;
      const m = txt.match(valRe);
      if (m) return m[0];
      const parent = el.parentElement;
      if (parent) {
        const pm = (parent.innerText || '').match(valRe);
        if (pm) return pm[0];
      }
    }
    return null;
  });
  return { chain, value: parseUsd(raw), raw };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  const snapshot = {
    updatedAt: new Date().toISOString(),
    source: 'https://defillama.com',
    protocols: [],
    chains: {},
  };

  for (const p of PROTOCOLS) {
    try {
      const r = await scrapeProtocol(page, p.slug);
      snapshot.protocols.push({ ...p, volume24h: r.value, raw: r.raw });
      console.log(`  ${p.name} (${p.slug}) = ${r.value} (raw: ${r.raw})`);
    } catch (e) {
      console.warn(`  FAILED ${p.slug}:`, e.message);
      snapshot.protocols.push({ ...p, volume24h: null, raw: null, error: e.message });
    }
  }

  for (const chain of CHAINS) {
    try {
      const r = await scrapeChain(page, chain);
      snapshot.chains[chain] = { perpsVolume24h: r.value, raw: r.raw };
      console.log(`  ${chain} total = ${r.value} (raw: ${r.raw})`);
    } catch (e) {
      console.warn(`  FAILED ${chain}:`, e.message);
      snapshot.chains[chain] = { perpsVolume24h: null, raw: null, error: e.message };
    }
  }

  await browser.close();

  const outPath = path.resolve('public/data/perps.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n');
  console.log('wrote', outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
