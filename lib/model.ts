// Token radar, model "radar-2" — written for token-radar-01.
//
// The model turns the sealed snapshot's own figures into one number per protocol,
// the implied value of its token if it launched with the record it has today.
// Nothing is a black box: every input is shown per protocol on the dashboard,
// and the formula is printed on the page.
//
//   implied_value_usd = round(tvl_usd x category_multiple x growth x maturity x breadth)
//
//   category_multiple  how much of a protocol's TVL a token is worth, by what the
//                      protocol sells: fee-taking markets score highest, rent-style
//                      wrappers lowest. Dexs 0.38, Lending 0.34, Derivatives 0.32,
//                      RWA 0.32, Risk Curators 0.30, Onchain Capital Allocator 0.30,
//                      CDP 0.30, Collateral Markets 0.28, Yield 0.28, Basis Trading
//                      0.26, Restaking 0.26, Yield Aggregator 0.26, Staking Pool 0.24,
//                      CeDeFi 0.24, Payments 0.24, Stablecoin Wrapper 0.22,
//                      Insurance 0.22, Governance Incentives 0.20, Chain 0.20,
//                      anything else 0.22.
//   growth             1 + clamp(change_7d, -50, 150) / 100 x 0.6 — a protocol
//                      growing 10% in a week is worth 6% more; a shrinking one less.
//                      No 7-day figure reported: 1.00.
//   maturity           0.55 + 0.45 x min(age_days, 1095) / 1095 — a protocol tracked
//                      for three years earns the full weight; a week-old one earns
//                      barely half. No listing date reported: 180 days.
//   breadth            1 + 0.03 x min(chains - 1, 4) — each extra chain up to four
//                      adds 3%: multi-chain reach is real distribution.
//
// A protocol is rankable when it records no token (mcap, gecko_id and symbol all
// null) and is not a wrapped, staked or bridged product of one that trades:
// category outside CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid
// Restaking and Restaked BTC, name without a version marker, and no whole word
// wrapped / staked / staking in the name. The board is the whole 40-protocol
// watchlist plus the 160 highest-TVL rankable protocols below the $50M floor.

export const MODEL_VERSION = 'radar-2';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;
export const FLOOR_USD = 50_000_000;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 180;
export const GROWTH_WEIGHT = 0.6;
export const GROWTH_LO = -50;
export const GROWTH_HI = 150;
export const BREADTH_STEP = 0.03;
export const BREADTH_MAX_CHAINS = 4;

export const CATEGORY_MULTIPLE: Record<string, number> = {
  Dexs: 0.38,
  Lending: 0.34,
  Derivatives: 0.32,
  RWA: 0.32,
  'Risk Curators': 0.3,
  'Onchain Capital Allocator': 0.3,
  CDP: 0.3,
  'Collateral Markets': 0.28,
  Yield: 0.28,
  'Basis Trading': 0.26,
  Restaking: 0.26,
  'Yield Aggregator': 0.26,
  'Staking Pool': 0.24,
  CeDeFi: 0.24,
  Payments: 0.24,
  'Stablecoin Wrapper': 0.22,
  Insurance: 0.22,
  'Governance Incentives': 0.2,
  Chain: 0.2,
};
export const DEFAULT_MULTIPLE = 0.22;

export const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Scored {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  watchlist: boolean;
  multiple: number;
  growth: number;
  maturity: number;
  breadth: number;
  implied_value_usd: number;
  farm_steps: string[];
  rank: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface RadarData {
  meta: { as_of: string; model: string; floor_usd: number; rows: number; watchlist: number };
  model: {
    formula: string;
    multiples: Record<string, number>;
    default_multiple: number;
    growth_weight: number;
    growth_lo: number;
    growth_hi: number;
    maturity_days: number;
    unknown_age_days: number;
    breadth_step: number;
  };
  rows: Scored[];
  live: LiveRow[];
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: expected { protocols: [], watchlist: [] }');
  }
  return raw;
}

export function categoryMultiple(category: string | null): number {
  if (category === null) return DEFAULT_MULTIPLE;
  return CATEGORY_MULTIPLE[category] ?? DEFAULT_MULTIPLE;
}

