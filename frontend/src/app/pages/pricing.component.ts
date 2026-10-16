import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PricingBlockComponent } from '../components/pricing-block.component';
import { SiteService } from '../core/site.service';
import { IconComponent } from '../core/icon.component';
import { RevealDirective, SpotDirective } from '../core/motion';
import { FAQ } from './faq.data';

@Component({
  selector: 'app-pricing',
  imports: [RouterLink, PricingBlockComponent, IconComponent, RevealDirective, SpotDirective],
  template: `
    <section class="wrap section-tight" style="padding-top:64px">
      <span class="chip rise">Pricing</span>
      <h1 class="rise" style="--d:80ms;margin-top:16px">One bundle. <span class="grad">Every study.</span></h1>
      <p class="lead rise" style="--d:160ms">Choose a period or pay once for lifetime. You can browse freely; to buy, sign in with Discord so your licence and role land on your account.</p>
    </section>

    <section class="wrap" style="padding-bottom:72px">
      <app-pricing-block class="rise" style="--d:240ms" />
    </section>

    <section class="wrap" style="padding-bottom:72px">
      <div class="sec-head">
        <h2 fxrReveal>Compare the periods</h2>
        <p fxrReveal="80">Every period includes exactly the same thing at 8 USDT a month. Lifetime is the best value: one payment of 67 USDT, less than 9 months of subscription. Buying again adds time on top of what you have left.</p>
      </div>
      <div class="tbl" fxrReveal>
        <table>
          <thead><tr><th>Plan</th><th class="r">Price</th><th class="r">Per month</th><th>Access</th><th>Renewal</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td><b>{{ r.label }}</b></td>
                <td class="r num">{{ r.price }} USDT</td>
                <td class="r num">{{ r.perMonth }}</td>
                <td>{{ r.lifetime ? 'Forever' : r.days + ' days' }}</td>
                <td class="small mut">{{ r.lifetime ? 'None needed' : 'Manual, adds to time left' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="wrap" style="padding-bottom:72px">
      <div class="grid g3">
        <div class="card" fxrSpot fxrReveal>
          <div class="why-ico"><app-icon name="lock" /></div>
          <h3 style="margin:16px 0 6px">Sign in, then pay</h3>
          <p class="mut" style="margin:0">Checkout unlocks once you sign in with Discord. We only read your Discord name, avatar and ID.</p>
        </div>
        <div class="card" fxrSpot fxrReveal="90">
          <div class="why-ico"><app-icon name="card" /></div>
          <h3 style="margin:16px 0 6px">USDT on TRON</h3>
          <p class="mut" style="margin:0">You send an exact amount straight to our wallet, no middleman and no fees on our side. The payment is read from the blockchain by itself.</p>
        </div>
        <div class="card" fxrSpot fxrReveal="180">
          <div class="why-ico"><app-icon name="bolt" /></div>
          <h3 style="margin:16px 0 6px">Access turns on by itself</h3>
          <p class="mut" style="margin:0">Once the network confirms the payment, your licence activates and your Discord role opens the install channel.</p>
        </div>
      </div>
    </section>

    <section class="wrap" style="padding-bottom:88px;max-width:860px">
      <h2 fxrReveal style="font-size:24px">Billing questions</h2>
      @for (q of billing; track q.q) {
        <details class="acc" fxrReveal><summary>{{ q.q }}<span class="plus"></span></summary><div class="ans">{{ q.a }}</div></details>
      }
      <div class="notice" style="margin-top:24px" fxrReveal>
        FXR OrderFlow studies are analysis software, not investment advice. Trading involves a substantial risk of loss. By purchasing you accept the <a routerLink="/legal/terms">Terms of Service</a>, the <a routerLink="/legal/risk">Risk disclosure</a> and the <a routerLink="/legal/refunds">Refund policy</a>.
      </div>
    </section>
  `,
})
export class PricingComponent {
  private site = inject(SiteService);
  billing = FAQ.find((c) => c.id === 'pay')?.items ?? [];
  rows = computed(() => {
    const plans = this.site.info()?.plans ?? [];
    const base = plans.find((p) => p.id === 'month1')?.price ?? 8;
    return plans.map((p) => {
      const months = p.days ? Math.round(p.days / 30) : 0;
      const perMonth = months ? Math.round((p.price / months) * 100) / 100 : null;
      return {
        ...p,
        perMonth: perMonth === null ? 'One payment' : `${perMonth} USDT`,
        save: perMonth === null ? 0 : Math.round((1 - perMonth / base) * 100),
      };
    });
  });
}
