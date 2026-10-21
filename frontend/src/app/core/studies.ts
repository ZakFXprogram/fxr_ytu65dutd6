export interface StudyInfo {
  slug: string;
  name: string;
  tag: string;
  img: string;
  blurb: string;
  about: string;
  points: string[];
  data: string;
}

export const STUDIES: StudyInfo[] = [
  {
    slug: 'big-trades', name: 'Big Trades', tag: 'Aggression', img: 'big_trades_per_trade',
    blurb: 'A bubble at the exact fill price of every large aggressive trade, sized by how far it stands above the recent average.',
    about: 'Big Trades watches every print and groups them the way you choose: by print, by aggressor order, by run or by time window. When a group stands out from what the market has been doing, a bubble appears at its real fill price, scaled to its size, so you see where size actually traded instead of guessing from candles.',
    points: ['Group by print, aggressor order, run or time window', 'Fixed threshold or an automatic rolling cutoff', 'One bubble per candle, or one per trade', 'Level lines left by the very largest trades'],
    data: 'Tick-by-tick data with bid/ask side (Rithmic recommended).',
  },
  {
    slug: 'deep-trades', name: 'Deep Trades', tag: 'Market by order', img: 'deep_trades',
    blurb: 'The same big trades, classified with market-by-order data: who hit whom. See absorption and real fights between size.',
    about: 'Deep Trades reads market-by-order data to tell the story behind each big trade. Was it a crowd of small aggressors or one large order? Did it hit a big resting order? The shape of each mark answers that at a glance, built on exactly the same grouping and thresholds as Big Trades so both read the same way.',
    points: ['Hollow circle: many small aggressors', 'Filled circle: one big aggressor order', 'Square: a big resting order was hit', 'Diamond: big order vs big resting order (battle)'],
    data: 'Market-by-order (MBO) data enabled in MotiveWave.',
  },
  {
    slug: 'delta-bars', name: 'Delta Bars', tag: 'Order flow', img: 'delta_bars',
    blurb: 'Colours each candle by an RSI computed on its delta, so you see who is really in control bar by bar.',
    about: 'Delta Bars turns the balance between aggressive buyers and sellers into candle colour. Because the colour comes from an RSI of delta rather than raw delta, it adapts to the instrument and the session, and the moments where colour and price disagree become easy to spot.',
    points: ['Cyan: aggressive buyers dominate', 'Magenta: aggressive sellers dominate', 'Spot absorption when colour and price disagree', 'Adjustable thresholds and period'],
    data: 'Tick-by-tick data with bid/ask side.',
  },
  {
    slug: 'delta-heatmap', name: 'Delta Heatmap', tag: 'Order flow', img: 'delta_heatmap_default',
    blurb: 'An adaptive delta gradient with markers for expansion, absorption, finished auctions, flips and divergences.',
    about: 'Delta Heatmap shows the strength of delta as a smooth gradient, then marks the events that matter: expansion when aggression accelerates, absorption when it fails to move price, finished auctions, delta flips and divergences between delta and price.',
    points: ['Reads the strength of delta, not just its sign', 'Expansion and absorption markers', 'Finished-auction and flip signals', 'Divergence detection'],
    data: 'Tick-by-tick data with bid/ask side.',
  },
  {
    slug: 'absorption-imbalances', name: 'Absorption & Imbalances', tag: 'Levels', img: 'absorption_imbalances',
    blurb: 'Marks prices where aggression repeatedly fails, and stacks diagonal imbalance zones, each extended until it breaks.',
    about: 'Absorption & Imbalances finds the prices where one side kept attacking without result, and the stacked diagonal imbalances left by one-sided auctions. Each level is projected forward and kept on the chart until price breaks or revisits it.',
    points: ['Absorption levels held then rejected', 'Stacked diagonal imbalances', 'Levels extended until broken or revisited', 'Built from tick bid/ask data'],
    data: 'Tick-by-tick data with bid/ask side.',
  },
  {
    slug: 'leg-to-leg', name: 'Leg to Leg', tag: 'Profiles', img: 'leg_to_leg_default',
    blurb: 'Dissects each swing with a volume and delta profile: POC, value area, delta POC, nodes and totals, projected forward.',
    about: 'Leg to Leg cuts the market into swings and profiles each one: where volume concentrated, where delta peaked, how much traded in total. The levels of each leg are projected forward so the next swing can be read against the last.',
    points: ['Volume + delta profile per leg', 'POC, value area and delta POC', 'Automatic (fractal / ATR) or fixed swings', 'Levels projected forward with leg stats'],
    data: 'Tick-by-tick data with bid/ask side.',
  },
  {
    slug: 'tpo-profile', name: 'TPO Profile', tag: 'Profiles', img: 'tpo_profile',
    blurb: 'Sierra-style TPO letters per period with an attached volume and delta profile, value area, singles, poor / excess extremes, IB and opening range.',
    about: 'TPO Profile draws each session the way market profile traders read it: one letter per time period, stacked at every price the market visited, with the TPO and volume POC, value area, midpoint and single prints. Poor and excess highs and lows are flagged, the initial balance and opening range are drawn with their extensions, and a volume profile (grey with the delta in blue / red) sits beside the letters. RTH, full session, overnight or ETH and RTH separately, split by day or as a composite.',
    points: ['Letters or blocks per period, packed, aligned or spread over the session', 'TPO + volume POC, value area, midpoint, singles extended until filled', 'Poor / excess extremes, initial balance with extensions, opening range', 'Attached volume + delta profile, totals block, projected lines and price tags'],
    data: 'Tick-by-tick data with bid/ask side (bars fill in where ticks are missing).',
  },
  {
    slug: 'volume-profile', name: 'Volume Profile', tag: 'Profiles', img: 'volume_profile',
    blurb: 'Composite, per-session or visible-range volume profiles from every tick, with delta, value area, POC, volume nodes and nine drawing styles.',
    about: 'Volume Profile shows where volume traded, built from every tick with its buy / sell side. Build one composite over the last days, weeks or months, one profile per day, week or month, or a profile of exactly what is on screen. Choose regular hours, the full session, the overnight or ETH and RTH separately, then draw it as bars, heatmap, outline or glowing holo, coloured by delta, bid / ask or ETH / RTH.',
    points: ['Composite, split (day / week / month) or visible range', 'RTH, full session, overnight or ETH + RTH split, with exchange presets', 'Value area, POC extended until touched, HVN / LVN nodes', 'Bars, heatmap, outline, holo styles; delta, bid / ask or ETH / RTH colours'],
    data: 'Tick-by-tick data with bid/ask side (bars fill in where ticks are missing).',
  },
  {
    slug: 'daily-market-info', name: 'Daily Market Info', tag: 'Levels', img: 'daily_market_info_full',
    blurb: 'Every session level that matters on one chart: opens, prior day/week/month, value areas, initial balance, VWAP bands and an economic calendar.',
    about: 'Daily Market Info puts the reference levels traders check every morning on one chart, session by session: opens, prior highs and lows, value areas, opening range and initial balance, VWAPs with bands, and the day\'s economic events filtered by impact.',
    points: ['RTH / overnight / Asia / London sessions', 'Value areas, opening range, initial balance', 'VWAPs with bands, key and true opens', 'Economic calendar filtered by impact'],
    data: 'Any intraday data feed.',
  },
];
