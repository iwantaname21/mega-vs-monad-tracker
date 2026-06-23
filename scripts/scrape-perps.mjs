// Daily scraper: visits DefiLlama with a headless browser, pulls 24h perps
// volume for the protocols + chain totals we care about, and writes the result
// to public/data/perps.json so the static dashboard can read it.
//
// Runs inside .github/workflows/scrape-perps.yml — see that file for the cron.

import { chromium as rawChromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'node:fs/promises';
import path from 'node:path';

rawChromium.use(stealth());
const chromium = rawChromium;

// Protocols to snapshot — matches what DefiLlama lists for each chain's perps.
// If you add a new native perps app, just append it here.
// `aliases` are alternate display names DefiLlama uses for the protocol on
// its chain-filtered pages — e.g. "GMX V2 Perps" on the protocol page is
// rendered as just "GMX" on the MegaETH chain page.
const PROTOCOLS = [
  // MegaETH
  { slug: 'world-markets',     chain: 'MegaETH', name: 'World Markets',    aliases: [] },
  { slug: 'gmx-v2-perps',      chain: 'MegaETH', name: 'GMX V2 Perps',     aliases: ['GMX'] },
  // Monad
  { slug: 'perpl',             chain: 'Monad',   name: 'Perpl',            aliases: [] },
  { slug: 'leverup',           chain: 'Monad',   name: 'LeverUp',          aliases: [] },
  // BSC (BNB Chain) — only protocols that actually match on BSC itself.
  // Dropped: Aster Perps (moved to Aster Chain), ApolloX (moved to APX
  // Chain), Ostium (100% Arbitrum-native — relocated to Arbitrum below).
  { slug: 'thena-perps',       chain: 'BSC',     name: 'Thena Perps',      aliases: ['Thena'] },
  { slug: 'myx-finance',       chain: 'BSC',     name: 'MYX Finance',      aliases: ['MYX'] },
  // Solana — dropped Mango Markets (deprecated, ~$0 volume) and Phoenix
  // (spot CLOB, not a perps DEX — DefiLlama's perps page lists it but it
  // has no perp product).
  { slug: 'jupiter-perpetual-exchange', chain: 'Solana', name: 'Jupiter Perps', aliases: ['Jupiter Perpetuals'] },
  { slug: 'drift-trade',       chain: 'Solana',  name: 'Drift',            aliases: ['Drift Trade'] },
  { slug: 'zeta',              chain: 'Solana',  name: 'Zeta Markets',     aliases: ['Zeta'] },
  { slug: 'pacifica',          chain: 'Solana',  name: 'Pacifica',         aliases: [] },
  { slug: 'gmtrade',           chain: 'Solana',  name: 'GMTrade',          aliases: [] },
  { slug: 'flash-trade',       chain: 'Solana',  name: 'FlashTrade',       aliases: ['Flash Trade'] },
  { slug: 'adrena-protocol',   chain: 'Solana',  name: 'Adrena',           aliases: ['Adrena Protocol'] },
  // BSC additions for completeness.
  { slug: 'kiloex',            chain: 'BSC',     name: 'KiloEx',           aliases: [] },
  { slug: 'pancakeswap',       chain: 'BSC',     name: 'PancakeSwap',      aliases: ['PancakeSwap Perps'] },
  // Arbitrum — added Ostium (the previously-misplaced BSC entry is
  // actually 100% Arbitrum-native).
  { slug: 'gmx-v2-perps',      chain: 'Arbitrum', name: 'GMX V2 Perps',    aliases: ['GMX'] },
  { slug: 'vertex-protocol',   chain: 'Arbitrum', name: 'Vertex Protocol', aliases: ['Vertex', 'Vertex Edge', 'vertex-edge'] },
  { slug: 'gains-network',     chain: 'Arbitrum', name: 'Gains Network',   aliases: ['Gains'] },
  { slug: 'mux-protocol',      chain: 'Arbitrum', name: 'MUX Protocol',    aliases: ['MUX'] },
  { slug: 'rage-trade',        chain: 'Arbitrum', name: 'Rage Trade',      aliases: [] },
  { slug: 'ostium',            chain: 'Arbitrum', name: 'Ostium',          aliases: [] },
  { slug: 'variational',       chain: 'Arbitrum', name: 'Variational',     aliases: [] },
  { slug: 'boros',             chain: 'Arbitrum', name: 'Boros',           aliases: [] },
  { slug: 'hibachi',           chain: 'Arbitrum', name: 'Hibachi',         aliases: [] },
  { slug: 'symmio',            chain: 'Arbitrum', name: 'SYMMIO',          aliases: ['Symm.io', 'Symmio'] },
  // Base — dropped Pear Protocol (primary matching is on Arbitrum) and
  // Aerodrome SlipStream (concentrated-liquidity spot AMM, not perps).
  // Derive (ex-Lyra V2) is deliberately excluded: it runs on its own L2
  // (Derive Chain, OP Stack) and only settles/bridges through Base.
  { slug: 'synfutures-v3',     chain: 'Base',     name: 'SynFutures V3',   aliases: ['SynFutures'] },
  { slug: 'avantis',           chain: 'Base',     name: 'Avantis',         aliases: [] },
  { slug: 'kiloex',            chain: 'Base',     name: 'KiloEx',          aliases: [] },
  { slug: 'carbon.inc',        chain: 'Base',     name: 'Carbon',          aliases: ['Carbon.inc'] },
  { slug: 'gains-network',     chain: 'Base',     name: 'Gains Network',   aliases: ['Gains'] },
  { slug: 'hibachi',           chain: 'Base',     name: 'Hibachi',         aliases: [] },
];
const CHAINS = ['MegaETH', 'Monad', 'BSC', 'Solana', 'Arbitrum', 'Base'];

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

// Waits for the page to hydrate past the Cloudflare interstitial. Polls up to
// ~45s for a "$" value to appear in the body (real content). Retries up to three
// times if Cloudflare's "security verification" shell is still sitting there.
async function waitForHydration(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await page.waitForFunction(
      () => /\$[\d,.]+[BbMmKk]?/.test(document.body.innerText || ''),
      null,
      { timeout: 45_000 }
    ).then(() => true).catch(() => false);
    if (ok) break;
    const text = await page.evaluate(() => (document.body.innerText || '').slice(0, 200));
    if (!/security verification|Just a moment|performing.*check/i.test(text)) break;
    await page.waitForTimeout(6000);
  }
  await page.waitForTimeout(1500);
}

