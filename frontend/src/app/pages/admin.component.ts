import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AdminState } from '../core/models';

@Component({
  selector: 'app-admin',
  imports: [FormsModule],
  template: `
    @if (!authed()) {
      <section class="wrap section" style="max-width:380px">
        <div class="center" style="margin-bottom:18px"><h1 style="font-size:28px">Admin</h1><p class="mut">Sign in to manage licences.</p></div>
        <div class="card">
          <label>User</label>
          <input [(ngModel)]="user" autocomplete="username" />
          <label style="margin-top:12px">Password</label>
          <input type="password" [(ngModel)]="password" autocomplete="current-password" (keydown.enter)="login()" />
          <button class="btn btn-primary" style="width:100%;margin-top:16px" [disabled]="busy()" (click)="login()">Sign in</button>
          @if (error()) { <p class="err" style="margin:12px 0 0">{{ error() }}</p> }
        </div>
      </section>
    } @else {
      @if (state(); as s) {
      <section class="wrap section">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <h1 style="font-size:28px;margin:0">Dashboard</h1>
          <button class="btn btn-ghost" style="margin-left:auto;padding:8px 14px" (click)="refresh()">Refresh</button>
          <button class="btn btn-ghost" style="padding:8px 14px" (click)="logout()">Sign out</button>
        </div>

        <div class="kpi" style="margin-bottom:22px">
          <div class="card"><div class="n">{{ s.stats.active }}</div><div class="mut">Active licences</div></div>
          <div class="card"><div class="n">{{ s.stats.expiringSoon }}</div><div class="mut">Expiring in 7 days</div></div>
          <div class="card"><div class="n">{{ s.stats.total }}</div><div class="mut">Total issued</div></div>
        </div>

        <div class="card" style="margin-bottom:22px">
          <h3 style="margin-top:0">Create a licence</h3>
          <div class="grid g3" style="align-items:end">
            <div><label>Discord ID</label><input [(ngModel)]="newRef" placeholder="e.g. 367247878382419970" /></div>
            <div><label>Plan</label>
              <select [(ngModel)]="newPlan">
                @for (p of s.plans; track p.id) { <option [value]="p.id">{{ p.label }}</option> }
              </select>
            </div>
            <div><button class="btn btn-primary" style="width:100%" [disabled]="busy()" (click)="create()">Create &amp; show key</button></div>
          </div>
          @if (newKey()) {
            <div class="notice" style="margin-top:14px">New key (shown once): <strong class="mono">{{ newKey() }}</strong></div>
          }
        </div>

        <div class="card">
          <h3 style="margin-top:0">Licences</h3>
          <div style="overflow:auto">
            <table>
              <thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Expires</th><th>Computer</th><th></th></tr></thead>
              <tbody>
                @for (l of s.licences; track l.id) {
                  <tr>
                    <td class="mono">{{ l.userRef }}</td>
                    <td>{{ l.plan }}</td>
                    <td><span class="pill" [class]="l.status">{{ l.status }}</span></td>
                    <td>{{ l.lifetime ? 'Lifetime' : fmt(l.expiresAt) }}</td>
                    <td>{{ l.activated ? 'Bound' : '—' }}</td>
                    <td style="white-space:nowrap">
                      @if (l.activated) { <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px" (click)="reset(l.id)">Reset PC</button> }
                      @if (l.status === 'active') { <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px;margin-left:6px" (click)="revoke(l.id)">Revoke</button> }
                    </td>
                  </tr>
                }
                @if (!s.licences.length) { <tr><td colspan="6" class="mut">No licences yet.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      </section>
      }
    }
  `,
})
export class AdminComponent {
  private api = inject(ApiService);
  authed = signal(false);
  state = signal<AdminState | null>(null);
  user = 'admin';
  password = '';
  error = signal('');
  busy = signal(false);
  newRef = '';
  newPlan = 'month1';
  newKey = signal('');

  constructor() {
    this.api.adminMe().subscribe({ next: (r) => { if (r.authenticated) { this.authed.set(true); this.refresh(); } } });
  }

  login(): void {
    this.busy.set(true); this.error.set('');
    this.api.adminLogin(this.user.trim(), this.password).subscribe({
      next: () => { this.password = ''; this.authed.set(true); this.busy.set(false); this.refresh(); },
      error: () => { this.error.set('Wrong user or password.'); this.busy.set(false); },
    });
  }
  logout(): void { this.api.adminLogout().subscribe(() => { this.authed.set(false); this.state.set(null); }); }
  refresh(): void { this.api.adminState().subscribe({ next: (s) => this.state.set(s), error: () => this.authed.set(false) }); }

  create(): void {
    if (!this.newRef.trim()) return;
    this.busy.set(true); this.newKey.set('');
    this.api.adminCreate(this.newRef.trim(), this.newPlan).subscribe({
      next: (r) => { this.newKey.set(r.key); this.newRef = ''; this.busy.set(false); this.refresh(); },
      error: () => this.busy.set(false),
    });
  }
  revoke(id: string): void { this.api.adminRevoke(id).subscribe(() => this.refresh()); }
  reset(id: string): void { this.api.adminResetMachine(id).subscribe(() => this.refresh()); }
  fmt(ms: number): string { return ms ? new Date(ms).toLocaleDateString() : '—'; }
}
