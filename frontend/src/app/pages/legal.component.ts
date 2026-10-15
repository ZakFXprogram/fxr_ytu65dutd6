import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

interface Doc { title: string; intro: string; sections: { h: string; p: string }[]; }

@Component({
  selector: 'app-legal',
  template: `
    @if (doc(); as d) {
      <section class="wrap section" style="max-width:760px">
        <h1 style="font-size:32px">{{ d.title }}</h1>
        <p class="mut">{{ d.intro }}</p>
        @for (s of d.sections; track s.h) {
          <h3 style="margin-top:22px">{{ s.h }}</h3>
          <p class="mut">{{ s.p }}</p>
        }
        <p class="help" style="margin-top:28px">This is a general template, not legal advice. Have it reviewed for your jurisdiction before launch.</p>
      </section>
    }
  `,
})
export class LegalComponent {
  private route = inject(ActivatedRoute);
  doc = toSignal(this.route.paramMap.pipe(map((p) => DOCS[p.get('doc') ?? ''] ?? DOCS['terms'])));
}

const DOCS: Record<string, Doc> = {
  terms: {
    title: 'Terms of Service',
    intro: 'These terms govern your use of the FXR OrderFlow studies and this website.',
    sections: [
      { h: 'Licence', p: 'A purchase grants you a personal, non-transferable licence to use the FXR studies in MotiveWave on one computer for the period you paid for. You may not share, resell, decompile or redistribute the software or your key.' },
      { h: 'No financial advice', p: 'The studies are analysis tools. Nothing here is financial advice or a recommendation to trade. Trading involves substantial risk of loss and is your responsibility.' },
      { h: 'Availability', p: 'We aim to keep the service available but do not guarantee uninterrupted access. Features may change as the product evolves.' },
      { h: 'Termination', p: 'We may suspend a licence that breaches these terms, in particular key sharing or attempts to bypass licensing.' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'What we store and why. We keep as little as possible.',
    sections: [
      { h: 'What we store', p: 'From Discord: your id, username, display name and avatar — nothing else (no e-mail, no servers, no messages). Your licence record and orders. A one-way fingerprint of your computer id, used only to bind a licence to one computer. Your licence key is stored only as a one-way hash: nobody, including us, can read it back.' },
      { h: 'Payments', p: 'You pay in USDT to our public address and give us the transaction ID, which is already public on the TRON blockchain. We never ask for or hold your wallet private key or seed phrase.' },
      { h: 'Cookies', p: 'No advertising or analytics cookies. One session cookie after you sign in (HttpOnly, never readable by scripts), and a short-lived cookie during the Discord sign-in itself.' },
      { h: 'Your data', p: 'Ask us to show or delete your data at any time via support.' },
    ],
  },
  refunds: {
    title: 'Refund Policy',
    intro: 'How refunds work for a digital licence.',
    sections: [
      { h: 'Digital goods', p: 'A licence unlocks software immediately, so purchases are generally final and non-refundable once the key has been issued.' },
      { h: 'Exceptions', p: 'If the studies cannot run for you due to a defect on our side and we cannot fix it within a reasonable time, contact support within 7 days of purchase and we will work out a fair resolution.' },
      { h: 'Chargebacks', p: 'Because payments are in crypto, there are no chargebacks. Please reach out first; we respond quickly.' },
    ],
  },
};
