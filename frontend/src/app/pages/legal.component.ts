import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { SiteService } from '../core/site.service';

interface Doc { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] }

const UPDATED = 'October 17, 2026';

@Component({
  selector: 'app-legal',
  imports: [RouterLink],
  template: `
    @if (doc(); as d) {
      <section class="wrap section-tight legal" style="padding-top:64px;padding-bottom:88px">
        <div class="row rise" style="gap:8px">
          @for (l of links; track l.id) { <a class="chip" [routerLink]="['/legal', l.id]" [style.opacity]="l.title === d.title ? 1 : .6">{{ l.label }}</a> }
        </div>
        <h1 class="rise" style="--d:80ms;font-size:clamp(30px,4vw,44px);margin-top:20px">{{ d.title }}</h1>
        <p class="faint small rise" style="--d:120ms">Last updated {{ d.updated }}</p>
        <p class="lead rise" style="--d:160ms">{{ d.intro }}</p>
        @for (s of d.sections; track s.h; let i = $index) {
          <h2>{{ i + 1 }}. {{ s.h }}</h2>
          @for (p of s.p; track $index) { <p>{{ p }}</p> }
        }
        <p class="help" style="margin-top:36px">Questions about this document: {{ site.info()?.support || 'contact us on Discord' }}.</p>
      </section>
    }
  `,
})
export class LegalComponent {
  site = inject(SiteService);
  links = [
    { id: 'terms', label: 'Terms', title: DOCS['terms'].title },
    { id: 'risk', label: 'Risk disclosure', title: DOCS['risk'].title },
    { id: 'privacy', label: 'Privacy', title: DOCS['privacy'].title },
    { id: 'refunds', label: 'Refunds', title: DOCS['refunds'].title },
  ];
  doc = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => DOCS[p.get('doc') ?? ''] ?? DOCS['terms'])));
}

