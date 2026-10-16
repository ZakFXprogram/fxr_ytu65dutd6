import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, apiError, fmt } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { SiteService } from '../core/site.service';
import { IconComponent } from '../core/icon.component';
import { Order } from '../core/models';
import { demoApi } from '../core/demo/demo-setup';

/** /checkout/:id — where NOWPayments sends the buyer back. Follows the order until it is paid or closed. */
@Component({
  selector: 'app-checkout',
  imports: [RouterLink, IconComponent],
  template: `
    <section class="wrap section-tight" style="padding-top:56px;padding-bottom:88px;max-width:720px">
      @if (state() === 'signin') {
        <div class="card center" style="padding:40px 24px">
          <h1 style="font-size:26px">Sign in to see this order</h1>
          <button class="btn btn-discord" (click)="session.login()">Continue with Discord</button>
        </div>
      } @else if (state() === 'missing') {
        <div class="card center mut">This order does not exist. <a routerLink="/dashboard/billing">See my orders</a></div>
      } @else {
        @if (order(); as o) {
          <div class="row small mut"><span>Order {{ o.id.slice(0, 8).toUpperCase() }}</span><span>·</span><span>{{ o.planLabel }}</span><span>·</span><span class="num">{{ o.amount }} USDT</span></div>

          @switch (o.status) {
            @case ('pending') {
              <h1 style="font-size:clamp(28px,3.6vw,40px);margin-top:14px">Waiting for your payment</h1>
              <p class="lead">Pay on the secure checkout page. It detects your payment on its own; this page and your dashboard update by themselves.</p>
              <div class="card bundle" style="margin-top:8px">
                <div class="kv"><span class="mut">Amount</span><b class="disp num">{{ o.amount }} USDT</b></div>
                <div class="kv"><span class="mut">Network</span><span>TRON (TRC20)</span></div>
                <div class="kv"><span class="mut">Opened</span><span>{{ fmt.dt(o.createdAt) }}</span></div>
                <div class="row" style="margin-top:18px">
                  @if (o.checkoutUrl) { <button class="btn btn-primary" (click)="open(o)">Continue to payment <app-icon name="external" /></button> }
                  <button class="btn btn-ghost btn-sm" (click)="cancel(o.id)">Cancel order</button>
                </div>
              </div>
              <p class="help" style="margin-top:14px">Only send USDT on the TRON network to the address shown by the checkout page. We never send payment addresses by DM.</p>
            }
            @case ('confirming') {
              <div class="center pop" style="padding:30px 0">
                <div class="spinner" aria-hidden="true"></div>
                <h1 style="font-size:clamp(26px,3.4vw,36px);margin-top:24px">Payment detected</h1>
                <p class="lead" style="margin:0 auto">The network is confirming it. This usually takes a few minutes for USDT on TRON. You can close this page: your licence turns on by itself.</p>
              </div>
            }
            @case ('paid') {
              <div class="center pop" style="padding:24px 0">
                <svg class="success" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
                <h1 style="font-size:clamp(28px,3.6vw,40px);margin-top:20px">You're in</h1>
                <p class="lead" style="margin:0 auto 24px">Payment confirmed {{ fmt.dt(o.paidAt) }}. Your licence is active and your Discord role is on its way.</p>
                <div class="row" style="justify-content:center">
                  <a class="btn btn-primary" routerLink="/dashboard/licence">Get my licence key</a>
                  @if (site.info()?.discord) { <a class="btn btn-discord" [href]="site.info()!.discord" target="_blank" rel="noopener noreferrer">Open Discord to install</a> }
                </div>
              </div>
            }
            @case ('partially_paid') {
              <h1 style="font-size:32px;margin-top:14px">We received less than the amount</h1>
              <div class="notice">Your payment is set aside for review. Contact support on Discord with order <b>{{ o.id.slice(0, 8).toUpperCase() }}</b> and we will complete it with you.</div>
            }
            @case ('review') {
              <h1 style="font-size:32px;margin-top:14px">Your payment is being reviewed</h1>
              <div class="notice">Something about this payment needs a manual check. Nothing is lost: contact support with order <b>{{ o.id.slice(0, 8).toUpperCase() }}</b>.</div>
            }
            @default {
              <h1 style="font-size:32px;margin-top:14px">This order is closed</h1>
              <p class="mut">Status: {{ o.status }}. If you already paid, contact support with order <b>{{ o.id.slice(0, 8).toUpperCase() }}</b>.</p>
              <a class="btn btn-primary" routerLink="/pricing">Start a new order</a>
            }
          }
          @if (error()) { <p class="err small" style="margin-top:12px">{{ error() }}</p> }
        } @else {
          <p class="mut">Loading your order…</p>
        }
      }
    </section>
  `,
})
export class CheckoutComponent implements OnDestroy {
  private api = inject(ApiService);
  session = inject(SessionService);
  site = inject(SiteService);
  fmt = fmt;
  private id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  state = signal<'loading' | 'signin' | 'missing' | 'ready'>('loading');
  order = signal<Order | null>(null);
  error = signal('');
  private timer = setInterval(() => {
    const s = this.order()?.status;
    if (s === 'pending' || s === 'confirming') this.load();
  }, 5000);

  constructor() {
    this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  load(): void {
    this.api.order(this.id).subscribe({
      next: (o) => {
        if (this.order()?.status !== 'paid' && o.status === 'paid') this.session.refresh();
        this.order.set(o);
        this.state.set('ready');
      },
      error: (e: HttpErrorResponse) => this.state.set(e.status === 401 ? 'signin' : 'missing'),
    });
  }

  open(o: Order): void {
    if (demoApi) {
      demoApi.simulatePayment?.(o.id);
      this.load();
      return;
    }
    if (o.checkoutUrl) window.location.href = o.checkoutUrl;
  }

  cancel(id: string): void {
    this.api.cancelOrder(id).subscribe({ next: (o) => this.order.set(o), error: (e) => this.error.set(apiError(e)) });
  }
}
