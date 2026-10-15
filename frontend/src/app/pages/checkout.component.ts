import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { Order } from '../core/models';

@Component({
  selector: 'app-checkout',
  imports: [RouterLink, FormsModule],
  template: `
    <section class="wrap section" style="max-width:640px">
      @if (state() === 'signin') {
        <div class="card center" style="padding:36px 24px">
          <h1 style="font-size:26px;margin:0 0 8px">Sign in to continue</h1>
          <button class="btn btn-discord" (click)="session.login()">Continue with Discord</button>
        </div>
      } @else if (state() === 'missing') {
        <div class="card center mut">This order does not exist. <a routerLink="/account">Go to my account</a></div>
      } @else {
       @if (order(); as o) {
        <div class="center" style="margin-bottom:22px">
          <span class="chip">{{ o.planLabel }} · {{ o.network }}</span>
          <h1 style="font-size:30px;margin:14px 0 6px">Pay {{ o.amount }} USDT</h1>
          <p class="mut" style="margin:0">Order {{ o.id.slice(0, 8) }} · opened {{ time(o.createdAt) }}</p>
        </div>

        @switch (o.status) {
          @case ('pending') {
            <div class="card" style="margin-bottom:16px">
              <div class="steps">
                <div class="step">
                  <h4>Send exactly this amount</h4>
                  <div class="copy" style="margin-top:8px"><code class="big-amount" style="font-size:24px">{{ o.amount }}</code><button class="btn btn-ghost btn-sm" (click)="copy(o.amount)">{{ copied() === o.amount ? 'Copied' : 'Copy' }}</button></div>
                  <p class="help">USDT on the <strong>TRON (TRC20)</strong> network only. The cents identify your order — if your exchange takes a withdrawal fee, make sure we receive exactly {{ o.amount }}.</p>
                </div>
                <div class="step">
                  <h4>To this address</h4>
                  <div class="copy" style="margin-top:8px"><code>{{ o.payTo }}</code><button class="btn btn-ghost btn-sm" (click)="copy(o.payTo)">{{ copied() === o.payTo ? 'Copied' : 'Copy' }}</button></div>
                  <p class="help">After pasting, check the first and last 6 characters: <span class="mono">{{ o.payTo.slice(0, 6) }}…{{ o.payTo.slice(-6) }}</span>.</p>
                </div>
                <div class="step">
                  <h4>Paste your transaction ID</h4>
                  <p class="help" style="margin:0 0 8px">Your wallet or exchange shows it after sending: called TxID, Transaction ID or Hash (64 characters).</p>
                  <input [(ngModel)]="txid" placeholder="e.g. 3f5c…a91b" autocomplete="off" spellcheck="false" (keydown.enter)="submit(o.id)" />
                  <button class="btn btn-primary" style="width:100%;margin-top:12px" [disabled]="busy()" (click)="submit(o.id)">I've paid — submit</button>
                  @if (error()) { <p class="err small" style="margin:10px 0 0">{{ error() }}</p> }
                </div>
              </div>
            </div>
            <div class="notice">Only send USDT on TRON (TRC20); other networks or tokens cannot be recovered. We never send payment addresses by DM — only trust the address on this page. Pay before {{ time(o.expiresAt) }}.</div>
            <p class="center small" style="margin-top:16px">
              @if (confirmCancel()) {
                Cancel this order? <a href="" (click)="$event.preventDefault(); cancel(o.id)">Yes, cancel</a> · <a href="" (click)="$event.preventDefault(); confirmCancel.set(false)">No</a>
              } @else {
                <a href="" class="mut" (click)="$event.preventDefault(); confirmCancel.set(true)">Cancel this order</a>
              }
            </p>
          }
          @case ('submitted') {
            <div class="infobox">
              <strong>Payment submitted — we're checking it.</strong><br />
              Your licence appears in your account as soon as the payment is confirmed. This page refreshes on its own.
            </div>
            <div class="card" style="margin-top:16px">
              <div class="kv"><span class="mut">Amount</span><span class="mono">{{ o.amount }} USDT</span></div>
              <div class="kv"><span class="mut">Transaction</span><span class="mono small" style="overflow-wrap:anywhere;text-align:right">{{ o.txid }}</span></div>
            </div>
          }
          @case ('paid') {
            <div class="okbox"><strong>Payment confirmed.</strong> Your licence is active.</div>
            <p class="center" style="margin-top:18px"><a class="btn btn-primary" routerLink="/account">Get my licence key</a></p>
          }
          @case ('rejected') {
            <div class="errbox"><strong>We could not match this payment.</strong>@if (o.note) { <br />{{ o.note }} }<br />Contact support with your transaction ID and we'll sort it out.</div>
          }
          @default {
            <div class="card center mut">This order is closed ({{ o.status }}). If you already paid, contact support with your transaction ID.<br /><a routerLink="/pricing">Start a new order</a></div>
          }
        }
       } @else {
        <p class="mut center">Loading…</p>
       }
      }
    </section>
  `,
})
export class CheckoutComponent implements OnDestroy {
  private api = inject(ApiService);
  session = inject(SessionService);
  private id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  state = signal<'loading' | 'signin' | 'missing' | 'ready'>('loading');
  order = signal<Order | null>(null);
  txid = '';
  busy = signal(false);
  error = signal('');
  copied = signal('');
  confirmCancel = signal(false);
  private timer = setInterval(() => { if (this.order()?.status === 'submitted') this.load(); }, 20_000);

  constructor() {
    this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  load(): void {
    this.api.order(this.id).subscribe({
      next: (o) => { this.order.set(o); this.state.set('ready'); },
      error: (e: HttpErrorResponse) => this.state.set(e.status === 401 ? 'signin' : 'missing'),
    });
  }

  submit(id: string): void {
    const t = this.txid.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(t)) { this.error.set('A TRON transaction ID is 64 characters (0-9, a-f).'); return; }
    this.busy.set(true); this.error.set('');
    this.api.submitTxid(id, t).subscribe({
      next: (o) => { this.order.set(o); this.busy.set(false); },
      error: (e) => { this.error.set(apiError(e)); this.busy.set(false); },
    });
  }

  cancel(id: string): void {
    this.api.cancelOrder(id).subscribe({ next: (o) => this.order.set(o), error: (e) => this.error.set(apiError(e)) });
  }

  copy(text: string): void {
    void navigator.clipboard?.writeText(text).then(() => this.copied.set(text));
  }

  time(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
