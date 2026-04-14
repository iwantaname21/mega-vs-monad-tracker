# Vibe Code Prompt: MegaETH vs Monad Live Dashboard

Copy everything below this line into Cursor, Replit, Bolt, or whatever you use.

---

## What to Build

Build a live dashboard web app called **"MEGA vs MONAD TRACKER"** that pulls real-time data from the DeFiLlama public API and compares MegaETH and Monad across on-chain metrics. The purpose is to show at a glance whether Monad's ~3.5x valuation premium over MegaETH is justified by its on-chain activity.

## Brand Colors (use these exactly)

### Backgrounds
- **Night Sky** (primary background): `#19191A`
- **Full Moon** (card backgrounds, secondary surfaces): `#DFD9D9`
- **Moon White** (text on dark, highlights): `#ECE8E8`

### Accent Colors (each has a left and right tone for gradients)
- **Salmon/Peach**: `#F5AF94` (left) to `#F5949D` (right) -- use for warm highlights, MegaETH-positive indicators
- **Pink**: `#FF8AA8` (left) to `#F786C6` (right) -- use for Monad-side indicators and badges
- **Green**: `#90D79F` (left) to `#6DD0A9` (right) -- use for MegaETH wins / positive metrics
- **Teal/Blue**: `#7EAAD4` (left) to `#70BAD2` (right) -- use for neutral data, links, and info elements

### Color Coding Logic for Comparison Rows
- **MegaETH wins**: Use green gradient (`#90D79F` to `#6DD0A9`) for the row accent / winning value highlight. Row background: `rgba(144, 215, 159, 0.08)`
- **Monad wins**: Use pink gradient (`#FF8AA8` to `#F786C6`) for the row accent / winning value highlight. Row background: `rgba(255, 138, 168, 0.08)`
- **Neutral / tie**: Use teal (`#7EAAD4`) at low opacity. Row background: `rgba(126, 170, 212, 0.06)`

## App Logos

Place the MegaETH and Monad logos prominently in the dashboard:

- **MegaETH logo**: Use the official MegaETH logo (the triple-slash "///M" mark). Fetch from `https://icons.llama.fi/megaeth.png` (DeFiLlama hosts chain icons). Place it in the header area next to the title, and as a column header icon above every MegaETH data column.
- **Monad logo**: Use the official Monad logo. Fetch from `https://icons.llama.fi/monad.png`. Place it in the header area next to the title, and as a column header icon above every Monad data column.
- **Logo size**: 32-40px in the header, 24px as column header icons in comparison tables.
- **Table column headers**: Every comparison table should have the chain logo + chain name as the column header, not just text. Example: `[MegaETH icon] MegaETH` and `[Monad icon] Monad`.

## Design System (match the MegaMafia Tracker aesthetic)

Follow this design language exactly:

- **Background**: Night Sky `#19191A`
- **Card background**: Full Moon `#DFD9D9` for light-on-dark card style, OR a slightly lighter dark (`#222225`) for dark card style. Pick one and stay consistent. The MegaMafia Tracker uses light cards on dark background (the white/cream card look).
- **Card borders**: `1px solid rgba(236, 232, 232, 0.1)` with `border-radius: 12px`
- **Typography**: System sans-serif stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- **Title**: All-caps, extra bold, large (like "MEGAMAFIA TRACKER" style). Use the title "MEGA vs MONAD TRACKER". Title color: Moon White `#ECE8E8`
- **Numbers**: Large, bold. On dark backgrounds use Moon White `#ECE8E8`. Use `font-variant-numeric: tabular-nums` for alignment.
- **Text on dark background**: Moon White `#ECE8E8` for primary, `#9E9A9A` for secondary/muted
- **Text on light cards**: Night Sky `#19191A` for primary, `#555` for secondary
- **Status pills/badges**: Small rounded pills using the accent gradient colors. Example: a "LIVE" badge uses salmon gradient `#F5AF94` to `#F5949D` with dark text.
- **Layout**: 
  - Top: MegaETH logo + "MEGA vs MONAD TRACKER" title + Monad logo, centered
  - Below title: Summary stat bar (4 big number cards in a row, like the "6/11 LIVE ON MAINNET" style)
  - Below: Card grid, 2 columns on desktop, 1 column on mobile, each card showing a metric category