export function ageDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return UNKNOWN_AGE_DAYS;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(as)) return UNKNOWN_AGE_DAYS;
  return Math.max(0, Math.floor((as - listed) / 86_400_000));
}

export function growthFactor(change7d: number | null): number {
  if (change7d === null || Number.isNaN(change7d)) return 1;
  const clamped = Math.min(GROWTH_HI, Math.max(GROWTH_LO, change7d));
  return 1 + (clamped / 100) * GROWTH_WEIGHT;
}

export function maturityFactor(age: number): number {
  return 0.55 + 0.45 * (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS);
}

export function breadthFactor(chains: string[]): number {
  return 1 + BREADTH_STEP * Math.min(Math.max(chains.length - 1, 0), BREADTH_MAX_CHAINS);
}

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSION_MARKER = /(?:^|[\s._-])v\d+(?:\.\d+)?$/i;
const WRAPPED_WORD = /\b(?:wrapped|staked|staking)\b/i;

export function isRankable(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return true;
}

export function capitalFor(tvl: number): number {
  if (tvl >= 500_000_000) return 250;
  if (tvl >= 100_000_000) return 150;
  if (tvl >= 50_000_000) return 100;
  return 50;
}

export function holdDaysFor(age: number): number {
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function chainName(chains: string[]): string {
  return chains.length > 0 ? chains[0]! : 'Ethereum';
}

/** The core action, per category: what the farm actually does with the capital. */
function coreAction(p: Protocol, capital: number, chain: string): [string, string] {
  const n = p.name;
  switch (p.category) {
    case 'Dexs':
      return [
        `Swap $${capital} through ${n} on ${chain}, routing the trade across its deepest pool so the volume is real and the slippage stays under 0.5%. Cost: about $3 gas. Time: 15 minutes.`,
        `Provide $${capital} as liquidity in ${n}'s largest ${chain} pool and leave it earning fees for the full hold period. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Lending':
      return [
        `Supply $${capital} as collateral on ${n} (${chain}) and keep the loan-to-value under 50% so a price swing never risks liquidation. Cost: about $3 gas. Time: 15 minutes.`,
        `Borrow a small amount, about $20, against the deposit on ${n}, hold it a week, then repay it in full to show both sides of the market. Cost: about $4 gas plus a few cents of interest. Time: 10 minutes.`,
      ];
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return [
        `Deposit $${capital} into a ${n} vault on ${chain}, choosing the vault whose curator has the longest track record, not the highest advertised yield. Cost: about $3 gas. Time: 15 minutes.`,
        `Allocate a second $${Math.round(capital / 2)} to a different ${n} vault with a different risk profile, so the farm is not a single-position bet. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'RWA':
      return [
        `Buy $${capital} of tokenised real-world assets through ${n} on ${chain}, starting with the asset class the protocol has held longest. Cost: about $3 gas. Time: 15 minutes.`,
        `Hold the position and collect the yield ${n} pays out, reinvesting it once a month instead of withdrawing it. Cost: about $2 gas a month. Time: 5 minutes a month.`,
      ];
    case 'Derivatives':
      return [
        `Open a small hedged position of $${capital} on ${n} (${chain}), long the underlying and short the same size elsewhere, so the farm earns funding without directional risk. Cost: about $3 gas. Time: 15 minutes.`,
        `Close and reopen the hedge once a week to keep the position active and the funding stream current. Cost: about $3 gas a week. Time: 10 minutes a week.`,
      ];
    case 'CDP':
      return [
        `Lock $${capital} of collateral in ${n} on ${chain} and mint stablecoins at no more than 40% of the collateral value, keeping a wide safety margin. Cost: about $3 gas. Time: 15 minutes.`,
        `Repay a quarter of the minted stablecoins after a month, then mint them back, so the position shows real repayment behaviour. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Yield':
    case 'Yield Aggregator':
      return [
        `Deposit $${capital} into ${n}'s ${chain} yield vault and let it compound, choosing the strategy with the longest live history. Cost: about $3 gas. Time: 15 minutes.`,
        `Move half the deposit to a second ${n} strategy on ${chain} after a month to spread the farm across two strategies. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Staking Pool':
    case 'Restaking':
      return [
        `Stake $${capital} through ${n} on ${chain} and keep the stake bonded for the full hold period instead of unstaking early. Cost: about $3 gas. Time: 15 minutes.`,
        `Restake the rewards ${n} pays out once a month so the position compounds. Cost: about $2 gas a month. Time: 5 minutes a month.`,
      ];
    default:
      return [
        `Use ${n} on ${chain} with $${capital}, taking its core action — the one the protocol's own docs present first — and keep the position open. Cost: about $3 gas. Time: 15 minutes.`,
        `Repeat ${n}'s core action with a second $${Math.round(capital / 2)} tranche on ${chain} so the farm is not a single transaction. Cost: about $3 gas. Time: 10 minutes.`,
      ];
  }
}

/** Six steps, each 20–600 characters, each carrying its cost and its time. */
export function farmSteps(p: Protocol, age: number): string[] {
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const chain = chainName(p.chains);
  const [first, second] = coreAction(p, capital, chain);
  return [
    `Set up a fresh wallet for this farm only, keep its seed phrase offline, and fund it with $${capital} in a stablecoin plus about $5 for gas on ${chain}. Cost: about $5 gas. Time: 5 minutes.`,
    first,
    second,
    `Repeat one qualifying action on ${p.name} each week for ${hold} days so the activity reads as real use, not a one-off airdrop grab. Cost: about $2 gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days and check ${p.name}'s points or rewards page once a month to confirm the activity is actually counted. Cost: $0. Time: 5 minutes a month.`,
    `Claim only from ${p.name}'s own published link, never pay a fee to claim a token, and unwind the position in stages once a launch is announced. Cost: $0 to claim. Time: 10 minutes.`,
  ];
}

export function score(p: Protocol, asOf: string, onWatchlist: boolean): Scored {
  const age = ageDays(p.listed_at, asOf);
  const multiple = categoryMultiple(p.category);
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(age);
  const breadth = breadthFactor(p.chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity * breadth));
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: age,
    watchlist: onWatchlist,
    multiple,
    growth,
    maturity,
    breadth,
    implied_value_usd: implied,
    farm_steps: farmSteps(p, age),
    rank: 0,
  };
}

