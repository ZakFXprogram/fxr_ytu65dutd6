import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../core/icon.component';
import { AdminPromo } from '../../core/models';

/** Promo & affiliate codes: a % off at checkout, reusable, with a live use count. */
@Component({
  selector: 'app-panel-promos',
  imports: [FormsModule, IconComponent],
  template: `
    <div class="card bundle" style="margin-top:18px">
      <h3 style="margin-top:0">Create a promo code</h3>
      <div class="grid" style="grid-template-columns:minmax(0,1.3fr) 110px minmax(0,1fr) 120px auto;align-items:end;gap:12px">
        <div>
          <label for="pc-code">Code (optional)</label>
          <input id="pc-code" [(ngModel)]="code" placeholder="auto if empty" maxlength="24" style="text-transform:uppercase" />
        </div>
        <div><label for="pc-pct">Discount %</label><input id="pc-pct" type="number" min="1" max="90" [(ngModel)]="percent" /></div>
        <div>
          <label for="pc-kind">Type</label>
          <select id="pc-kind" [(ngModel)]="kind">
            <option value="promo">Promo</option>
            <option value="affiliate">Affiliate</option>
          </select>
        </div>
        <div><label for="pc-max">Max uses</label><input id="pc-max" type="number" min="0" [(ngModel)]="maxUses" placeholder="0 = ∞" /></div>
        <button class="btn btn-primary" [disabled]="busy()" (click)="create()"><app-icon name="ticket" /> Create</button>
      </div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:end;gap:12px;margin-top:12px">
        @if (kind === 'affiliate') {
          <div><label for="pc-aff">Affiliate Discord id (optional)</label><input id="pc-aff" [(ngModel)]="affiliateUser" placeholder="17-20 digits" maxlength="20" /></div>
        }
        <div style="grid-column:2"><label for="pc-note">Note (optional)</label><input id="pc-note" [(ngModel)]="note" placeholder="e.g. Black Friday, partner John" maxlength="200" /></div>
      </div>
      <p class="help">A promo reduces the price by its % at checkout and can be used many times. "Uses" counts orders actually paid with it. Disable one any time.</p>
      @if (fresh()) { <div class="pop" style="margin-top:12px"><div class="codes-out">{{ fresh() }}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" (click)="copy(fresh())"><app-icon name="copy" /> Copy</button></div> }
    </div>

    @if (error()) { <div class="errbox" style="margin:14px 0">{{ error() }}</div> }
    <div class="tbl" [style.opacity]="loading() ? .6 : 1" style="margin-top:18px">
      <table>
        <thead><tr><th>Code</th><th>Off</th><th>Type</th><th>Uses</th><th>In progress</th><th>Revenue</th><th>Limit</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>
          @for (p of items(); track p.id) {
            <tr>
              <td class="mono">{{ p.code }}@if (p.note) { <span class="small faint"> · {{ p.note }}</span> }</td>
              <td>−{{ p.percent }}%</td>
              <td><span class="pill" [class]="p.kind === 'affiliate' ? 'pending' : ''">{{ p.kind }}</span>@if (p.affiliate_user) { <span class="small faint"> {{ p.affiliate_user }}</span> }</td>
              <td><b>{{ p.uses }}</b></td>
              <td class="small">{{ p.pending || '—' }}</td>
              <td class="num">{{ p.revenueUsdt ? p.revenueUsdt + ' USDT' : '—' }}</td>
              <td class="small">{{ p.max_uses || '∞' }}</td>
              <td><span class="pill" [class]="p.status">{{ p.status }}</span></td>
              <td class="small">{{ fmt.date(p.created_ms) }}</td>
              <td>
                @if (p.status === 'active') { <button class="btn btn-danger btn-xs" (click)="toggle(p, true)">Disable</button> }
                @else { <button class="btn btn-ghost btn-xs" (click)="toggle(p, false)">Enable</button> }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="10" class="empty">{{ loading() ? 'Loading…' : 'No promo code yet.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class PanelPromosComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  fmt = fmt;
  code = '';
  percent = 20;
  kind: 'promo' | 'affiliate' = 'promo';
  affiliateUser = '';
  maxUses = 0;
  note = '';
  busy = signal(false);
  loading = signal(true);
  error = signal('');
  fresh = signal('');
  items = signal<AdminPromo[]>([]);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.promos().subscribe({
      next: (r) => { this.items.set(r.items); this.loading.set(false); },
      error: (e) => { this.error.set(apiError(e)); this.loading.set(false); },
    });
  }

  create(): void {
    const percent = Math.round(this.percent);
    if (!(percent >= 1 && percent <= 90)) return this.toast.show('The discount must be between 1 and 90%.', false);
    this.busy.set(true);
    this.api.createPromo({
      code: this.code.trim() || undefined,
      percent,
      kind: this.kind,
      affiliateUser: this.kind === 'affiliate' && this.affiliateUser.trim() ? this.affiliateUser.trim() : undefined,
      maxUses: Math.max(0, Math.round(this.maxUses)) || undefined,
      note: this.note.trim() || undefined,
    }).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.fresh.set(p.code);
        this.toast.show(`Promo ${p.code} created.`);
        this.code = ''; this.note = ''; this.affiliateUser = '';
        this.load();
      },
      error: (e) => { this.busy.set(false); this.toast.show(apiError(e), false); },
    });
  }

  toggle(p: AdminPromo, disable: boolean): void {
    this.api.setPromo(p.id, disable).subscribe({
      next: () => { this.toast.show(disable ? `Promo ${p.code} disabled.` : `Promo ${p.code} enabled.`); this.load(); },
      error: (e) => this.toast.show(apiError(e), false),
    });
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => this.toast.show('Copied.')).catch(() => {});
  }
}
