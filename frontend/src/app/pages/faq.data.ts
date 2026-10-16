export interface QA { q: string; a: string; home?: boolean }
export interface FaqCategory { id: string; label: string; items: QA[] }

export const FAQ: FaqCategory[] = [
  {
    id: 'start',
    label: 'Getting started',
    items: [
      { q: 'What do I need to run the studies?', a: 'MotiveWave on Windows or macOS and a data feed with tick-by-tick trades and their bid/ask side. Rithmic is recommended. Deep Trades also needs market-by-order (MBO) data enabled in MotiveWave.', home: true },
      { q: 'How do I install FXR OrderFlow?', a: 'Everything happens on our Discord. Once your payment is confirmed you receive the member role, which opens the install channel with the FXR Loader download and a step-by-step guide. You install the loader once; updates arrive on their own after that.', home: true },
      { q: 'Which MotiveWave edition do I need?', a: 'Any edition that supports custom studies and tick data. If you can add third-party studies and see time and sales for your instrument, you are good to go.' },
      { q: 'Which instruments does it work on?', a: 'Any instrument your feed provides tick data for: index futures (ES, NQ, YM, RTY), energies, metals, currencies, bonds and their micro contracts. The studies adapt their thresholds to each instrument.' },
    ],
  },
  {
    id: 'pay',
    label: 'Payments & billing',
    items: [
      { q: 'How do I pay?', a: 'Sign in with Discord, choose a plan and accept the terms. The payment page shows an exact amount in USDT, for example 8.0037, our TRON (TRC20) address and its QR code. Send that amount from your wallet or exchange: the payment is detected on the blockchain by itself, with no middleman and no form to fill.', home: true },
      { q: 'Why such a precise amount, like 8.0037?', a: 'The last decimals identify your order, so we can recognise your payment on the blockchain without asking you for anything. They cost less than one cent. Send the amount exactly as shown.' },
      { q: 'My exchange cannot send the exact decimals. What do I do?', a: 'Send at least the price of the plan, then paste the transaction id (hash or TXID) from your exchange\'s withdrawal history into the form on the payment page. We verify it on the blockchain and your licence turns on.' },
      { q: 'Why do I have to sign in with Discord before paying?', a: 'Your licence is attached to your Discord account. That is how your Discord role and your licence key find you after the payment, and how you get them back from any computer. We only read your Discord name, avatar and ID.' },
      { q: 'How long does activation take?', a: 'About a minute after the TRON network confirms your payment. The payment page and your dashboard update by themselves, your licence turns on and your Discord role is added automatically.', home: true },
      { q: 'I paid after the timer ran out. Is my payment lost?', a: 'No. A payment of your order\'s exact amount is still recognised for 6 hours after the timer ends. After that, or for any other doubt, contact support on Discord with your order number: every payment that reaches our address is recorded.' },
      { q: 'I sent less than the amount shown. What happens?', a: 'The payment is kept and set aside for review. Contact support on Discord with your order number and we will complete it with you. Only USDT on TRON can be received: another token or network cannot be recovered.' },
      { q: 'Does my subscription renew automatically?', a: 'No. Crypto payments cannot be pulled from your wallet, so every plan is a prepaid period. Before it ends, buy any plan again from your dashboard and the new time is added on top of what you have left.' },
      { q: 'Can I get a refund?', a: 'Licences unlock software immediately, so purchases are generally final. If the studies cannot run on your setup because of a fault on our side that we cannot fix, contact us within 7 days. The refund policy has the details.' },
    ],
  },
  {
    id: 'licence',
    label: 'Licence & account',
    items: [
      { q: 'Can I use my licence on two computers?', a: 'A licence runs on one computer at a time. You can release it from the Licence page of your dashboard and activate it on another computer, once every 7 days.', home: true },
      { q: 'I lost my licence key. What do I do?', a: 'Open your dashboard and generate a new key on the Licence page. The new key replaces the old one immediately, so a key you shared or lost stops working.' },
      { q: 'What is "Redeem a key"?', a: 'If you received an activation key (from a giveaway, a partner or a gift), enter it on the Redeem page of your dashboard. The time it carries is added to your licence and your Discord role is given automatically.' },
      { q: 'I did not get my Discord role.', a: 'Make sure you have joined our Discord server with the same account you signed in with, then press "Check my role" on your dashboard. If it still does not appear, contact support.' },
      { q: 'How do I see where my account is signed in?', a: 'The Security page of your dashboard lists every active session with its browser and system. You can sign out of one session or of all the others in one click.' },
    ],
  },
  {
    id: 'studies',
    label: 'Studies & data',
    items: [
      { q: 'Do the studies repaint?', a: 'No. Each mark is drawn from prints that have already happened. On a live chart the current bar keeps updating until it closes, like any candle; history does not change afterwards.' },
      { q: 'What is the difference between Big Trades and Deep Trades?', a: 'Big Trades shows where large aggressive volume traded. Deep Trades uses market-by-order data on top of that to tell whether the size came from one order or many small ones, and whether it hit a large resting order. They share the same thresholds so they always agree.' },
      { q: 'Can I change the colours and thresholds?', a: 'Yes. Every study has its own settings for colours, sizes, thresholds and grouping, and you can save them as MotiveWave templates.' },
      { q: 'Will new studies be added?', a: 'Yes. Every future study is included in the bundle at no extra cost and is delivered through FXR Loader.' },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    items: [
      { q: 'How do I get help?', a: 'Members have a private support channel on Discord, which is the fastest way. For billing questions you can also write to the support e-mail shown at the bottom of the site.' },
      { q: 'Is FXR OrderFlow investment advice?', a: 'No. The studies are analysis tools for educational and informational purposes. Nothing we publish is a recommendation to buy or sell anything, and trading carries a substantial risk of loss. See the risk disclosure.' },
      { q: 'Will someone from FXR ever DM me to ask for a payment?', a: 'No. We never send payment addresses or links by direct message and we never ask for your wallet\'s seed phrase or private key. Only pay through the checkout opened from this website.' },
    ],
  },
];