// Given the page's body text, find the first $ value that comes after a line
// matching `labelRe`. DefiLlama always puts the label on one line and the value
// on the next line, so we do a line-based walk instead of fragile DOM selectors.
async function extractLabeledValues(page, labelRegexes) {
  return await page.evaluate((labelPatterns) => {
    const text = (document.body.innerText || '');
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const valRe = /\$\s*[\d,]+(?:\.\d+)?\s*[BbMmKk]?/;
    const out = {};
    for (const { key, pattern } of labelPatterns) {
      const re = new RegExp(pattern, 'i');
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) continue;
        // If the label line itself contains a $ value, use it.
        let m = lines[i].match(valRe);
        if (!m) {
          // Otherwise scan the next handful of lines for the first $ value.
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            m = lines[j].match(valRe);
            if (m) break;
          }
        }
        if (m) { out[key] = m[0]; break; }
      }
    }
    return out;
  }, labelRegexes);
}

async function scrapeProtocol(page, slug) {
  const url = `https://defillama.com/protocol/perps/${slug}`;
  console.log('→ protocol:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForHydration(page);
  const raws = await extractLabeledValues(page, [
    { key: 'v24h', pattern: '^Perp\\s*Volume\\s*24h$' },
    { key: 'v7d',  pattern: '^Perp\\s*Volume\\s*7d$'  },
    { key: 'v30d', pattern: '^Perp\\s*Volume\\s*30d$' },
    { key: 'vAll', pattern: '^Cumulative\\s*Perp\\s*Volume$' },
  ]);
  // Pull the daily volume series embedded in __NEXT_DATA__ (usually at
  // `.props.pageProps.chart`, array of [timestampMs, volumeUSD] pairs).
  // Fallback: walk the entire __NEXT_DATA__ tree for any matching shape.
  const chart = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return null;
    let data;
    try { data = JSON.parse(el.textContent); } catch { return null; }
    const direct = data?.props?.pageProps?.chart;
    const isSeries = (v) =>
      Array.isArray(v) && v.length >= 10 && Array.isArray(v[0]) && v[0].length === 2
      && typeof v[0][0] === 'number' && v[0][0] > 1e9;
    if (isSeries(direct)) return direct;
    // Fallback: walk
    let best = null;
    const walk = (obj) => {
      if (isSeries(obj) && (!best || obj.length > best.length)) best = obj;
      if (obj && typeof obj === 'object') for (const k in obj) walk(obj[k]);
    };
    walk(data);
    return best;
  });
  return {
    slug,
    v24h: parseUsd(raws.v24h), v7d: parseUsd(raws.v7d),
    v30d: parseUsd(raws.v30d), vAll: parseUsd(raws.vAll),
    dailyChart: chart, // [[tsMs, vol], …]
    raw: raws,
  };
}