const DOCS: Record<string, Doc> = {
  terms: {
    title: 'Terms of Service',
    updated: UPDATED,
    intro: 'These terms govern your use of this website, of the FXR OrderFlow studies and of FXR Loader, provided by FXR Fluxora ("we"). By creating an account, buying or redeeming a licence, or using the software, you accept them.',
    sections: [
      { h: 'What we provide', p: ['FXR OrderFlow is a set of analysis studies (indicators) for the MotiveWave trading platform, delivered through FXR Loader, together with access to our Discord community and support channels.', 'The studies display information computed from market data supplied by your own data feed. We do not provide market data, brokerage, execution or account management services.'] },
      { h: 'No investment advice', p: ['The studies, this website, our Discord server, our videos and any message from us are provided for educational and informational purposes only. Nothing we publish is investment, financial, legal or tax advice, a recommendation, or an offer or solicitation to buy or sell any security, future, currency, crypto-asset or other financial instrument.', 'We are not a registered investment adviser, broker-dealer, commodity trading adviser or financial institution, and we do not know your financial situation. Any decision to trade is yours alone. Consult a licensed professional before making financial decisions.'] },
      { h: 'Risk', p: ['Trading futures, options, forex, CFDs and crypto-assets involves a substantial risk of loss and is not suitable for every person. You can lose more than your initial deposit. Past performance, examples, screenshots (including those made on simulated data) and community discussions do not guarantee future results.', 'Read the Risk disclosure, which is part of these terms.'] },
      { h: 'Accounts', p: ['You sign in with your Discord account. You are responsible for keeping that account secure, including turning on Discord two-factor authentication, and for everything done through it.', 'You must be of legal age in your country to buy a licence.'] },
      { h: 'Licence', p: ['A purchase or a redeemed key grants you a personal, non-exclusive, non-transferable licence to use the studies on one computer at a time for the period paid for (or without end for a lifetime licence, for as long as the service is operated).', 'You may not share, resell, sublicense or publish your key, decompile, modify or redistribute the software, or try to bypass the licensing. Licences shared or used in breach of these terms may be revoked without refund.'] },
      { h: 'Payments', p: ['Prices are shown in USDT. You pay directly to our TRON address, in USDT on the TRON (TRC20) network, the exact amount shown on the payment page; the payment is confirmed when the blockchain shows it. Each plan is a prepaid period and does not renew automatically. Network fees are paid by the sender. You are responsible for sending USDT on the indicated network to the address shown on the payment page: other tokens, other networks or wrong addresses cannot be recovered. A payment below the price is held and completed or settled with support.', 'We never ask for your wallet\'s private key or seed phrase and we never send payment addresses by direct message.'] },
      { h: 'Software provided "as is"', p: ['The studies and the website are provided "as is" and "as available", without warranty of any kind, including accuracy, fitness for a particular purpose or uninterrupted availability. Market data can be delayed, incomplete or wrong, and studies can display incorrect information as a result.'] },
      { h: 'Limitation of liability', p: ['To the fullest extent permitted by law, we are not liable for any trading losses, lost profits, or indirect, incidental or consequential damages arising from the use of, or inability to use, the studies, the website or the community, even if advised of the possibility. Our total liability for any claim is limited to the amount you paid us in the 3 months before the claim.'] },
      { h: 'Third-party services', p: ['MotiveWave, data feeds such as Rithmic, Discord, the TRON network and the wallets or exchanges you pay from are independent third parties. Their availability and terms are outside our control. FXR OrderFlow is not affiliated with or endorsed by them.'] },
      { h: 'Suspension and termination', p: ['We may suspend or end access for breach of these terms, abuse of the community, fraud or chargeback attempts. You may stop using the service at any time.'] },
      { h: 'Changes', p: ['We may update these terms; the date at the top shows the latest version. Continuing to use the service after a change means you accept it.'] },
    ],
  },
  risk: {
    title: 'Risk Disclosure',
    updated: UPDATED,
    intro: 'Please read this before using FXR OrderFlow. It is part of the Terms of Service.',
    sections: [
      { h: 'Trading is risky', p: ['Trading futures, options, forex, CFDs, leveraged products and crypto-assets involves a substantial risk of loss and is not appropriate for everyone. Leverage can work against you as much as for you, and you can lose more than you invested. Only trade with money you can afford to lose.'] },
      { h: 'Not investment advice', p: ['FXR OrderFlow studies are analysis tools. They show information derived from market data; they do not tell you what to buy or sell. Nothing on this website, in the software, on our Discord, in our videos or in any message from us is investment advice or a recommendation, and nothing should be read as a promise of profit.', 'FXR Fluxora and its members are not licensed financial advisers. Opinions shared in the community are personal and not endorsed by us.'] },
      { h: 'No guarantee of results', p: ['Past performance is not indicative of future results. Examples, screenshots and charts on this website are illustrations, often made on simulated data. Hypothetical or simulated results have inherent limitations: they are prepared with the benefit of hindsight and do not reflect real execution, slippage, fees or the emotional pressure of live trading.'] },
      { h: 'Data and software limits', p: ['Studies depend on the quality of your data feed and platform. Data can be delayed, missing or erroneous, and software can contain bugs. Always confirm information with your own platform before acting on it.'] },
      { h: 'Your responsibility', p: ['You alone decide whether, when and how to trade, and you alone bear the results. If in doubt, seek advice from an independent, licensed professional.'] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: UPDATED,
    intro: 'What we store, why, and what we never store. We keep as little as possible.',
    sections: [
      { h: 'What we store', p: ['From Discord: your user ID, username, display name and avatar. Nothing else: no e-mail, no server list, no messages.', 'Your licences, orders and redeemed keys, and an activity log of account events (sign-ins, payments, key changes) that you can see on your dashboard.', 'For each signed-in session: the browser and system name (for example "Chrome on Windows"), so you can recognise and close sessions. We do not store IP addresses.', 'A one-way fingerprint of your computer ID, used only to bind your licence to one computer. Your licence key is stored only as a one-way hash: nobody, including us, can read it back.'] },
      { h: 'Payments', p: ['You pay us directly on the TRON blockchain, which is public. For each order we keep the amount asked, the transaction id, the amount received and the sending address, as anyone can see them on the blockchain. We read public blockchain data through TronGrid (TRON) to confirm payments; it receives our own address, never your Discord identity. We never ask for or hold any private key or seed phrase.'] },
      { h: 'Discord role', p: ['When your licence is active, our bot adds the member role to your account on our Discord server, and removes it when the licence ends.'] },
      { h: 'Cookies', p: ['No advertising or analytics cookies. One session cookie after you sign in (HttpOnly, not readable by scripts) and a short-lived cookie during the Discord sign-in itself.'] },
      { h: 'Your rights', p: ['You can sign out of any session from your dashboard at any time. Ask support to see, export or delete your data; deleting your data also ends your licence.'] },
    ],
  },
  refunds: {
    title: 'Refund Policy',
    updated: UPDATED,
    intro: 'How refunds work for a digital licence.',
    sections: [
      { h: 'Digital goods', p: ['A licence unlocks software immediately, so purchases are generally final once the licence is active.'] },
      { h: 'Exceptions', p: ['If the studies cannot run on a supported setup because of a fault on our side that we cannot fix within a reasonable time, contact support within 7 days of purchase and we will find a fair solution, which can be an extension or a refund.'] },
      { h: 'Payment problems', p: ['If you paid too little, too much or twice, contact support on Discord with your order number from the dashboard. Every payment that reaches our address is recorded, so nothing is lost. Crypto payments cannot be charged back, so please reach out first: we answer quickly.', 'When a refund is due, it is sent in USDT on TRON to an address you give us in writing, minus the network fee. We cannot refund tokens or networks we do not support, sent to our address by mistake.'] },
    ],
  },
};
