export interface StudyInfo {
  name: string; tag: string; img: string; blurb: string; points: string[];
}
export const STUDIES: StudyInfo[] = [
  {
    name: 'Big Trades', tag: 'Aggression', img: 'big_trades_per_trade',
    blurb: 'A bubble at the exact fill price of every large aggressive trade, sized by how far it stands above the recent average.',
    points: ['Group by print, aggressor order, run or time window', 'Fixed threshold or an automatic rolling cutoff', 'One bubble per candle, or one per trade', 'Level lines left by the very largest trades'],
  },
  {
    name: 'Deep Trades', tag: 'Market by order', img: 'deep_trades',
    blurb: 'The same big trades, classified with market-by-order data: who hit whom. See absorption and real fights between size.',
    points: ['Hollow circle: many small aggressors', 'Filled circle: one big aggressor order', 'Square: a big resting order was hit', 'Diamond: big order vs big resting order (battle)'],
  },
  {
    name: 'Delta Bars', tag: 'Order flow', img: 'delta_bars',
    blurb: 'Colours each candle by an RSI computed on its delta, so you see who is really in control bar by bar.',
    points: ['Cyan: aggressive buyers dominate', 'Magenta: aggressive sellers dominate', 'Spot absorption when colour and price disagree', 'Adjustable thresholds and period'],
  },
  {
    name: 'Delta Heatmap', tag: 'Order flow', img: 'delta_heatmap_default',
    blurb: 'An adaptive delta gradient with markers for expansion, absorption, finished auctions, flips and divergences.',
    points: ['Reads the strength of delta, not just its sign', 'Expansion and absorption markers', 'Finished-auction and flip signals', 'Divergence detection'],
  },
  {
    name: 'Absorption & Imbalances', tag: 'Levels', img: 'absorption_imbalances',
    blurb: 'Marks prices where aggression repeatedly fails, and stacks diagonal imbalance zones, each extended until it breaks.',
    points: ['Absorption levels held then rejected', 'Stacked diagonal imbalances', 'Levels extended until broken or revisited', 'Built from tick bid/ask data'],
  },
  {
    name: 'Leg to Leg', tag: 'Profiles', img: 'leg_to_leg_default',
    blurb: 'Dissects each swing with a volume and delta profile: POC, value area, delta POC, nodes and totals, projected forward.',
    points: ['Volume + delta profile per leg', 'POC, value area and delta POC', 'Automatic (fractal / ATR) or fixed swings', 'Levels projected forward with leg stats'],
  },
  {
    name: 'Daily Market Info', tag: 'Levels', img: 'daily_market_info_full',
    blurb: 'Every session level that matters on one chart: opens, prior day/week/month, value areas, initial balance, VWAP bands and an economic calendar.',
    points: ['RTH / overnight / Asia / London sessions', 'Value areas, opening range, initial balance', 'VWAPs with bands, key and true opens', 'Economic calendar filtered by impact'],
  },
];
