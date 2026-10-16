import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStore } from './dashboard.store';
import { fmt } from '../../core/api.service';
import { RevealDirective } from '../../core/motion';

const LABEL: Record<string, string> = {
  pending: 'awaiting payment', confirming: 'confirming', paid: 'paid', partially_paid: 'partially paid', review: 'in review',
  failed: 'failed', expired: 'expired', cancelled: 'cancelled', refunded: 'refunded',
};

@Component({
  selector: 'app-dash-billing',
  imports: [RouterLink, RevealDirective],
  template: `
    @if (store.account(); as a) {
      <h1 class="rise">Billing</h1>
      <p class="mut rise" style="--d:60ms">Your subscription and every payment you made.</p>

      <div class="card bundle rise" style="--d:120ms;margin-top:18px">
        <div class="spread">
          <div>
            <div class="small mut">Current plan</div>
            @if (store.licence(); as l) {
              <div class="row" style="margin-top:4px"><h2 style="font-size:22px;margin:0">FXR Bundle · {{ l.lifetime ? 'Lifetime' : l.planLabel }}</h2><span class="pill" [class]="l.status">{{ l.status }}</span></div>
              <p class="mut" style="margin:6px 0 0">{{ l.lifetime ? 'Paid once, no renewal.' : (l.status === 'active' ? 'Active until ' + fmt.date(l.expiresAt) : 'Ended ' + fmt.date(l.expiresAt)) }}</p>
            } @else {
              <h2 style="font-size:22px;margin:4px 0 0">No plan</h2>
            }
          </div>
          @if (!store.licence()?.lifetime) { <a class="btn btn-primary btn-sm" routerLink="/pricing">{{ store.active() ? 'Add time' : 'Choose a plan' }}</a> }
        </div>
        <p class="help" style="margin-top:14px">Crypto payments are never taken from your wallet automatically, so plans don't renew by themselves. Buying again adds the new period on top of the time you have left.</p>
      </div>

      <h3 style="margin:28px 0 12px">Payments</h3>
      <div class="tbl" fxrReveal>
        <table>
          <thead><tr><th>Date</th><th>Order</th><th>Plan</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (o of a.orders; track o.id) {
              <tr>
                <td>{{ fmt.date(o.createdAt) }}</td>
                <td class="mono small">{{ o.id.slice(0, 8).toUpperCase() }}</td>
                <td>{{ o.planLabel }}</td>
                <td class="r num">{{ o.received || o.pay?.amount || o.amount }} USDT</td>
                <td><span class="pill" [class]="o.status">{{ label(o.status) }}</span></td>
                <td class="r">
                  @if (o.status === 'pending' && o.pay) { <a [routerLink]="['/checkout', o.id]">Pay</a> }
                  @else if (o.status !== 'cancelled') { <a [routerLink]="['/checkout', o.id]">View</a> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty">No payments yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="help" style="margin-top:12px">A problem with a payment? Contact support on Discord with the order number.</p>
    }
  `,
})
export class BillingComponent {
  store = inject(DashboardStore);
  fmt = fmt;
  label = (s: string) => LABEL[s] ?? s;
}