- **Progress bars / accent bars**: Use the gradient colors with rounded ends
- **Buttons**: Full-width with Night Sky `#19191A` background and Moon White text, like "VIEW ON DEFILLAMA →"
- **Spacing**: Generous padding (16-24px inside cards), 16px grid gap
- **Responsive**: Cards stack on mobile, summary bar wraps to 2x2 grid

## DeFiLlama API Endpoints (all public, no auth, free)

All endpoints are CORS-friendly and return JSON. Base URL: `https://api.llama.fi`

### 1. TVL
```
GET https://api.llama.fi/v2/chains
```
Returns array of chain objects. Filter by `name === "MegaETH"` and `name === "Monad"`. Each has a `tvl` field (number, in USD).

### 2. DEX Volume
```
GET https://api.llama.fi/overview/dexs/MegaETH?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true
GET https://api.llama.fi/overview/dexs/Monad?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true
```
Returns object with `total24h`, `total7d`, `total30d`, `totalAllTime`, `change_1d`, `change_7d`. Also has `protocols` array with per-DEX breakdown (each has `name`, `total24h`, `total7d`, `total30d`).

### 3. Fees & Revenue
```
GET https://api.llama.fi/overview/fees/MegaETH?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true
GET https://api.llama.fi/overview/fees/Monad?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true
```
Same structure as DEX. Returns `total24h`, `total7d`, `total30d`, `totalAllTime` for fees. `protocols` array has per-protocol fee breakdown.

### 4. Stablecoin Supply
```
GET https://stablecoins.llama.fi/stablecoins?includePrices=true
```
Returns `peggedAssets` array. Each asset has `chainCirculating` object keyed by chain name. Access `chainCirculating["MegaETH"].current.peggedUSD` and `chainCirculating["Monad"].current.peggedUSD` to get USD amounts per stablecoin per chain.

### 5. Protocol Count
```
GET https://api.llama.fi/protocols
```
Returns array of all protocols. Each has a `chains` array. Count how many have `"MegaETH"` in chains vs `"Monad"` in chains.

### 6. MON Token Price (for FDV calculation)
```
GET https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true
```
Returns `monad.usd`, `monad.usd_market_cap`. Monad total supply is ~100.7B MON, so FDV = price * 100,700,000,000.

MegaETH (MEGA) has no TGE yet. Use $1B as estimated FDV from public sale price ($0.0999 * 10B supply).

### 7. Chain Icons (for logos)
```
https://icons.llama.fi/megaeth.png
https://icons.llama.fi/monad.png
```
These are direct image URLs. Use them as `<img>` sources for the chain logos throughout the dashboard.

## Dashboard Sections

### Header
Centered layout:
```
[MegaETH logo 40px]   MEGA vs MONAD TRACKER   [Monad logo 40px]
                    Last updated: X seconds ago
```

### Top Summary Bar
Show 4 big-number cards in a horizontal row (like the MegaMafia "6/11 LIVE ON MAINNET" cards). Use Full Moon `#DFD9D9` card backgrounds with Night Sky `#19191A` text:

| Card | Value | Subtext |
|------|-------|---------|
| TVL RATIO | `megaTVL / monadTVL` formatted as "1 : X.Xx" | "MegaETH TVL vs Monad TVL" |
| FEE RATIO | `megaFees24h / monadFees24h` formatted as "1 : X.Xx" | "24h fee generation" |
| FDV MULTIPLE | "~3.5x" (or calculated from live MON price) | "Monad FDV premium over MegaETH" |
| PROTOCOLS | `megaCount / monadCount` like "21 / 95" | "DeFiLlama tracked protocols" |

### Section 1: Performance & Cost (Static Data Card)
This is hardcoded, not from API. Display as a comparison card with chain logos as column headers:

| Metric | [MegaETH logo] MegaETH | [Monad logo] Monad | Winner |
|--------|---------|-------|--------|
| Target TPS | 100,000 | 10,000 | MEGA (10x) |
| Block Time | 10 ms | 400 ms | MEGA (40x) |
| Finality | <100 ms | 800 ms | MEGA (8x) |
| Throughput | 1,700 MGas/s | 300 MGas/s | MEGA (5.67x) |
| Avg Tx Cost | ~$0.0002 | $0.004-$0.007 | MEGA (20-35x) |

Color every row with the green gradient since MegaETH wins all of them.

### Section 2: On-Chain Activity (Live from API)
Pull from chains endpoint + DEX endpoint. Column headers include chain logos:

| Metric | [MegaETH logo] MegaETH | [Monad logo] Monad | Winner |
|--------|---------|-------|--------|
| TVL | from API | from API | higher wins |
| DEX Volume 24h | from API | from API | higher wins |
| DEX Volume 30d | from API | from API | higher wins |
| DEX Volume All-Time | from API | from API | higher wins |
| DEX 24h Change % | from API | from API | higher % wins |
| Protocol Count | counted from API | counted from API | higher wins |

### Section 3: Fees & Revenue (Live from API)
Pull from fees endpoint:

| Metric | [MegaETH logo] MegaETH | [Monad logo] Monad | Winner |
|--------|---------|-------|--------|
| Fees 24h | from API | from API | higher wins |
| Fees 7d | from API | from API | higher wins |
| Fees 30d | from API | from API | higher wins |
| Fees All-Time | from API | from API | higher wins |
| Annualized (30d * 12) | calculated | calculated | higher wins |

### Section 4: Stablecoin Supply (Live from API)
Pull from stablecoins endpoint. Aggregate per chain:

| Metric | [MegaETH logo] MegaETH | [Monad logo] Monad | Winner |
|--------|---------|-------|--------|
| Total Stablecoin Supply | sum all stables | sum all stables | context |
| Stablecoin / TVL Ratio | supply / tvl | supply / tvl | LOWER wins (capital deployed, not idle). If ratio > 100% flag it with pink |

Also show a mini breakdown of which stablecoins are on each chain.

### Section 5: Derived Value Metrics (Calculated)
These are the key ratios calculated from the live data above:

| Metric | [MegaETH logo] MegaETH | [Monad logo] Monad | Winner |
|--------|---------|-------|--------|
| FDV / TVL | $1B / megaTVL | monadFDV / monadTVL | LOWER wins |
| FDV / Annualized Fees | $1B / (megaFees30d * 12) | monadFDV / (monadFees30d * 12) | LOWER wins |
| TVL per Protocol | megaTVL / megaProtocols | monadTVL / monadProtocols | HIGHER wins |

### Section 6: Top Protocol Fee Breakdown (Live from API)
From the fees endpoint `protocols` array, show the top 8 fee-generating protocols on each chain side by side. Sort by `total24h` descending. Show as two columns inside a card, each column headed by the chain logo + name.

## Color Logic for Every Row

```javascript
// For each metric row, determine winner and apply colors:
function getWinner(megaVal, monadVal, lowerIsBetter = false) {
  if (lowerIsBetter) {
    if (megaVal < monadVal) return 'mega';    // green row
    if (monadVal < megaVal) return 'monad';   // pink row
    return 'neutral';                          // teal
  } else {
    if (megaVal > monadVal) return 'mega';    // green row
    if (monadVal > megaVal) return 'monad';   // pink row
    return 'neutral';
  }
}
```

- **Winner = MegaETH**: row background `rgba(144, 215, 159, 0.08)`, winning value bold with color `#90D79F`, edge column shows green gradient pill
- **Winner = Monad**: row background `rgba(255, 138, 168, 0.08)`, winning value bold with color `#FF8AA8`, edge column shows pink gradient pill
- **Neutral**: row background `rgba(126, 170, 212, 0.06)`, edge column in teal `#7EAAD4`

## Number Formatting

```javascript
function formatUSD(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercent(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatMultiple(a, b) {
  return `${(Math.max(a,b) / Math.min(a,b)).toFixed(1)}x`;
}
```

## Tech Stack Suggestion

- **React + Vite** or **Next.js** for fast setup
- **Tailwind CSS** for styling (or plain CSS using the brand colors above)
- **fetch** or **SWR/React Query** for API calls with auto-refresh every 60 seconds
- No auth needed for any of these APIs

## Auto-Refresh

Add a "Last updated: X seconds ago" indicator below the title in muted text (`#9E9A9A`). Refresh all API data every 60 seconds. Show a subtle loading pulse on the cards during refresh.

## Additional Features (Nice to Have)

- Clicking any metric row opens the relevant DeFiLlama page in a new tab
- A "sparkline" or mini trend line if you pull historical data from DeFiLlama chart endpoints
- Export to image/PDF button for sharing
- A toggle to switch FDV estimate for MegaETH ($1B public sale vs $3B pre-market) to see how ratios change