export function buildRadar(snapshot: Snapshot): { board: Scored[]; radar: RadarData } {
  const watch = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchRows: Scored[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p === undefined) throw new Error(`snapshot: watchlist slug ${slug} is not in protocols`);
    watchRows.push(score(p, snapshot.as_of, true));
  }
  const rest = snapshot.protocols
    .filter((p) => !watch.has(p.slug) && isRankable(p) && p.tvl_usd < FLOOR_USD)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, EARLY_ROWS)
    .map((p) => score(p, snapshot.as_of, false));
  const board = [...watchRows, ...rest].sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  board.forEach((row, i) => {
    row.rank = i + 1;
  });
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
  const radar: RadarData = {
    meta: { as_of: snapshot.as_of, model: MODEL_VERSION, floor_usd: FLOOR_USD, rows: board.length, watchlist: snapshot.watchlist.length },
    model: {
      formula: 'implied = round(tvl_usd x category_multiple x growth x maturity x breadth)',
      multiples: CATEGORY_MULTIPLE,
      default_multiple: DEFAULT_MULTIPLE,
      growth_weight: GROWTH_WEIGHT,
      growth_lo: GROWTH_LO,
      growth_hi: GROWTH_HI,
      maturity_days: MATURITY_DAYS,
      unknown_age_days: UNKNOWN_AGE_DAYS,
      breadth_step: BREADTH_STEP,
    },
    rows: board,
    live,
  };
  return { board, radar };
}

/** The gate's own refusal reasons, checked before anything is written. */
export function boardIssue(board: Scored[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (slugs.has(row.slug)) return `slug ${row.slug} appears twice`;
    slugs.add(row.slug);
    if (row.rank !== i + 1) return `row ${row.slug} has rank ${row.rank}, expected ${i + 1}`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${row.rank}`;
    }
    if (typeof row.implied_value_usd !== 'number' || row.implied_value_usd <= 0) {
      return `row ${row.slug} has no positive implied value`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, outside 3-12`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `row ${row.slug} has a farm step of ${n} characters, outside 20-600`;
    }
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (board.length >= 2 && values.size === 1) return 'every implied value is the same';
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: the board, the live-token set and the model. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
