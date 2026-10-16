import { Component, inject, signal } from '@angular/core';
import { DashboardStore } from './dashboard.store';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../core/icon.component';
import { Session } from '../../core/models';

@Component({
  selector: 'app-dash-security',
  imports: [IconComponent],
  template: `
    <h1 class="rise">Security</h1>
    <p class="mut rise" style="--d:60ms">Where your account is signed in, and your sign-in history.</p>

    <div class="card rise" style="--d:120ms;margin-top:18px">
      <div class="spread">
        <div class="row">
          @if (session.user()?.avatarUrl) { <img [src]="session.user()!.avatarUrl" alt="" style="width:44px;height:44px;border-radius:50%" /> }
          @else { <span class="ava" style="width:44px;height:44px">{{ session.user()?.name?.charAt(0) }}</span> }
          <div><b>{{ session.user()?.name }}</b><div class="small faint">Discord · {{ session.user()?.username }} · ID {{ session.user()?.id }}</div></div>
        </div>
        <span class="pill active">Connected</span>
      </div>
      <p class="help" style="margin-top:14px">You sign in only through Discord, so there is no password here to steal. Turn on two-factor authentication in Discord (User Settings → My Account) to protect your licence too.</p>
    </div>

    <div class="card rise" style="--d:180ms;margin-top:18px">
      <div class="spread">
        <h3 style="margin:0">Active sessions</h3>
        @if (sessions().length > 1) { <button class="btn btn-danger btn-sm" [disabled]="busy()" (click)="others()">Sign out of all other sessions</button> }
      </div>
      <div style="margin-top:8px">
        @for (s of sessions(); track s.id) {
          <div class="sess">
            <div class="ic"><app-icon [name]="mobile(s.device) ? 'phone' : 'monitor'" /></div>
            <div style="min-width:0">
              <b>{{ s.device }}</b> @if (s.current) { <span class="pill active" style="margin-left:6px">This device</span> }
              <div class="small faint">Signed in {{ fmt.dt(s.createdAt) }} · active {{ fmt.ago(s.lastSeenAt) }} · expires {{ fmt.date(s.expiresAt) }}</div>
            </div>
            @if (!s.current) { <button class="btn btn-ghost btn-xs" [disabled]="busy()" (click)="revoke(s)">Sign out</button> }
            @else { <button class="btn btn-ghost btn-xs" (click)="session.logout()">Sign out</button> }
          </div>
        } @empty {
          <p class="mut">Loading…</p>
        }
      </div>
    </div>

    <div class="card rise" style="--d:240ms;margin-top:18px">
      <h3 style="margin:0">Sign-in and security history</h3>
      <div class="timeline" style="margin-top:8px">
        @for (e of history(); track $index) {
          <div class="ev"><i [class]="e.kind"></i><span>{{ e.text }}</span><span class="small faint">{{ fmt.dt(e.at) }}</span></div>
        } @empty {
          <p class="mut" style="margin:10px 0 0">Nothing yet.</p>
        }
      </div>
      <p class="help" style="margin-top:12px">Something you don't recognise? Sign out of all other sessions, change your Discord password and contact support.</p>
    </div>
  `,
})
export class SecurityComponent {
  private store = inject(DashboardStore);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  session = inject(SessionService);
  fmt = fmt;
  sessions = signal<Session[]>([]);
  busy = signal(false);
  history = () => (this.store.account()?.activity ?? []).filter((e) => e.kind === 'login' || e.kind === 'security').slice(0, 15);

  constructor() {
    this.load();
  }

  load(): void {
    this.api.sessions().subscribe({ next: (s) => this.sessions.set(s), error: (e) => this.toast.show(apiError(e), false) });
  }

  mobile(device: string): boolean {
    return /iphone|ipad|android|mobile/i.test(device);
  }

  revoke(s: Session): void {
    this.busy.set(true);
    this.api.revokeSession(s.id).subscribe({
      next: () => { this.busy.set(false); this.toast.show(`${s.device} signed out.`); this.load(); this.store.load(); },
      error: (e) => { this.busy.set(false); this.toast.show(apiError(e), false); },
    });
  }

  others(): void {
    this.busy.set(true);
    this.api.revokeOtherSessions().subscribe({
      next: (r) => { this.busy.set(false); this.toast.show(`${r.ended} other session(s) signed out.`); this.load(); this.store.load(); },
      error: (e) => { this.busy.set(false); this.toast.show(apiError(e), false); },
    });
  }
}
