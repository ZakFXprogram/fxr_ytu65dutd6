import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../core/icon.component';
import { AdminTransfer } from '../../core/models';
import { ListState, PagerComponent } from './list';

type Row = AdminTransfer & { id: string };
const LABEL: Record<string, string> = { matched: 'matched', unmatched: 'to assign', ignored: 'set aside' };

/**
 * Every confirmed USDT transfer that reached the receiving address. Those that match no order (round amount from an
 * exchange, wrong decimals, payment without an order) wait here: assign them to an order or set them aside.
 */
@Component({
  selector: 'app-panel-payments',
  imports: [FormsModule, IconComponent, PagerComponent],
  template: `
    <div class="toolbar">
      <div class="search"><app-icon name="search" /><input id="pay-q" [ngModel]="list.q()" (ngModelChange)="list.search($event)" placeholder="Transaction id, sender address, order id or exact amount" /></div>
    </div>
    <div class="seg" style="margin-bottom:12px">
      @for (f of filters; track f.id) { <button [class.on]="list.status() === f.id" (click)="list.filter(f.id)">{{ f.label }}</button> }
    </div>

    @if (list.error()) { <div class="errbox" style="margin-bottom:12px">{{ list.error() }}</div> }
    <div class="tbl" [style.opacity]="list.loading() ? .6 : 1">
      <table>
        <thead><tr><th>Received</th><th class="r">Amount</th><th>From</th><th>Transaction</th><th>Status</th><th>Order</th></tr></thead>
        <tbody>
          @for (t of list.items(); track t.id) {
            <tr class="clickable" (click)="open.set(t)">
              <td>{{ fmt.dt(t.paidAt) }}</td>
              <td class="r num"><b>{{ t.amount }}</b> USDT</td>
              <td class="mono small">{{ t.from ? t.from.slice(0, 6) + '…' + t.from.slice(-4) : '—' }}</td>
              <td class="mono small faint">{{ t.txid.slice(0, 12) }}…</td>
              <td><span class="pill" [class]="t.status === 'matched' ? 'paid' : t.status === 'unmatched' ? 'review' : 'cancelled'">{{ label(t.status) }}</span></td>
              <td class="mono small">{{ t.orderId ? t.orderId.slice(0, 8).toUpperCase() : '—' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">{{ list.loading() ? 'Loading…' : (list.status() === '' ? 'Nothing to assign. Every payment found its order.' : 'No payment matches.') }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [page]="list.page()" [size]="list.size()" [total]="list.total()" (pageChange)="list.go($event)" (sizeChange)="list.setSize($event)" />

    @if (open(); as t) {
      <div class="drawer-bg" (click)="open.set(null)"></div>
      <aside class="drawer" role="dialog" aria-label="Payment">
        <div class="spread">
          <div><h2>{{ t.amount }} USDT</h2><div class="small faint">{{ fmt.dt(t.paidAt) }}</div></div>
          <button class="btn btn-ghost btn-xs" (click)="open.set(null)" aria-label="Close"><app-icon name="x" /></button>
        </div>
        <div style="margin-top:14px">
          <div class="kv"><span class="mut">Status</span><span>{{ label(t.status) }}</span></div>
          <div class="kv"><span class="mut">From</span><span class="mono small" style="overflow-wrap:anywhere;text-align:right">{{ t.from || '—' }}</span></div>
          <div class="kv"><span class="mut">Transaction</span><a class="txlink" style="text-align:right" [href]="'https://tronscan.org/#/transaction/' + t.txid" target="_blank" rel="noopener noreferrer">{{ t.txid.slice(0, 14) }}…{{ t.txid.slice(-6) }} <app-icon name="external" /></a></div>
          <div class="kv"><span class="mut">Order</span><span class="mono small">{{ t.orderId || '—' }}</span></div>
          @if (t.note) { <div class="kv"><span class="mut">Note</span><span style="text-align:right;white-space:normal">{{ t.note }}</span></div> }
        </div>
        @if (t.status === 'unmatched') {
          <h3>Assign to an order</h3>
          <p class="help" style="margin-top:0">Ask the member for their order number (8 characters, shown on their payment page and in their billing). The order is marked paid and the licence granted, whatever the amount: check it first.</p>
          <div class="stack">
            <input id="assign-order" [(ngModel)]="orderId" placeholder="Order number, e.g. 5A01AF75" spellcheck="false" />
            <button class="btn btn-ok btn-sm" [disabled]="busy() || !validId()" (click)="assign(t)">Assign and grant the licence</button>
            <input id="ignore-note" [(ngModel)]="note" placeholder="Reason to set it aside (refunded, test, spam…)" />
            <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="ignore(t)">Set aside</button>
          </div>
        }
        <p class="help" style="margin-top:16px">Funds are already in your wallet: this only decides which order they pay. Refunds, if any, are sent by you from your wallet.</p>
      </aside>
    }
  `,
})
export class PanelPaymentsComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  changed = output<void>();
  fmt = fmt;
  label = (s: string) => LABEL[s] ?? s;
  open = signal<Row | null>(null);
  busy = signal(false);
  orderId = '';
  note = '';
  filters = [
    { id: '', label: 'To assign' }, { id: 'matched', label: 'Matched' }, { id: 'ignored', label: 'Set aside' }, { id: 'all', label: 'All' },
  ];
  list = new ListState<Row>((q) => this.api.transfers(q));

  ngOnInit(): void {
    this.list.go(1);
  }

  validId(): boolean {
    return /^[0-9a-f]{8,24}$/i.test(this.orderId.trim());
  }

  private done(text: string): void {
    this.busy.set(false);
    this.open.set(null);
    this.orderId = '';
    this.note = '';
    this.toast.show(text);
    this.list.go();
    this.changed.emit();
  }

  assign(t: Row): void {
    this.busy.set(true);
    this.api.assignTransfer(t.txid, this.orderId.trim()).subscribe({
      next: () => this.done('Payment assigned. Order paid and licence granted.'),
      error: (e) => { this.busy.set(false); this.toast.show(apiError(e), false); },
    });
  }

  ignore(t: Row): void {
    this.busy.set(true);
    this.api.ignoreTransfer(t.txid, this.note.trim()).subscribe({
      next: () => this.done('Payment set aside.'),
      error: (e) => { this.busy.set(false); this.toast.show(apiError(e), false); },
    });
  }
}
