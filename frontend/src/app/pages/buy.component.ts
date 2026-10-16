import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, apiError } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { SiteService } from '../core/site.service';
import { IconComponent } from '../core/icon.component';
import { STUDIES } from '../core/studies';
import { demoApi } from '../core/demo/demo-setup';

/** /buy/:plan — order summary, acceptance of the Terms and Risk disclosure, then the hosted checkout. */
@Component({
  selector: 'app-buy',
  imports: [RouterLink, FormsModule, IconComponent],
  template: `
    <section class="wrap section-tight" style="padding-top:56px;padding-bottom:88px;max-width:980px">
      <a routerLink="/pricing" class="small mut">← Back to pricing</a>
      <h1 class="rise" style="font-size:clamp(28px,3.6vw,40px);margin-top:16px">Checkout</h1>

      @if (!session.me()) {
        <p class="mut">Loading…</p>
      } @else if (!session.signedIn()) {
        <div class="card center pop" style="padding:44px 24px;max-width:560px">
          <div class="why-ico" style="margin:0 auto"><app-icon name="lock" /></div>
          <h2 style="font-size:24px;margin:16px 0 8px">Sign in to continue</h2>
          <p class="mut">Your licence and Discord role are attached to your Discord account, so you can get them back from any computer.</p>
          <button class="btn btn-discord" (click)="session.login(path)">Continue with Discord</button>
        </div>
      } @else {
       @if (plan(); as p) {
        <div class="pricing" style="margin-top:8px">
          <div class="card rise" style="--d:80ms">
            <div class="spread"><h3 style="margin:0">FXR Bundle — {{ p.label }}</h3><span class="pill pending">All {{ studies.length }} studies</span></div>
            <div class="kv" style="margin-top:14px"><span class="mut">Access</span><span>{{ p.lifetime ? 'Lifetime' : p.days + ' days, added to any time you have left' }}</span></div>
            <div class="kv"><span class="mut">Account</span><span>{{ session.user()?.name }} (Discord)</span></div>
            <div class="kv"><span class="mut">Payment</span><span>USDT (TRC20) via NOWPayments</span></div>
            <div class="kv"><span class="mut">Total</span><b class="disp num" style="font-size:22px">{{ p.price }} USDT</b></div>
            <ul class="checks" style="margin-top:18px">
              <li>Licence and Discord role activate automatically once the payment is confirmed</li>
              <li>Install link and guide in the members' channel on Discord</li>
              <li>Every update and future study included</li>
            </ul>
          </div>

          <div class="card bundle rise" style="--d:160ms">
            <h3>Before you pay</h3>
            <label class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:10px;font-weight:500;color:var(--text);font-size:14.5px;cursor:pointer">
              <input type="checkbox" id="accept-terms" [(ngModel)]="accepted" style="margin-top:3px" />
              <span>I have read and accept the <a routerLink="/legal/terms" target="_blank">Terms of Service</a>, the <a routerLink="/legal/refunds" target="_blank">Refund policy</a> and the <a routerLink="/legal/risk" target="_blank">Risk disclosure</a>. I understand the studies are analysis tools, not investment advice, and that trading involves a substantial risk of loss.</span>
            </label>
            <button class="btn btn-primary btn-block" style="margin-top:20px" [disabled]="!accepted || busy()" (click)="pay(p.id)">
              {{ busy() ? 'Opening the secure checkout…' : 'Continue to secure payment' }} <app-icon name="arrow" />
            </button>
            @if (error()) { <p class="err small" style="margin:12px 0 0">{{ error() }}</p> }
            <p class="help" style="margin-top:14px">You will pay on NOWPayments' checkout page, which shows the exact amount and address and detects the payment by itself. Only send USDT on the TRON (TRC20) network. We never ask for your seed phrase or private key.</p>
          </div>
        </div>
       } @else if (site.info()) {
        <div class="card mut">This plan does not exist. <a routerLink="/pricing">Choose a plan</a>.</div>
       }
      }
    </section>
  `,
})
export class BuyComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  session = inject(SessionService);
  site = inject(SiteService);
  studies = STUDIES;
  private planId = inject(ActivatedRoute).snapshot.paramMap.get('plan') ?? '';
  path = '/buy/' + encodeURIComponent(this.planId);
  plan = computed(() => this.site.info()?.plans.find((p) => p.id === this.planId) ?? null);
  accepted = false;
  busy = signal(false);
  error = signal('');

  pay(planId: string): void {
    this.busy.set(true);
    this.error.set('');
    this.api.createOrder(planId, true).subscribe({
      next: (o) => {
        if (demoApi || !o.checkoutUrl) return void this.router.navigate(['/checkout', o.id]);
        window.location.href = o.checkoutUrl; // NOWPayments' hosted checkout
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        if (e.status === 401) this.session.refresh();
        this.error.set(apiError(e, 'The checkout could not be opened. Please try again in a minute.'));
      },
    });
  }
}
