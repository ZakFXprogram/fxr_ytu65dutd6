import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../core/icon.component';
import { AdminMember } from '../../core/models';
import { ListState, PagerComponent } from './list';

@Component({
  selector: 'app-panel-members',
  imports: [FormsModule, IconComponent, PagerComponent],
  template: `
    <div class="toolbar">
      <div class="search"><app-icon name="search" /><input id="members-q" [ngModel]="list.q()" (ngModelChange)="list.search($event)" placeholder="Name, username or Discord ID" /></div>
      <div class="seg">
        @for (f of filters; track f.id) { <button [class.on]="filter() === f.id" (click)="setFilter(f.id)">{{ f.label }}</button> }
      </div>
    </div>
    @if (list.error()) { <div class="errbox" style="margin-bottom:12px">{{ list.error() }}</div> }
    <div class="tbl" [style.opacity]="list.loading() ? .6 : 1">
      <table>
        <thead><tr>
          <th style="width:34px"><input type="checkbox" [checked]="list.allSelected()" (change)="list.toggleAll()" aria-label="Select all" /></th>
          <th>Member</th><th>Licence</th><th class="r">Spent</th><th class="r">Orders</th><th>Discord role</th><th>Joined</th><th>Last sign-in</th>
        </tr></thead>
        <tbody>
          @for (m of list.items(); track m.id) {
            <tr class="clickable" [class.selected]="list.selected().has(m.id)" (click)="member.emit(m.id)">
              <td (click)="$event.stopPropagation()"><input type="checkbox" [checked]="list.selected().has(m.id)" (change)="list.toggle(m.id)" [attr.aria-label]="'Select ' + m.name" /></td>
              <td>
                <span class="row" style="gap:10px;flex-wrap:nowrap">
                  @if (m.avatarUrl) { <img [src]="m.avatarUrl" alt="" style="width:28px;height:28px;border-radius:50%" /> } @else { <span class="ava">{{ m.name.charAt(0) }}</span> }
                  <span>{{ m.name }} @if (m.owner) { <span class="pill owner">owner</span> } @if (m.banned) { <span class="pill banned">banned</span> }<span class="sub">{{ m.username }} · {{ m.id }}</span></span>
                </span>
              </td>
              <td>
                @if (m.activeUntil === 0) { <span class="pill lifetime">lifetime</span> }
                @else if (m.activeUntil) { <span class="pill active">until {{ fmt.date(m.activeUntil) }}</span> }
                @else if (m.licences) { <span class="pill expired">expired</span> }
                @else { <span class="faint">—</span> }
              </td>
              <td class="r num">{{ fmt.usd(m.spent) }}</td>
              <td class="r num">{{ m.orders }}</td>
              <td class="small">{{ m.role ? 'granted' : (m.inServer === false ? 'not in server' : '—') }}</td>
              <td class="small">{{ fmt.date(m.joinedAt) }}</td>
              <td class="small">{{ fmt.ago(m.lastLoginAt) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="empty">{{ list.loading() ? 'Loading…' : 'No member matches.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [page]="list.page()" [size]="list.size()" [total]="list.total()" (pageChange)="list.go($event)" (sizeChange)="list.setSize($event)" />

    @if (list.selected().size) {
      <div class="bulkbar">
        <b>{{ list.selected().size }} selected</b>
        <button class="btn btn-danger btn-xs" (click)="ban(true)">Ban</button>
        <button class="btn btn-ghost btn-xs" (click)="ban(false)">Unban</button>
        <button class="btn btn-ghost btn-xs" (click)="list.clear()">Clear</button>
      </div>
    }
  `,
})
export class PanelMembersComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  member = output<string>();
  fmt = fmt;
  filters = [
    { id: '', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'expired', label: 'Expired' },
    { id: 'none', label: 'No licence' }, { id: 'banned', label: 'Banned' },
  ];
  list = new ListState<AdminMember>((q) => this.api.members(q));
  filter = () => this.list.extra()['filter'] ?? '';

  constructor() {
    this.list.go(1);
  }

  setFilter(f: string): void { this.list.setExtra('filter', f); }

  ban(ban: boolean): void {
    this.api.ban(this.list.ids(), ban).subscribe({
      next: (r) => { this.toast.show(`${r.done} member(s) ${ban ? 'banned' : 'unbanned'}.`); this.list.clear(); this.list.go(); },
      error: (e) => this.toast.show(apiError(e), false),
    });
  }
}
