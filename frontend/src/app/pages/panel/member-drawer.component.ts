import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { SiteService } from '../../core/site.service';
import { IconComponent } from '../../core/icon.component';
import { MemberDetail } from '../../core/models';
import { ORDER_LABEL } from './list';

/** Everything about one member in a side panel, with the actions the owner needs. */
@Component({
  selector: 'app-member-drawer',
  imports: [FormsModule, IconComponent],
  template: `
    <div class="drawer-bg" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-label="Member">
      @if (d(); as m) {
        <div class="spread">
          <div class="row">
            @if (m.user.avatarUrl) { <img [src]="m.user.avatarUrl" alt="" style="width:46px;height:46px;border-radius:50%" /> }
            @else { <span class="ava" style="width:46px;height:46px;font-size:16px">{{ m.user.name.charAt(0) }}</span> }
            <div>
              <h2>{{ m.user.name }}</h2>
              <div class="small faint">{{ m.user.username }} · <span class="mono" style="user-select:all">{{ m.user.id }}</span></div>
            </div>
          </div>
          <button class="btn btn-ghost btn-xs" (click)="closed.emit()" aria-label="Close"><app-icon name="x" /></button>
        </div>
        <div class="row" style="margin-top:12px;gap:6px">
          @if (m.user.owner) { <span class="pill owner">owner</span> }
          @if (m.user.banned) { <span class="pill banned">banned</span> }
          <span class="pill" [class.active]="m.user.role">{{ m.user.role ? 'Discord role' : (m.user.inServer === false ? 'not in server' : 'no role') }}</span>
        </div>

        <div class="tiles" style="margin-top:16px">
          <div class="card tile" style="padding:14px"><div class="k">Spent</div><div class="v num">{{ fmt.usd(m.spent) }}</div></div>
          <div class="card tile" style="padding:14px"><div class="k">Joined</div><div class="v" style="font-size:16px">{{ fmt.date(m.user.joinedAt) }}</div></div>
          <div class="card tile" style="padding:14px"><div class="k">Last sign-in</div><div class="v" style="font-size:16px">{{ fmt.ago(m.user.lastLoginAt) }}</div></div>
        </div>

        <h3>Grant time</h3>
        <div class="row">
          <select [(ngModel)]="plan" style="flex:1;min-width:140px">
            @for (p of site.info()?.plans ?? []; track p.id) { <option [value]="p.id">{{ p.label }}</option> }
          </select>
          <input type="number" min="1" max="3650" [(ngModel)]="days" placeholder="or days" style="width:110px" />
          <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="grant(m.user.id)">Grant</button>
        </div>
        <p class="help">Extends the active licence, or creates one. Days override the plan length.</p>

        <h3>Licences</h3>
        @for (l of m.licences; track l.id) {
          <div class="card" style="padding:14px;margin-bottom:8px">
            <div class="spread">
              <b>{{ l.planLabel }}</b>
              <span class="pill" [class]="l.status">{{ l.status }}</span>
            </div>
            <div class="small faint" style="margin-top:4px">
              {{ l.lifetime ? 'Lifetime' : 'Until ' + fmt.date(l.expiresAt) }} · {{ l.activated ? 'computer bound' : 'no computer' }} · key {{ l.keySet ? 'generated' : 'not generated' }} · last seen {{ fmt.ago(l.lastSeenAt) }}
            </div>
            @if (l.status !== 'revoked') {
              <div class="row" style="margin-top:10px;gap:6px">
                @for (n of [7, 30]; track n) { <button class="btn btn-ghost btn-xs" (click)="extend(l.id, n)">+{{ n }} d</button> }
                @if (l.activated) { <button class="btn btn-ghost btn-xs" (click)="reset(l.id)">Reset PC</button> }
                @if (ask() === 'rv' + l.id) {
                  <button class="btn btn-danger btn-xs" (click)="revoke(l.id)">Confirm revoke</button>
                } @else {
                  <button class="btn btn-danger btn-xs" (click)="ask.set('rv' + l.id)">Revoke</button>
                }
              </div>
            }
          </div>
        } @empty { <p class="mut small">No licence.</p> }

        <h3>Orders</h3>
        <div class="tbl">
          <table>
            <tbody>
              @for (o of m.orders; track o.id) {
                <tr><td class="small">{{ fmt.date(o.createdAt) }}</td><td>{{ o.planLabel }}</td><td class="r num">{{ o.amount }}</td><td><span class="pill" [class]="o.status">{{ label(o.status) }}</span></td></tr>
              } @empty { <tr><td class="empty">No orders.</td></tr> }
            </tbody>
          </table>
        </div>

        <h3>Sessions</h3>
        @for (s of m.sessions; track $index) {
          <div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)">{{ s.device }} <span class="faint">· active {{ fmt.ago(s.lastSeenAt) }}{{ s.owner ? ' · owner session' : '' }}</span></div>
        } @empty { <p class="mut small">Not signed in anywhere.</p> }

        @if (m.codes.length) {
          <h3>Redeemed keys</h3>
          @for (c of m.codes; track $index) {
            <div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="mono">…{{ c.hint }}</span> · {{ c.days ? c.days + ' days' : 'lifetime' }} <span class="faint">· {{ fmt.date(c.usedAt) }}</span></div>
          }
        }

        <h3>Actions</h3>
        <div class="row">
          <button class="btn btn-ghost btn-sm" (click)="syncRole(m.user.id)"><app-icon name="refresh" /> Sync Discord role</button>
          <button class="btn btn-ghost btn-sm" (click)="logout(m.user.id)"><app-icon name="logout" /> Sign out everywhere</button>
          @if (!m.user.owner) {
            <button class="btn btn-danger btn-sm" (click)="ban(m.user.id, !m.user.banned)">{{ m.user.banned ? 'Unban' : 'Ban' }}</button>
          }
        </div>

        <h3>Activity</h3>
        <div class="timeline">
          @for (e of m.events; track $index) {
            <div class="ev"><i [class]="e.kind"></i><span class="small">{{ e.text }}</span><span class="small faint">{{ fmt.dt(e.at) }}</span></div>
          } @empty { <p class="mut small">Nothing yet.</p> }
        </div>
      } @else {
        <p class="mut">Loading…</p>
      }
    </aside>
  `,
})
export class MemberDrawerComponent {
  memberId = input.required<string>();
  closed = output<void>();
  changed = output<void>();
  private api = inject(ApiService);
  private toast = inject(ToastService);
  site = inject(SiteService);
  fmt = fmt;
  d = signal<MemberDetail | null>(null);
  busy = signal(false);
  ask = signal('');
  plan = 'month1';
  days: number | null = null;
  label = (s: string) => ORDER_LABEL[s] ?? s;

