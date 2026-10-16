import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { SiteService } from '../../core/site.service';
import { IconComponent } from '../../core/icon.component';
import { AdminCode } from '../../core/models';
import { ListState, PagerComponent } from './list';

/** Redeem keys: generate batches (shown once), follow which were used and by whom, disable leaked ones. */
@Component({
  selector: 'app-panel-keys',
  imports: [FormsModule, IconComponent, PagerComponent],
  template: `
    <div class="card bundle" style="margin-top:18px">
      <h3 style="margin-top:0">Generate redeem keys</h3>
      <div class="grid" style="grid-template-columns:minmax(0,1.2fr) 110px minmax(0,1.2fr) auto;align-items:end">
        <div><label for="gen-plan">Plan</label>
          <select id="gen-plan" [(ngModel)]="plan">@for (p of site.info()?.plans ?? []; track p.id) { <option [value]="p.id">{{ p.label }}</option> }</select>
        </div>
        <div><label for="gen-count">How many</label><input id="gen-count" type="number" min="1" max="200" [(ngModel)]="count" /></div>
        <div><label for="gen-batch">Batch name (optional)</label><input id="gen-batch" [(ngModel)]="batch" placeholder="e.g. giveaway-october" maxlength="40" /></div>
        <button class="btn btn-primary" [disabled]="busy()" (click)="generate()"><app-icon name="ticket" /> Generate</button>
      </div>
      <p class="help">Keys are stored only as a hash: copy or download them now, they cannot be shown again. Each key works once.</p>
      @if (fresh().length) {
        <div class="pop" style="margin-top:12px">
          <div class="codes-out">{{ fresh().join('\\n') }}</div>
          <div class="row" style="margin-top:10px">
            <button class="btn btn-ghost btn-sm" (click)="copyAll()"><app-icon name="copy" /> Copy all</button>
            <button class="btn btn-ghost btn-sm" (click)="download()"><app-icon name="download" /> Download .csv</button>
            <button class="btn btn-ghost btn-sm" (click)="fresh.set([])">I saved them</button>
          </div>
        </div>
      }
    </div>

    @if (batches().length) {
      <div class="row" style="margin-top:18px">
        <span class="small mut">Batches:</span>
        @for (b of batches(); track b.batch) {
          <button class="chip" style="cursor:pointer" [style.borderColor]="list.extra()['batch'] === b.batch ? 'var(--v2)' : ''" (click)="toggleBatch(b.batch)">{{ b.batch }} · {{ b.used }}/{{ b.n }} used</button>
        }
      </div>
    }

    <div class="toolbar">
      <div class="search"><app-icon name="search" /><input id="keys-q" [ngModel]="list.q()" (ngModelChange)="list.search($event)" placeholder="Last characters of a key, member or batch" /></div>
      <div class="seg">
        @for (f of filters; track f.id) { <button [class.on]="list.status() === f.id" (click)="list.filter(f.id)">{{ f.label }}</button> }
      </div>
    </div>
    @if (list.error()) { <div class="errbox" style="margin-bottom:12px">{{ list.error() }}</div> }
    <div class="tbl" [style.opacity]="list.loading() ? .6 : 1">
      <table>
        <thead><tr>
          <th style="width:34px"><input type="checkbox" [checked]="list.allSelected()" (change)="list.toggleAll()" aria-label="Select all" /></th>
          <th>Key</th><th>Gives</th><th>Status</th><th>Batch</th><th>Created</th><th>Used by</th><th>Used</th>
        </tr></thead>
        <tbody>
          @for (c of list.items(); track c.id) {
            <tr [class.selected]="list.selected().has(c.id)">
              <td><input type="checkbox" [checked]="list.selected().has(c.id)" (change)="list.toggle(c.id)" aria-label="Select key" /></td>
              <td class="mono">RDM-…-{{ c.hint }}</td>
              <td>{{ c.days ? c.days + ' days' : 'Lifetime' }}</td>
              <td><span class="pill" [class]="c.status">{{ c.status }}</span></td>
              <td class="small">{{ c.batch || '—' }}</td>
              <td class="small">{{ fmt.date(c.createdAt) }}</td>
              <td>{{ c.usedByName || c.usedBy || '—' }}</td>
              <td class="small">{{ fmt.dt(c.usedAt) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="empty">{{ list.loading() ? 'Loading…' : 'No key yet.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [page]="list.page()" [size]="list.size()" [total]="list.total()" (pageChange)="list.go($event)" (sizeChange)="list.setSize($event)" />

    @if (list.selected().size) {
      <div class="bulkbar">
        <b>{{ list.selected().size }} selected</b>
        <button class="btn btn-danger btn-xs" (click)="disable()">Disable unused keys</button>
        <button class="btn btn-ghost btn-xs" (click)="list.clear()">Clear</button>
      </div>
    }
  `,
})
export class PanelKeysComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  site = inject(SiteService);
  fmt = fmt;
  plan = 'month1';
  count = 5;
  batch = '';
  busy = signal(false);
  fresh = signal<string[]>([]);
  batches = signal<{ batch: string; n: number; used: number }[]>([]);
  filters = [{ id: '', label: 'All' }, { id: 'unused', label: 'Unused' }, { id: 'used', label: 'Used' }, { id: 'disabled', label: 'Disabled' }];
  list = new ListState<AdminCode>(
    (q) => this.api.codes(q),
    (p) => this.batches.set((p as unknown as { batches?: { batch: string; n: number; used: number }[] }).batches ?? []),
  );

  constructor() {
    this.list.go(1);
  }

  toggleBatch(b: string): void { this.list.setExtra('batch', this.list.extra()['batch'] === b ? '' : b); }

  generate(): void {
    const n = Math.round(this.count);
    if (!(n >= 1 && n <= 200)) return this.toast.show('Generate between 1 and 200 keys at a time.', false);
    this.busy.set(true);
    this.api.generateCodes(this.plan, n, this.batch.trim()).subscribe({
      next: (r) => { this.busy.set(false); this.fresh.set(r.codes); this.toast.show(`${r.codes.length} key(s) generated.`); this.list.go(1); },
      error: (e) => { this.busy.set(false); this.toast.show(apiError(e), false); },
    });
  }

  copyAll(): void {
    navigator.clipboard?.writeText(this.fresh().join('\n')).then(() => this.toast.show('Keys copied.')).catch(() => this.toast.show('Select the keys and copy them manually.', false));
  }

  download(): void {
    const plan = this.site.info()?.plans.find((p) => p.id === this.plan)?.label ?? this.plan;
    const csv = 'key,plan,batch\n' + this.fresh().map((k) => `${k},${plan},${this.batch.trim()}`).join('\n') + '\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `fxr-keys-${this.batch.trim() || 'batch'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  disable(): void {
    this.api.disableCodes(this.list.ids()).subscribe({
      next: (r) => { this.toast.show(`${r.done} key(s) disabled.`); this.list.clear(); this.list.go(); },
      error: (e) => this.toast.show(apiError(e), false),
    });
  }
}