async function scrapeChain(page, chain) {
  const url = `https://defillama.com/chain/${chain}`;
  console.log('→ chain:   ', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForHydration(page);
  const raws = await extractLabeledValues(page, [
    { key: 'v24h', pattern: '^Perps?\\s*Volume\\s*\\(24h\\)$' },
  ]);
  return { chain, value: parseUsd(raws.v24h), raw: raws.v24h };
}

// Scrape DefiLlama's dedicated /perps/chain/{chain} view — returns a map of
// { protocolName: {v24h, v7d, v30d} } with numbers already filtered to that chain.
//
// DefiLlama's row layout is variable:
//   3 $ values → [24h, 7d, 30d]             (protocol reports only one metric)
//   4 $ values → [24h_norm, 24h_reported, 7d, 30d]  (protocol reports both;
//                we prefer the normalized number because it's what the protocol
//                detail page shows and what the user sees in the UI).
//   2 $ values → [24h_or_7d, ...]          (dead/zero protocols)
async function scrapePerpsByChain(page, chain) {
  const url = `https://defillama.com/perps/chain/${chain}`;
  console.log('→ perps/chain:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForHydration(page);

  return await page.evaluate(() => {
    const valRe   = /^\$\s*[\d,]+(?:\.\d+)?\s*[BbMmKk]?$/;
    // Cells that legitimately sit between a protocol's name and its $ columns:
    // a rank number, the "N chains" marker, a % change, or an empty-cell dash.
    // We used to anchor on "N chains" being the very next line — DefiLlama's
    // row layout drifted, that match broke for nearly every protocol, and the
    // merge silently fell back to (wrong) cross-chain totals. Skipping filler
    // cells instead makes the row-finder resilient to that layout drift.
    const fillerRe = /^(\d+\s*chains?|\d+|[+\-]?\d+(?:\.\d+)?\s*%|[-—–]|N\/A)$/i;
    const text    = document.body.innerText || '';
    const lines   = text.split('\n').map(s => s.trim()).filter(Boolean);

    // Start just after the table's "Name" column header.
    let start = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^Name$/i.test(lines[i])) { start = i + 1; break; }
    }

    const out = {};
    let i = start;
    while (i < lines.length) {
      const name = lines[i];
      // A row label is plain text — skip headers, $ values and filler cells.
      if (!name || name.length > 80 || valRe.test(name) || fillerRe.test(name)) { i++; continue; }
      // Skip any filler cells (rank / "N chains" / % change / dash) between the
      // name and the numeric columns, then collect the run of $ values.
      let j = i + 1, guard = 0;
      while (j < lines.length && !valRe.test(lines[j]) && fillerRe.test(lines[j]) && guard < 5) { j++; guard++; }
      const vals = [];
      while (j < lines.length && valRe.test(lines[j])) { vals.push(lines[j]); j++; }
      if (vals.length >= 3) {
        const [v24h, v7d, v30d] = vals.length >= 4
          ? [vals[0], vals[2], vals[3]]    // [norm24h, rep24h, 7d, 30d]
          : [vals[0], vals[1], vals[2]];   // [24h, 7d, 30d]
        out[name] = { v24h, v7d, v30d };
        i = j;            // consumed this row
      } else {
        i++;              // not a data row — keep scanning
      }
    }
    return out;
  });
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

  // 1) Per-protocol TOTALS from the protocol page (includes all-time).
  //    Multi-chain protocols like GMX will be overwritten per-chain below.
  const protoTotals = {};
  for (const p of PROTOCOLS) {
    await page.waitForTimeout(2000);
    try {
      const r = await scrapeProtocol(page, p.slug);
      protoTotals[p.slug] = r;
      console.log(`  ${p.name} (${p.slug}) totals: 24h=${r.v24h}  7d=${r.v7d}  30d=${r.v30d}  all=${r.vAll}`);
    } catch (e) {
      console.warn(`  FAILED ${p.slug}:`, e.message);
    }
  }

  // 2) Chain-filtered per-protocol volumes from /perps/chain/{chain}.
  //    This is what lets us see GMX's MegaETH-only $10K/day instead of its
  //    $216M cross-chain total.
  const perpsByChain = {};
  for (const chain of CHAINS) {
    await page.waitForTimeout(2000);
    try {
      perpsByChain[chain] = await scrapePerpsByChain(page, chain);
      console.log(`  /perps/chain/${chain}:`, Object.keys(perpsByChain[chain]).length, 'protocols');
    } catch (e) {
      console.warn(`  FAILED perps/chain/${chain}:`, e.message);
      perpsByChain[chain] = {};
    }
  }

  // A slug configured on more than one chain is a multi-chain deployment. For
  // those, the protocol page's CROSS-CHAIN total is not a valid per-chain
  // number, so if the chain-filtered scrape misses we must NOT fall back to it
  // (that's exactly how GMX's ~$37M Arbitrum volume was leaking onto MegaETH).
  // Single-chain slugs are safe to fall back since cross-chain ≈ chain total.
  const slugCounts = {};
  for (const p of PROTOCOLS) slugCounts[p.slug] = (slugCounts[p.slug] || 0) + 1;
  const isMultiChain = (slug) => (slugCounts[slug] || 0) > 1;

  // 3) Merge — prefer the chain-filtered values for 24h/7d/30d; keep
  //    all-time from the protocol page (there's no chain-filtered all-time).
  for (const p of PROTOCOLS) {
    const totals = protoTotals[p.slug] || {};
    const byName = perpsByChain[p.chain] || {};
    const rowKeys = Object.keys(byName);
    const candidates = [p.name, ...(p.aliases || [])];
    let hit = null;
    for (const c of candidates) {
      hit = byName[c]
        ?? byName[rowKeys.find(k => k.toLowerCase() === c.toLowerCase())]
        ?? byName[rowKeys.find(k => k.toLowerCase().startsWith(c.toLowerCase()))]
        ?? null;
      if (hit) break;
    }
    const chainFiltered = hit ? {
      v24h: parseUsd(hit.v24h),
      v7d:  parseUsd(hit.v7d),
      v30d: parseUsd(hit.v30d),
    } : {};
    // Cross-chain fallback only for single-chain slugs; multi-chain slugs that
    // weren't chain-filtered get null (unknown) rather than a leaked total.
    const fb = isMultiChain(p.slug) ? {} : totals;
    snapshot.protocols.push({
      ...p,
      volume24h:     chainFiltered.v24h ?? fb.v24h ?? null,
      volume7d:      chainFiltered.v7d  ?? fb.v7d  ?? null,
      volume30d:     chainFiltered.v30d ?? fb.v30d ?? null,
      volumeAllTime: totals.vAll ?? null,
      chainFiltered: !!hit,
      // Daily series scraped from DefiLlama's __NEXT_DATA__ — [[tsMs, vol], …].
      // Cross-chain (the protocol page's chart is protocol-wide, not chain-
      // filtered) but still useful for MegaETH-native protocols like World
      // Markets where the protocol == the chain's deployment.
      dailyChart: totals.dailyChart || null,
    });
    console.log(
      `  → ${p.name} on ${p.chain}:`,
      (chainFiltered.v24h ?? totals.v24h), '/',
      (chainFiltered.v7d ?? totals.v7d), '/',
      (chainFiltered.v30d ?? totals.v30d),
      hit ? '(chain-filtered)' : '(cross-chain total)',
    );
  }

  // 4) Chain-level perps total (from the chain overview page).
  for (const chain of CHAINS) {
    await page.waitForTimeout(2000);
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

  // --- Accumulate per-day chain totals so the dashboard can draw a real time-series ---
  const outPath = path.resolve('public/data/perps.json');
  let prev = {};
  try { prev = JSON.parse(await fs.readFile(outPath, 'utf8')); } catch {}
  const history = prev.history || {};
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd, UTC
  for (const chain of CHAINS) {
    const v = snapshot.chains[chain]?.perpsVolume24h;
    if (v == null) continue;
    const arr = history[chain] || [];
    const existing = arr.find(e => e.date === today);
    if (existing) existing.value = v;
    else arr.push({ date: today, value: v });
    arr.sort((a, b) => a.date.localeCompare(b.date));
    history[chain] = arr.slice(-60); // keep last 60 days
  }
  snapshot.history = history;

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n');
  console.log('wrote', outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
