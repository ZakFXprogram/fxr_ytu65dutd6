import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface QA { q: string; a: string; }

@Component({
  selector: 'app-faq',
  imports: [RouterLink],
  template: `
    <section class="wrap" style="padding-top:48px">
      <div class="center">
        <span class="chip">Questions</span>
        <h1 style="font-size:36px;margin:14px 0 10px">Frequently asked</h1>
      </div>
    </section>
    <section class="wrap section" style="max-width:760px">
      @for (item of faq; track item.q) {
        <div class="card" style="margin-bottom:12px">
          <div class="faq-q">{{ item.q }}</div>
          <div class="mut">{{ item.a }}</div>
        </div>
      }
      <p class="center mut" style="margin-top:20px">Still stuck? Check your <a routerLink="/licence">licence status</a> or ask on Discord.</p>
    </section>
  `,
})
export class FaqComponent {
  faq: QA[] = [
    { q: 'Which platform does FXR work with?', a: 'MotiveWave, on Windows and macOS. The studies need tick-by-tick data with bid/ask side; Rithmic is recommended.' },
    { q: 'How do I pay?', a: 'In USDT (TRC20). After you send the exact amount, the payment is confirmed on-chain automatically and your licence key is issued.' },
    { q: 'Do you store my wallet?', a: 'No. We only ever receive USDT at our public address. We never ask for, store, or touch your private key or seed phrase.' },
    { q: 'Can I use my licence on two computers?', a: 'A licence runs on one computer at a time. You can move it to another machine from the My licence page, or ask support to reset it.' },
    { q: 'Do I need the server running on my PC?', a: 'No. FXR Loader simply checks your licence online when MotiveWave starts. Nothing of ours runs in the background.' },
    { q: 'Are updates included?', a: 'Yes. New versions of the studies are delivered automatically — there is no new file to install.' },
    { q: 'What happens when my plan ends?', a: 'The studies lock until you renew. Your settings and charts stay untouched.' },
    { q: 'Can I get a refund?', a: 'Because licences unlock software immediately, sales are generally final. See the refunds page for the details and exceptions.' },
  ];
}
