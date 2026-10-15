import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, apiError } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { AdminOrder, AdminState } from '../core/models';

/**
 * The owner's panel, served only at the secret path. Anyone who is not an admin sees the normal 404 page.
 * The owner signs in with Discord from the site header (Discord 2FA must be on), then opens the secret URL.
 */
@Component({
  selector: 'app-panel',
  imports: [FormsModule, RouterLink],
  template: `
    @if (mode() === 'hidden') {
      <section class="wrap section center" style="padding:90px 16px">
        <h1 style="font-size:60px;margin:0" class="grad">404</h1>
        <p class="mut">This page doesn't exist.</p>
        <a class="btn btn-ghost" routerLink="/">Back home</a>
      </section>
    } @else if (mode() === 'mfa') {
      <section class="wrap section" style="max-width:520px">
        <div class="errbox"><strong>Two-factor authentication required.</strong><br />
          Turn on 2FA on your Discord account (User Settings → My Account → Enable Authenticator App), then sign out and sign in again.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px" (click)="session.logout()">Sign out</button>
      </section>
    } @else if (mode() === 'loading') {
      <p class="mut center section">…</p>
    } @else {
      @if (st(); as s) {
      <section class="wrap section panel">
        <div class="spread" style="margin-bottom:20px">
          <h1 style="font-size:28px;margin:0">Panel</h1>
          <div class="row">
            <button class="btn btn-ghost btn-sm" (click)="refresh()">Refresh</button>
            <button class="btn btn-ghost btn-sm" (click)="session.logout()">Sign out</button>
          </div>
        </div>

        <div class="card">
          <div class="spread">
            <div>
              <div class="mut small">Customers pay to</div>
              <div class="mono" style="font-size:17px;font-weight:700;overflow-wrap:anywhere">{{ s.payAddress || 'PAY_ADDRESS not set — checkout closed' }}</div>
            </div>
            <span class="small mut" style="max-width:340px">If this is not your own wallet address, stop and check your Railway variables and account security right away.</span>
          </div>
        </div>

        <div class="kpi k4" style="margin-bottom:20px">
          <div class="card" [class.hot]="s.stats.toCheck > 0"><div class="n">{{ s.stats.toCheck }}</div><div class="mut">Payments to check</div></div>
          <div class="card"><div class="n">{{ s.stats.active }}</div><div class="mut">Active licences</div></div>
          <div class="card"><div class="n">{{ s.stats.expiringSoon }}</div><div class="mut">Expiring in 7 days</div></div>
          <div class="card"><div class="n">{{ s.stats.members }}</div><div class="mut">Members</div></div>
        </div>
        @if (msg()) { <div [class]="msgOk() ? 'okbox' : 'errbox'" style="margin-bottom:16px">{{ msg() }}</div> }

        <div class="card">
          <h2>Payments to check</h2>
          <div class="infobox small">
            Open the transaction (link in the row) and confirm only if <strong>all</strong> of these are true:
            <ol class="checklist">
              <li>Result is <strong>SUCCESS</strong> (confirmed).</li>
              <li>Token is <strong>Tether USD (USDT)</strong>, contract <span class="mono">{{ s.usdtContract }}</span> — any other "USDT" is fake.</li>
              <li>Recipient is exactly the address above (check all characters, not just the start and end).</li>
              <li>Amount is exactly the amount in the row — the cents identify the order.</li>
              <li>The transfer happened after the order was opened.</li>
            </ol>
          </div>
          <div class="tbl" style="margin-top:12px">
            <table>
              <thead><tr><th>Member</th><th>Plan</th><th>Amount</th><th>Opened</th><th>Transaction</th><th></th></tr></thead>
              <tbody>
                @for (o of toCheck(); track o.id) {
                  <tr>
                    <td>{{ o.userName || '—' }}<div class="mono small mut">{{ o.userId }}</div></td>
                    <td>{{ o.planLabel }}</td>
                    <td class="mono" style="font-weight:700">{{ o.amount }}</td>
                    <td class="small">{{ dt(o.createdAt) }}</td>
                    <td><a class="mono small" [href]="explorer(o.txid!)" target="_blank" rel="noopener noreferrer">{{ o.txid!.slice(0, 10) }}…{{ o.txid!.slice(-6) }} ↗</a></td>
                    <td style="white-space:nowrap;text-align:right">
                      @if (ask() === 'ok:' + o.id) {
                        <button class="btn btn-ok btn-xs" [disabled]="busy()" (click)="confirm(o)">Confirm {{ o.amount }}</button>
                        <button class="btn btn-ghost btn-xs" (click)="ask.set('')">Back</button>
                      } @else if (ask() === 'no:' + o.id) {
                        <input [(ngModel)]="note" placeholder="Reason (shown to member)" style="padding:6px 8px;font-size:12px;width:170px" />
                        <button class="btn btn-danger btn-xs" [disabled]="busy()" (click)="reject(o)">Reject</button>
                        <button class="btn btn-ghost btn-xs" (click)="ask.set('')">Back</button>
                      } @else {
                        <button class="btn btn-ok btn-xs" (click)="ask.set('ok:' + o.id)">Confirm</button>
                        <button class="btn btn-danger btn-xs" style="margin-left:6px" (click)="note = ''; ask.set('no:' + o.id)">Reject</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="mut">Nothing to check.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h2>Licences</h2>
          <div class="tbl">
            <table>
              <thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Expires</th><th>Key</th><th>Computer</th><th></th></tr></thead>
              <tbody>
                @for (l of s.licences; track l.id) {
                  <tr>
                    <td>{{ l.userName || '—' }}<div class="mono small mut">{{ l.userRef }}</div></td>
                    <td>{{ l.plan }}</td>
                    <td><span class="pill" [class]="l.status">{{ l.status }}</span></td>
                    <td>{{ l.lifetime ? 'Lifetime' : d(l.expiresAt) }}</td>
                    <td>{{ l.keySet ? 'Generated' : '—' }}</td>
                    <td>{{ l.activated ? 'Bound' : '—' }}</td>
                    <td style="white-space:nowrap;text-align:right">
                      @if (l.activated) { <button class="btn btn-ghost btn-xs" (click)="resetPc(l.id)">Reset PC</button> }
                      @if (l.status !== 'revoked') {
                        @if (ask() === 'rv:' + l.id) {
                          <button class="btn btn-danger btn-xs" style="margin-left:6px" (click)="revoke(l.id)">Sure?</button>
                        } @else {
                          <button class="btn btn-danger btn-xs" style="margin-left:6px" (click)="ask.set('rv:' + l.id)">Revoke</button>
                        }
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="mut">No licences yet.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <h3 style="margin:22px 0 10px;font-size:16px">Grant time manually</h3>
          <div class="grid g3" style="align-items:end">
            <div><label>Discord user id</label><input [(ngModel)]="grantId" placeholder="e.g. 367247878382419970" inputmode="numeric" /></div>
            <div><label>Plan</label>
              <select [(ngModel)]="grantPlan">
                @for (p of s.plans; track p.id) { <option [value]="p.id">{{ p.label }}</option> }
              </select>
            </div>
            <div><button class="btn btn-primary" style="width:100%" [disabled]="busy()" (click)="grant()">Grant</button></div>
          </div>
          <p class="help">Extends the member's licence (or creates one). They get their key from their account after signing in with Discord.</p>
        </div>

        <div class="card">
          <h2>Members</h2>
          <div class="tbl">
            <table>
              <thead><tr><th>Member</th><th>Licences</th><th>Last sign-in</th><th></th></tr></thead>
              <tbody>
                @for (m of s.members; track m.id) {
                  <tr>
                    <td>{{ m.name }} @if (m.owner) { <span class="pill pending">owner</span> } @if (m.banned) { <span class="pill rejected">banned</span> }
                      <div class="mono small mut">{{ m.id }} · {{ m.username }}</div></td>
                    <td>{{ m.licences }}</td>
                    <td class="small">{{ dt(m.lastLoginAt) }}</td>
                    <td style="white-space:nowrap;text-align:right">
                      <button class="btn btn-ghost btn-xs" (click)="kick(m.id)">Sign out everywhere</button>
                      @if (!m.owner) {
                        <button class="btn btn-danger btn-xs" style="margin-left:6px" (click)="ban(m.id, !m.banned)">{{ m.banned ? 'Unban' : 'Ban' }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h2>Recent orders</h2>
          <div class="tbl">
            <table>
              <thead><tr><th>Opened</th><th>Member</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                @for (o of others(); track o.id) {
                  <tr>
                    <td class="small">{{ dt(o.createdAt) }}</td>
                    <td>{{ o.userName || o.userId }}</td>
                    <td>{{ o.planLabel }}</td>
                    <td class="mono">{{ o.amount }}</td>
                    <td><span class="pill" [class]="o.status">{{ o.status }}</span></td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="mut">No orders yet.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h2>Activity log</h2>
          @for (e of s.events; track $index) {
            <div class="small" style="padding:5px 0;border-bottom:1px solid var(--line)"><span class="mut">{{ dt(e.ts_ms) }}</span> · <strong>{{ e.kind }}</strong> · {{ e.text }}</div>
          }
        </div>
      </section>
      }
    }
  `,
})
export class PanelComponent {
  private api = inject(ApiService);
  session = inject(SessionService);
  mode = signal<'loading' | 'hidden' | 'mfa' | 'ready'>('loading');
  st = signal<AdminState | null>(null);
  toCheck = signal<AdminOrder[]>([]);
  others = signal<AdminOrder[]>([]);
  ask = signal('');
  busy = signal(false);
  msg = signal('');
  msgOk = signal(true);
  note = '';
  grantId = '';
  grantPlan = 'month1';

