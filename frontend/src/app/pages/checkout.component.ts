import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, apiError, fmt } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { SiteService } from '../core/site.service';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../core/icon.component';
import { Order } from '../core/models';
import { demoApi } from '../core/demo/demo-setup';

const TRONSCAN = 'https://tronscan.org/#/transaction/';

/**
 * /checkout/:id — pay USDT (TRC20) straight to our wallet. The page shows the exact amount (its last decimals
 * identify the order), the address and its QR code, then follows the order until the blockchain confirms it.
 */
@Component({
  selector: 'app-checkout',
  imports: [RouterLink, FormsModule, IconComponent, NgTemplateOutlet],
  template: `
    <section class="wrap section-tight" style="padding-top:56px;padding-bottom:88px;max-width:880px">
      @if (state() === 'signin') {
        <div class="card center" style="padding:40px 24px">
          <h1 style="font-size:26px">Sign in to see this order</h1>
          <button class="btn btn-discord" (click)="session.login()">Continue with Discord</button>
        </div>
      } @else if (state() === 'missing') {
        <div class="card center mut">This order does not exist. <a routerLink="/dashboard/billing">See my orders</a></div>
      } @else {
        @if (order(); as o) {
          <div class="row small mut"><span>Order {{ o.id.slice(0, 8).toUpperCase() }}</span><span>·</span><span>FXR Bundle, {{ o.planLabel }}</span><span>·</span><span class="num">{{ o.amount }} USDT</span></div>

          @switch (o.status) {
            @case ('pending') {
              @if (o.pay; as p) {
                <h1 class="rise" style="font-size:clamp(28px,3.8vw,42px);margin-top:14px">Send exactly <span class="grad">{{ p.amount }} USDT</span></h1>
                <p class="lead rise" style="--d:60ms">From any wallet or exchange, on the TRON network. Your payment is detected on the blockchain by itself: keep this page open or come back later.</p>

                <div class="card bundle rise" style="--d:120ms;margin-top:6px">
                  <div class="paybox">
                    <div>
                      <div class="payline">
                        <div class="lbl"><span>Amount, exactly</span><span>the last digits identify your order</span></div>
                        <div class="payval">
                          <code class="big" id="pay-amount">{{ head(p.amount) }}<span class="hl">{{ tail(p.amount) }}</span><span class="unit">USDT</span></code>
                          <button class="btn btn-ghost btn-sm" (click)="copy(p.amount, 'Amount')"><app-icon name="copy" /> {{ copied() === p.amount ? 'Copied' : 'Copy' }}</button>
                        </div>
                      </div>
                      <div class="payline">
                        <div class="lbl"><span>Network and token</span></div>
                        <div class="netchips"><span class="tron">TRON · TRC20</span><span class="usdt">USDT (Tether)</span></div>
                      </div>
                      <div class="payline">
                        <div class="lbl"><span>Our address</span><span>check the first and last 4 characters</span></div>
                        <div class="payval">
                          <code id="pay-address"><span class="hl">{{ p.address.slice(0, 4) }}</span>{{ p.address.slice(4, -4) }}<span class="hl">{{ p.address.slice(-4) }}</span></code>
                          <button class="btn btn-ghost btn-sm" (click)="copy(p.address, 'Address')"><app-icon name="copy" /> {{ copied() === p.address ? 'Copied' : 'Copy' }}</button>
                        </div>
                      </div>
                    </div>
                    <div class="qrcol">
                      <div class="qr"><img [src]="qr" width="212" height="212" alt="QR code of our TRON address" /></div>
                      <div class="timer" [class.low]="left() < 300000"><span><app-icon name="clock" /> Time left</span><b>{{ clock() }}</b></div>
                      <div class="timebar"><i [style.width.%]="share()"></i></div>
                    </div>
                  </div>
                  <div class="watch"><span class="dot"></span>Watching the TRON blockchain. Confirmed payments show up here within about a minute.</div>
                </div>

                <div class="grid g2" style="margin-top:16px">
                  <div class="card">
                    <h3 style="margin:0 0 12px;font-size:16px">How to pay</h3>
                    <ol class="steps-mini">
                      <li><span>In your wallet or exchange, choose <b>USDT</b> on the <b>TRON (TRC20)</b> network.</span></li>
                      <li><span>Paste our address and check its first and last 4 characters.</span></li>
                      <li><span>Send exactly <b>{{ p.amount }}</b> USDT. Network fees are paid by the sender, on top.</span></li>
                    </ol>
                  </div>
                  <div class="notice" style="align-self:start">
                    <b>Only USDT on TRON.</b> Another token or network cannot be recovered. Always copy the address from this page, never from your transaction history, and never trust an address sent to you by DM: we never send one.
                  </div>
                </div>

                <ng-container *ngTemplateOutlet="claimTpl; context: { o: o, open: false }" />
                <div class="row" style="margin-top:18px">
                  @if (demo) { <button class="btn btn-primary btn-sm" (click)="simulate(o.id)">Simulate the payment (preview only)</button> }
                  <button class="btn btn-ghost btn-sm" (click)="cancel(o.id)">Cancel this order</button>
                </div>
              }
            }
            @case ('confirming') {
              <div class="center pop" style="padding:30px 0">
                <div class="spinner" aria-hidden="true"></div>
                <h1 style="font-size:clamp(26px,3.4vw,36px);margin-top:24px">Checking your transaction</h1>
                <p class="lead" style="margin:0 auto">We are waiting for the TRON network to confirm it, usually a minute or two. You can close this page: your licence turns on by itself.</p>
                @if (o.txid) { <p class="small" style="margin-top:14px"><a class="txlink" [href]="tronscan + o.txid" target="_blank" rel="noopener noreferrer">{{ o.txid }} <app-icon name="external" /></a></p> }
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
                @if (o.txid) { <p class="small faint" style="margin-top:18px">Transaction <a class="txlink" [href]="tronscan + o.txid" target="_blank" rel="noopener noreferrer">{{ o.txid.slice(0, 12) }}…{{ o.txid.slice(-6) }}</a></p> }
              </div>
            }
            @case ('expired') {
              <h1 style="font-size:32px;margin-top:14px">This order's time ran out</h1>
              <p class="mut">If you already sent <b>{{ o.pay?.amount }} USDT</b>, don't worry: a payment of that exact amount is still recognised for 6 hours. If your exchange sent a different amount, give us the transaction id below.</p>
              <ng-container *ngTemplateOutlet="claimTpl; context: { o: o, open: true }" />
              <div class="row" style="margin-top:18px"><a class="btn btn-primary" routerLink="/pricing">Start a new order</a></div>
            }
            @case ('partially_paid') {
              <h1 style="font-size:32px;margin-top:14px">We received less than the price</h1>
              <div class="notice">We received <b>{{ o.received }} USDT</b> for a {{ o.amount }} USDT plan. Your payment is safe and set aside: contact support on Discord with order <b>{{ o.id.slice(0, 8).toUpperCase() }}</b> and we will complete it with you.</div>
            }
            @case ('review') {
              <h1 style="font-size:32px;margin-top:14px">Your payment is being reviewed</h1>
              <div class="notice">Something about this payment needs a manual check. Nothing is lost: contact support on Discord with order <b>{{ o.id.slice(0, 8).toUpperCase() }}</b>.</div>
            }
            @default {
              <h1 style="font-size:32px;margin-top:14px">This order is closed</h1>
              <p class="mut">Status: {{ o.status }}. If you already paid, contact support with order <b>{{ o.id.slice(0, 8).toUpperCase() }}</b>.</p>
              <a class="btn btn-primary" routerLink="/pricing">Start a new order</a>
            }
          }
          @if (error()) { <p class="err small" style="margin-top:12px">{{ error() }}</p> }

          <ng-template #claimTpl let-o="o" let-open="open">
            @if (o.canClaim) {
              <details class="claim card" [open]="open">
                <summary>Paid from an exchange, or a different amount?</summary>
                <p class="small mut" style="margin:10px 0 0">Some exchanges can't send the exact decimals. Send at least {{ o.amount }} USDT, then paste the transaction id (also called hash or TXID) from your exchange's withdrawal history. We verify it on the blockchain.</p>
                <form (ngSubmit)="claim(o.id)">
                  <input id="claim-txid" name="txid" [(ngModel)]="txid" placeholder="64 characters, e.g. 3f9c…a71b" autocomplete="off" spellcheck="false" maxlength="70" />
                  <button class="btn btn-primary btn-sm" type="submit" [disabled]="busy() || !validTx()">{{ busy() ? 'Checking on the blockchain…' : 'Verify my transaction' }}</button>
                </form>
              </details>
            }
          </ng-template>
        } @else {
          <p class="mut">Loading your order…</p>
        }
      }
    </section>
  `,
})
export class CheckoutComponent implements OnDestroy {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  session = inject(SessionService);
  site = inject(SiteService);
  fmt = fmt;
  tronscan = TRONSCAN;
  demo = !!demoApi;
  qr = demoApi?.qrUrl ?? '/api/payments/qr.svg';
  private id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  state = signal<'loading' | 'signin' | 'missing' | 'ready'>('loading');
  order = signal<Order | null>(null);
  error = signal('');
  busy = signal(false);
  copied = signal('');
  txid = '';
  private now = signal(Date.now());

