import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SiteService } from '../core/site.service';
import { SessionService } from '../core/session.service';
import { IconComponent } from '../core/icon.component';
import { SpotDirective } from '../core/motion';
import { STUDIES } from '../core/studies';
import { Plan } from '../core/models';

/** The bundle offer: subscription or lifetime, plan picker, and a buy button that needs Discord sign-in first. */
@Component({
  selector: 'app-pricing-block',
  imports: [RouterLink, IconComponent, SpotDirective],
  template: `
    <div class="row" style="justify-content:space-between">
      <div class="bill" role="tablist" aria-label="Billing">
        <span class="knob" [style.left.px]="mode() === 'sub' ? 4 : knobLeft" [style.width.px]="mode() === 'sub' ? 128 : 104"></span>
        <button role="tab" [class.on]="mode() === 'sub'" [attr.aria-selected]="mode() === 'sub'" style="width:128px" (click)="setMode('sub')">Subscription</button>
        <button role="tab" [class.on]="mode() === 'life'" [attr.aria-selected]="mode() === 'life'" style="width:104px" (click)="setMode('life')">Lifetime</button>
      </div>
      <span class="small mut">Prices in USDT. Every plan unlocks all {{ studies.length }} studies.</span>
    </div>

    <div class="pricing">
      <div class="plans">
        @for (p of shown(); track p.id) {
          <button class="card plan" fxrSpot [class.sel]="sel()?.id === p.id" (click)="selId.set(p.id)" [attr.aria-pressed]="sel()?.id === p.id">
            @if (p.lifetime) { <span class="save">Best value</span> }
            <div class="pname">{{ p.label }}</div>
            <div class="pprice num">{{ p.price }}<small>USDT</small></div>
            <div class="pper">{{ p.lifetime ? 'Pay once, keep it forever' : (p.perMonth ? p.perMonth + ' USDT / month' : '30 days of access') }}</div>
          </button>
        }
        @if (mode() === 'life') {
          <div class="card" style="display:flex;flex-direction:column;justify-content:center">
            <p class="mut" style="margin:0;font-size:15px">One payment, no renewal. Every update and future study is included for as long as FXR exists.</p>
          </div>
        }
      </div>

      <div class="card bundle">
        <div class="spread"><h3 style="margin:0">FXR Bundle</h3><span class="pill pending">All {{ studies.length }} studies</span></div>
        @if (sel(); as p) {
          <div class="total num">{{ p.price }} <small>USDT {{ p.lifetime ? 'once' : '/ ' + p.label.toLowerCase().replace('monthly', 'month') }}</small></div>
        }
        <ul class="checks" style="margin:18px 0 22px">
          <li>Big Trades, Deep Trades, Delta Bars, Delta Heatmap, Absorption &amp; Imbalances, Leg to Leg, Volume Profile, TPO Profile, Daily Market Info</li>
          <li>Automatic updates through FXR Loader</li>
          <li>Every future study at no extra cost</li>
          <li>Private Discord role, install channel and support</li>
        </ul>
        @if (!site.info()?.paymentsOpen && site.info()) {
          <a class="btn btn-ghost btn-block" [href]="site.info()?.discord || '/faq'" target="_blank" rel="noopener noreferrer">Checkout opens soon — join the Discord</a>
        } @else if (session.signedIn()) {
          <button class="btn btn-primary btn-block" [disabled]="!sel()" (click)="buy()">Buy {{ sel()?.label?.toLowerCase() }} — {{ sel()?.price }} USDT</button>
        } @else {
          <button class="btn btn-discord btn-block" (click)="signIn()"><app-icon name="lock" /> Sign in with Discord to buy</button>
          <p class="help" style="margin-top:10px">Your licence is linked to your Discord account, so you can get it back from any computer.</p>
        }
        <p class="help" style="margin-top:12px">Pay in USDT (TRC20) straight to our wallet, no middleman. Your licence and Discord role activate automatically once the blockchain confirms the payment. <a routerLink="/legal/terms">Terms</a> · <a routerLink="/legal/refunds">Refunds</a></p>
      </div>
    </div>
  `,
})
export class PricingBlockComponent {
  site = inject(SiteService);
  session = inject(SessionService);
  private router = inject(Router);
  studies = STUDIES;
  mode = signal<'sub' | 'life'>('sub');
  selId = signal('month1');
  knobLeft = 132;
  shown = computed(() => (this.site.info()?.plans ?? []).filter((p) => (this.mode() === 'life') === p.lifetime));
  sel = computed<Plan | null>(() => this.shown().find((p) => p.id === this.selId()) ?? this.shown()[0] ?? null);

  setMode(m: 'sub' | 'life'): void {
    this.mode.set(m);
    this.selId.set(m === 'life' ? 'lifetime' : 'month1');
  }

  buy(): void {
    const p = this.sel();
    if (p) void this.router.navigate(['/buy', p.id]);
  }

  signIn(): void {
    const p = this.sel();
    this.session.login(p ? '/buy/' + p.id : '/pricing');
  }
}
