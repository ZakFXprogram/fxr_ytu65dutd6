import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { SiteService } from '../../core/site.service';
import { IconComponent } from '../../core/icon.component';
import { AdminLicence } from '../../core/models';
import { ListState, PagerComponent } from './list';

@Component({
  selector: 'app-panel-licences',
  imports: [FormsModule, IconComponent, PagerComponent],
  template: `
    <div class="toolbar">
      <div class="search"><app-icon name="search" /><input id="lic-q" [ngModel]="list.q()" (ngModelChange)="list.search($event)" placeholder="Member or Discord ID" /></div>
      <select [ngModel]="list.plan()" (ngModelChange)="list.setPlan($event)" aria-label="Plan">
        <option value="">All plans</option>
        @for (p of site.info()?.plans ?? []; track p.id) { <option [value]="p.id">{{ p.label }}</option> }
      </select>
    </div>
    <div class="seg" style="margin-bottom:12px">
      @for (f of filters; track f.id) { <button [class.on]="list.status() === f.id" (click)="list.filter(f.id)">{{ f.label }}</button> }
    </div>
    @if (list.error()) { <div class="errbox" style="margin-bottom:12px">{{ list.error() }}</div> }
    <div class="tbl" [style.opacity]="list.loading() ? .6 : 1">
      <table>
        <thead><tr>
          <th style="width:34px"><input type="checkbox" [checked]="list.allSelected()" (change)="list.toggleAll()" aria-label="Select all" /></th>
          <th>Member</th><th>Plan</th><th>Status</th><th>Expires</th><th>Computer</th><th>Key</th><th>Role</th><th>Last seen</th><th>Source</th>
        </tr></thead>
        <tbody>
          @for (l of list.items(); track l.id) {
            <tr class="clickable" [class.selected]="list.selected().has(l.id)" (click)="member.emit(l.userId)">
              <td (click)="$event.stopPropagation()"><input type="checkbox" [checked]="list.selected().has(l.id)" (change)="list.toggle(l.id)" aria-label="Select licence" /></td>
              <td>{{ l.userName || '—' }}<span class="sub">{{ l.userId }}</span></td>
              <td>{{ l.planLabel }}</td>
              <td><span class="pill" [class]="l.status">{{ l.status }}</span></td>
              <td>{{ l.lifetime ? 'Never' : fmt.date(l.expiresAt) }}</td>
              <td class="small">{{ l.activated ? 'bound' : '—' }}</td>
              <td class="small">{{ l.keySet ? 'generated' : '—' }}</td>
              <td class="small">{{ l.role ? 'granted' : '—' }}</td>
              <td class="small">{{ fmt.ago(l.lastSeenAt) }}</td>
              <td class="small faint">{{ l.source.split(':')[0] }}</td>
            </tr>
          } @empty {
            <tr><td colspan="10" class="empty">{{ list.loading() ? 'Loading…' : 'No licence matches.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [page]="list.page()" [size]="list.size()" [total]="list.total()" (pageChange)="list.go($event)" (sizeChange)="list.setSize($event)" />

    @if (list.selected().size) {
      <div class="bulkbar">
        <b>{{ list.selected().size }} selected</b>
        <span class="small mut">Add</span>
        <input type="number" min="1" max="3650" [(ngModel)]="days" style="width:80px" aria-label="Days to add" />
        <button class="btn btn-primary btn-xs" (click)="extend()">days</button>
        @if (confirmRevoke) {
          <button class="btn btn-danger btn-xs" (click)="revoke()">Confirm revoke</button>
        } @else {
          <button class="btn btn-danger btn-xs" (click)="confirmRevoke = true">Revoke</button>
        }
        <button class="btn btn-ghost btn-xs" (click)="list.clear(); confirmRevoke = false">Clear</button>
      </div>
    }
  `,
})
export class PanelLicencesComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  site = inject(SiteService);
  member = output<string>();
  fmt = fmt;
  days = 7;
  confirmRevoke = false;
  filters = [
    { id: '', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'expiring', label: 'Expiring ≤ 7 days' },
    { id: 'expired', label: 'Expired' }, { id: 'lifetime', label: 'Lifetime' }, { id: 'revoked', label: 'Revoked' },
  ];
  list = new ListState<AdminLicence>((q) => this.api.licences(q));

  constructor() {
    this.list.go(1);
  }

  extend(): void {
    const d = Math.round(this.days);
    if (!(d >= 1 && d <= 3650)) return this.toast.show('Enter between 1 and 3650 days.', false);
    this.api.extend(this.list.ids(), d).subscribe({
      next: (r) => { this.toast.show(`+${d} days on ${r.done} licence(s).`); this.list.clear(); this.list.go(); },
      error: (e) => this.toast.show(apiError(e), false),
    });
  }

  revoke(): void {
    this.api.revoke(this.list.ids()).subscribe({
      next: (r) => { this.toast.show(`${r.done} licence(s) revoked.`); this.confirmRevoke = false; this.list.clear(); this.list.go(); },
      error: (e) => this.toast.show(apiError(e), false),
    });
  }
}
