import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, fmt } from '../../core/api.service';
import { IconComponent } from '../../core/icon.component';
import { AdminEvent } from '../../core/models';
import { ListState, PagerComponent } from './list';

@Component({
  selector: 'app-panel-activity',
  imports: [FormsModule, IconComponent, PagerComponent],
  template: `
    <div class="toolbar">
      <div class="search"><app-icon name="search" /><input id="ev-q" [ngModel]="list.q()" (ngModelChange)="list.search($event)" placeholder="Search the log" /></div>
      <select [ngModel]="kind()" (ngModelChange)="list.setExtra('kind', $event)" aria-label="Event type">
        <option value="">All events</option>
        @for (k of kinds; track k.id) { <option [value]="k.id">{{ k.label }}</option> }
      </select>
    </div>
    <div class="tbl" [style.opacity]="list.loading() ? .6 : 1">
      <table>
        <thead><tr><th>When</th><th>Type</th><th>Member</th><th>What happened</th></tr></thead>
        <tbody>
          @for (e of list.items(); track e.id) {
            <tr>
              <td class="small">{{ fmt.dt(e.at) }}</td>
              <td><span class="pill" [class.revoked]="danger(e.kind)" [class.expired]="e.kind === 'attention'" [class.paid]="e.kind === 'paid'">{{ e.kind }}</span></td>
              <td>@if (e.userId) { <button class="linkish" (click)="member.emit(e.userId)">{{ e.userName || e.userId }}</button> } @else { <span class="faint">—</span> }</td>
              <td style="white-space:normal;min-width:260px">{{ e.text }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="empty">{{ list.loading() ? 'Loading…' : 'Nothing matches.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [page]="list.page()" [size]="list.size()" [total]="list.total()" (pageChange)="list.go($event)" (sizeChange)="list.setSize($event)" />
  `,
})
export class PanelActivityComponent {
  private api = inject(ApiService);
  member = output<string>();
  fmt = fmt;
  kinds = [
    { id: 'login', label: 'Sign-ins' }, { id: 'order', label: 'Orders opened' }, { id: 'paid', label: 'Payments' },
    { id: 'attention', label: 'Needs attention' }, { id: 'redeem', label: 'Keys redeemed' }, { id: 'codes', label: 'Keys generated' },
    { id: 'key', label: 'Licence keys' }, { id: 'move', label: 'Computer moves' }, { id: 'role', label: 'Discord roles' },
    { id: 'revoke', label: 'Revocations' }, { id: 'ban', label: 'Bans' }, { id: 'security', label: 'Security' },
  ];
  list = new ListState<AdminEvent & { id: string }>((q) => this.api.events(q) as never);
  kind = () => this.list.extra()['kind'] ?? '';
  danger = (k: string) => k === 'revoke' || k === 'ban' || k === 'security';

  constructor() {
    this.list.go(1);
  }
}