  constructor() {
    this.api.me().subscribe({
      next: (m) => {
        if (m.admin) { this.mode.set('ready'); this.refresh(); }
        else this.mode.set(m.authenticated && m.adminMfaRequired ? 'mfa' : 'hidden');
      },
      error: () => this.mode.set('hidden'),
    });
  }

  refresh(): void {
    this.api.adminState().subscribe({
      next: (s) => {
        this.st.set(s);
        this.toCheck.set(s.orders.filter((o) => o.status === 'submitted'));
        this.others.set(s.orders.filter((o) => o.status !== 'submitted').slice(0, 50));
      },
      error: () => this.mode.set('hidden'),
    });
  }

  private done(text: string): void { this.msgOk.set(true); this.msg.set(text); this.busy.set(false); this.ask.set(''); this.refresh(); }
  private fail(e: unknown): void { this.msgOk.set(false); this.msg.set(apiError(e)); this.busy.set(false); }

  confirm(o: AdminOrder): void {
    this.busy.set(true);
    this.api.adminConfirm(o.id).subscribe({ next: () => this.done(`Confirmed ${o.amount} USDT — licence granted to ${o.userName ?? o.userId}.`), error: (e) => this.fail(e) });
  }
  reject(o: AdminOrder): void {
    this.busy.set(true);
    this.api.adminReject(o.id, this.note.trim()).subscribe({ next: () => this.done('Order rejected.'), error: (e) => this.fail(e) });
  }
  grant(): void {
    const id = this.grantId.trim();
    if (!/^\d{17,20}$/.test(id)) { this.msgOk.set(false); this.msg.set('Enter a Discord user id (17-20 digits).'); return; }
    this.busy.set(true);
    this.api.adminGrant(id, this.grantPlan).subscribe({ next: () => { this.grantId = ''; this.done('Licence granted.'); }, error: (e) => this.fail(e) });
  }
  revoke(id: string): void { this.api.adminRevoke(id).subscribe({ next: () => this.done('Licence revoked.'), error: (e) => this.fail(e) }); }
  resetPc(id: string): void { this.api.adminResetMachine(id).subscribe({ next: () => this.done('Computer released.'), error: (e) => this.fail(e) }); }
  ban(id: string, ban: boolean): void { this.api.adminBan(id, ban).subscribe({ next: () => this.done(ban ? 'Member banned and signed out.' : 'Member unbanned.'), error: (e) => this.fail(e) }); }
  kick(id: string): void { this.api.adminLogoutMember(id).subscribe({ next: () => this.done('All sessions of this member ended.'), error: (e) => this.fail(e) }); }

  explorer(txid: string): string { return `https://tronscan.org/#/transaction/${txid}`; }
  d(ms: number): string { return ms ? new Date(ms).toLocaleDateString() : '—'; }
  dt(ms: number): string { return ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
}