  left = computed(() => Math.max(0, (this.order()?.expiresAt ?? 0) - this.now()));
  clock = computed(() => {
    const s = Math.floor(this.left() / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  share = computed(() => {
    const o = this.order();
    if (!o) return 0;
    return Math.max(0, Math.min(100, (this.left() / Math.max(1, o.expiresAt - o.createdAt)) * 100));
  });

  private ticker = setInterval(() => {
    this.now.set(Date.now());
    const o = this.order();
    if (o?.status === 'pending' && o.expiresAt <= Date.now()) this.load();
  }, 1000);
  private poller = setInterval(() => {
    const s = this.order()?.status;
    if (s === 'pending' || s === 'confirming') this.load();
  }, 5000);

  constructor() {
    this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.ticker);
    clearInterval(this.poller);
  }

  /** "8.0037" -> "8.00" + "37": the unique decimals are highlighted. */
  head(a: string): string {
    const i = a.indexOf('.');
    return i < 0 ? a : a.slice(0, i + 3);
  }
  tail(a: string): string {
    const i = a.indexOf('.');
    return i < 0 ? '' : a.slice(i + 3);
  }

  validTx(): boolean {
    return /^(0x)?[0-9a-fA-F]{64}$/.test(this.txid.trim());
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

  copy(text: string, what: string): void {
    navigator.clipboard?.writeText(text).then(
      () => { this.copied.set(text); this.toast.show(`${what} copied`); },
      () => this.toast.show('Select it and copy it manually.', false),
    );
  }

  claim(id: string): void {
    if (!this.validTx()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.claimTx(id, this.txid.trim()).subscribe({
      next: (o) => {
        this.busy.set(false);
        this.txid = '';
        this.order.set(o);
        if (o.status === 'paid') this.session.refresh();
      },
      error: (e) => { this.busy.set(false); this.error.set(apiError(e)); },
    });
  }

  simulate(id: string): void {
    demoApi?.simulatePayment?.(id);
    this.load();
  }

  cancel(id: string): void {
    this.api.cancelOrder(id).subscribe({ next: (o) => this.order.set(o), error: (e) => this.error.set(apiError(e)) });
  }
}