  constructor() {
    effect(() => this.load(this.memberId()));
  }

  load(id = this.memberId()): void {
    this.api.member(id).subscribe({ next: (m) => this.d.set(m), error: (e) => this.toast.show(apiError(e), false) });
  }

  private done(text: string): void {
    this.busy.set(false);
    this.ask.set('');
    this.toast.show(text);
    this.load();
    this.changed.emit();
  }
  private fail(e: unknown): void { this.busy.set(false); this.toast.show(apiError(e), false); }

  grant(id: string): void {
    this.busy.set(true);
    const days = this.days && this.days > 0 ? Math.round(this.days) : undefined;
    this.api.grant(id, this.plan, days).subscribe({ next: () => { this.days = null; this.done('Time granted.'); }, error: (e) => this.fail(e) });
  }
  extend(licId: string, n: number): void { this.api.extend([licId], n).subscribe({ next: () => this.done(`+${n} days added.`), error: (e) => this.fail(e) }); }
  reset(licId: string): void { this.api.resetMachine(licId).subscribe({ next: () => this.done('Computer released.'), error: (e) => this.fail(e) }); }
  revoke(licId: string): void { this.api.revoke([licId]).subscribe({ next: () => this.done('Licence revoked.'), error: (e) => this.fail(e) }); }
  logout(id: string): void { this.api.logoutMember(id).subscribe({ next: (r) => this.done(`${r.ended} session(s) ended.`), error: (e) => this.fail(e) }); }
  ban(id: string, ban: boolean): void { this.api.ban([id], ban).subscribe({ next: () => this.done(ban ? 'Member banned and signed out.' : 'Member unbanned.'), error: (e) => this.fail(e) }); }
  syncRole(id: string): void {
    this.api.syncMemberRole(id).subscribe({ next: (r) => this.done(`Discord role: ${r.result.replace(/_/g, ' ')}.`), error: (e) => this.fail(e) });
  }
}
