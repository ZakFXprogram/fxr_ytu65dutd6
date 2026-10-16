import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { SiteService } from '../../core/site.service';
import { IconComponent } from '../../core/icon.component';
import { AdminOrder } from '../../core/models';
import { ListState, ORDER_LABEL, PagerComponent } from './list';

@Component({
  selector: 'app-panel-orders',
  imports: [FormsModule, IconComponent, PagerComponent],
  template: `
    <div class="toolbar">
      <div class="search"><app-icon name="search" /><input id="orders-q" [ngModel]="list.q()" (ngModelChange)="list.search($event)" placeholder="Member, Discord ID, order, txid, sender or exact amount" /></div>
      <select [ngModel]="list.plan()" (ngModelChange)="list.setPlan($event)" aria-label="Plan">
        <option value="">All plans</option>
        @for (p of site.info()?.plans ?? []; track p.id) { <option [value]="p.id">{{ p.label }}</option> }
      </select>
      <a class="btn btn-ghost btn-sm" [href]="csv()" download><app-icon name="download" /> Export CSV</a>
    </div>
    <div class="seg" style="margin-bottom:12px">
      @for (f of filters; track f.id) { <button [class.on]="list.status() === f.id" (click)="list.filter(f.id)">{{ f.label }}</button> }
    </div>

    @if (list.error()) { <div class="errbox" style="margin-bottom:12px">{{ list.error() }}</div> }
    <div class="tbl" [style.opacity]="list.loading() ? .6 : 1">
      <table>
        <thead><tr>
          <th style="width:34px"><input type="checkbox" [checked]="list.allSelected()" (change)="list.toggleAll()" aria-label="Select all" /></th>
          <th>Opened</th><th>Order</th><th>Member</th><th>Plan</th><th class="r">Asked</th><th class="r">Received</th><th>Status</th><th>Transaction</th>
        </tr></thead>
        <tbody>
          @for (o of list.items(); track o.id) {
            <tr class="clickable" [class.selected]="list.selected().has(o.id)" (click)="open.set(o)">
              <td (click)="$event.stopPropagation()"><input type="checkbox" [checked]="list.selected().has(o.id)" (change)="list.toggle(o.id)" [attr.aria-label]="'Select ' + o.id" /></td>
              <td>{{ fmt.dt(o.createdAt) }}</td>
              <td class="mono small">{{ o.id.slice(0, 8).toUpperCase() }}</td>
              <td><button class="linkish" (click)="$event.stopPropagation(); member.emit(o.userId)">{{ o.userName || o.userId }}</button><span class="sub">{{ o.userId }}</span></td>
              <td>{{ o.planLabel }}</td>
              <td class="r num">{{ o.expected || o.amount }}</td>
              <td class="r num">{{ o.received || '—' }}</td>
              <td><span class="pill" [class]="o.status">{{ label(o.status) }}</span></td>
              <td class="small mono faint">{{ (o.txid || o.claimedTxid) ? (o.txid || o.claimedTxid)!.slice(0, 10) + '…' : '—' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="9" class="empty">{{ list.loading() ? 'Loading…' : 'No order matches.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [page]="list.page()" [size]="list.size()" [total]="list.total()" (pageChange)="list.go($event)" (sizeChange)="list.setSize($event)" />

    @if (list.selected().size) {
      <div class="bulkbar">
        <b>{{ list.selected().size }} selected</b>
        <button class="btn btn-danger btn-xs" (click)="cancelSelected()">Cancel unpaid orders</button>
        <button class="btn btn-ghost btn-xs" (click)="list.clear()">Clear</button>
      </div>
    }

    @if (open(); as o) {
      <div class="drawer-bg" (click)="open.set(null)"></div>
      <aside class="drawer" role="dialog" aria-label="Order">
        <div class="spread">
          <div><h2>Order {{ o.id.slice(0, 8).toUpperCase() }}</h2><div class="small faint mono" style="user-select:all">{{ o.id }}</div></div>
          <button class="btn btn-ghost btn-xs" (click)="open.set(null)" aria-label="Close"><app-icon name="x" /></button>
        </div>
        <div class="row" style="margin-top:12px"><span class="pill" [class]="o.status">{{ label(o.status) }}</span></div>
        <div style="margin-top:14px">
          <div class="kv"><span class="mut">Member</span><button class="linkish" (click)="member.emit(o.userId)">{{ o.userName || o.userId }}</button></div>
          <div class="kv"><span class="mut">Plan</span><span>{{ o.planLabel }}</span></div>
          <div class="kv"><span class="mut">Price</span><b class="num">{{ o.amount }} USDT</b></div>
          <div class="kv"><span class="mut">Exact amount asked</span><span class="num mono">{{ o.expected || '—' }}</span></div>
          <div class="kv"><span class="mut">Received</span><span class="num">{{ o.received ? o.received + ' USDT' : '—' }}</span></div>
          <div class="kv"><span class="mut">Opened</span><span>{{ fmt.dt(o.createdAt) }}</span></div>
          <div class="kv"><span class="mut">Window ends</span><span>{{ fmt.dt(o.expiresAt) }}</span></div>
          <div class="kv"><span class="mut">Paid</span><span>{{ fmt.dt(o.paidAt) }}{{ o.decidedBy && o.decidedBy !== 'blockchain' ? ' (by owner)' : '' }}</span></div>
          @if (o.payer) { <div class="kv"><span class="mut">Sent from</span><span class="mono small" style="overflow-wrap:anywhere;text-align:right">{{ o.payer }}</span></div> }
          @if (o.txid || o.claimedTxid; as t) {
            <div class="kv"><span class="mut">{{ o.txid ? 'Transaction' : 'Transaction given' }}</span><a class="txlink" style="text-align:right" [href]="'https://tronscan.org/#/transaction/' + t" target="_blank" rel="noopener noreferrer">{{ t.slice(0, 14) }}…{{ t.slice(-6) }} <app-icon name="external" /></a></div>
          }
          @if (o.note) { <div class="kv"><span class="mut">Note</span><span style="text-align:right;white-space:normal">{{ o.note }}</span></div> }
        </div>
        <h3>Actions</h3>
        <div class="stack">
          @if (o.status !== 'paid') {
            <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="recheck(o)"><app-icon name="refresh" /> Check the blockchain now</button>
          }
          @if (o.status !== 'paid' && o.status !== 'cancelled') {
            <div class="card" style="padding:14px">
              <label for="paid-note">Mark as paid manually (e.g. a partial payment you accept)</label>
              <input id="paid-note" [(ngModel)]="note" placeholder="Reason, kept in the log" />
              <button class="btn btn-ok btn-sm" style="margin-top:10px" [disabled]="busy() || !note.trim()" (click)="markPaid(o)">Mark as paid and grant the licence</button>
            </div>
            @if (o.status === 'pending' || o.status === 'review' || o.status === 'partially_paid') {
              <button class="btn btn-danger btn-sm" [disabled]="busy()" (click)="cancel([o.id])">Cancel this order</button>
            }
          }
        </div>
        <p class="help" style="margin-top:16px">Orders are paid automatically when a confirmed USDT transfer of their exact amount reaches your address, checked on two blockchain sources. Manual actions are written to the activity log.</p>
      </aside>
    }
  `,
})
export class PanelOrdersComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  site = inject(SiteService);
  initialStatus = input('');
  member = output<string>();
  changed = output<void>();
  fmt = fmt;
  label = (s: string) => ORDER_LABEL[s] ?? s;
  open = signal<AdminOrder | null>(null);
  busy = signal(false);
  note = '';
  filters = [
    { id: '', label: 'All' }, { id: 'attention', label: 'Needs attention' }, { id: 'open', label: 'In progress' },
    { id: 'paid', label: 'Paid' }, { id: 'partially_paid', label: 'Partial' }, { id: 'review', label: 'Review' },
    { id: 'expired', label: 'Expired' }, { id: 'cancelled', label: 'Cancelled' }, { id: 'failed', label: 'Failed' },
  ];
  list = new ListState<AdminOrder>((q) => this.api.orders(q));

  ngOnInit(): void {
    this.list.status.set(this.initialStatus());
    this.list.go(1);
  }

  csv(): string {
    return this.api.ordersCsvUrl({ q: this.list.q() || undefined, status: this.list.status() || undefined, plan: this.list.plan() || undefined });
  }

  private after(text: string): void {
    this.busy.set(false);
    this.toast.show(text);
    this.list.go();
    this.changed.emit();
  }
  private fail(e: unknown): void { this.busy.set(false); this.toast.show(apiError(e), false); }

  recheck(o: AdminOrder): void {
    this.busy.set(true);
    this.api.recheckOrder(o.id).subscribe({
      next: (r) => { this.open.set({ ...o, status: r.status as AdminOrder['status'] }); this.after(`Checked on the blockchain: ${this.label(r.status)}.`); },
      error: (e) => this.fail(e),
    });
  }
  markPaid(o: AdminOrder): void {
    this.busy.set(true);
    this.api.markPaid(o.id, this.note.trim()).subscribe({
      next: () => { this.note = ''; this.open.set(null); this.after('Marked as paid. Licence granted.'); },
      error: (e) => this.fail(e),
    });
  }
  cancel(ids: string[]): void {
    this.busy.set(true);
    this.api.cancelOrders(ids).subscribe({
      next: (r) => { this.open.set(null); this.list.clear(); this.after(`${r.done} order(s) cancelled.`); },
      error: (e) => this.fail(e),
    });
  }
  cancelSelected(): void { this.cancel(this.list.ids()); }
}
