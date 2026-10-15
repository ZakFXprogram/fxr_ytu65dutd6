import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../core/session.service';
import { ApiService } from '../core/api.service';
import { Plan } from '../core/models';

@Component({
  selector: 'app-pricing',
  imports: [RouterLink],
  template: `
    <section class="wrap" style="padding-top:48px">
      <div class="center">
        <span class="chip">Simple pricing</span>
        <h1 style="font-size:38px;margin:14px 0 10px">One suite, <span class="grad">8 USDT / month</span></h1>
        <p class="mut" style="max-width:560px;margin:0 auto">Every plan unlocks all seven studies and every update. Pay in USDT; your licence activates as soon as your payment is confirmed.</p>
      </div>
    </section>

    <section class="wrap section">
      @if (error()) { <div class="notice">{{ error() }}</div> }
      <div class="plans">
        @for (p of plans(); track p.id) {
          <div class="card plan">
            @if (p.lifetime) { <span class="badge">Best value</span> }
            <div class="pname">{{ p.label }}</div>
            <div class="pprice">{{ p.price }}<span>USDT</span></div>
            <div class="pper">{{ p.lifetime ? 'One payment, forever' : (p.perMonth ? p.perMonth + ' USDT / month' : 'Renew anytime') }}</div>
            @if (open()) {
              <button class="btn btn-primary" (click)="buy(p.id)">Buy</button>
            } @else {
              <a class="btn btn-ghost" [href]="discordOr('/faq')" [target]="discord() ? '_blank' : '_self'" rel="noopener noreferrer">Buy on Discord</a>
            }
          </div>
        }
      </div>
      <p class="help center" style="margin-top:16px">All plans include the full suite, updates and support. One licence runs on one computer; you can move it to another computer from <a routerLink="/account">your account</a>.</p>
    </section>

    <section class="wrap section">
      <div class="card">
        <h3>How checkout works</h3>
        <div class="steps" style="margin-top:14px">
          <div class="step"><h4>Sign in with Discord &amp; pick a plan</h4><p class="mut" style="margin:0">Your licence is tied to your Discord account — no password to remember.</p></div>
          <div class="step"><h4>Pay in USDT (TRC20)</h4><p class="mut" style="margin:0">Send the exact amount shown to our address, then paste your transaction ID.</p></div>
          <div class="step"><h4>Get your key</h4><p class="mut" style="margin:0">Once the payment is confirmed, your licence is active: get your key from your account and paste it into FXR Loader.</p></div>
        </div>
        <div class="notice" style="margin-top:16px">We never ask for your wallet's private key or seed phrase. Payment only ever means <em>you</em> sending USDT to our address.</div>
      </div>
    </section>
  `,
})
export class PricingComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private session = inject(SessionService);
  plans = signal<Plan[]>([]);
  open = signal(false);
  discord = signal('');
  error = signal('');

  constructor() {
    this.api.site().subscribe({
      next: (s) => { this.plans.set(s.plans); this.discord.set(s.discord); this.open.set(s.paymentsOpen); },
      error: () => this.error.set('Could not load the plans. Please refresh.'),
    });
  }
  discordOr(fallback: string): string { return this.discord() || fallback; }

  buy(plan: string): void {
    if (this.session.signedIn()) void this.router.navigate(['/buy', plan]);
    else this.session.login('/buy/' + plan);
  }
}
