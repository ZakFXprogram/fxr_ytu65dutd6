import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DashboardStore } from './dashboard.store';
import { SessionService } from '../../core/session.service';
import { IconComponent } from '../../core/icon.component';

const LOGIN_MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled on Discord.',
  expired: 'Your sign-in took too long. Please try again.',
  failed: 'Discord could not confirm your sign-in. Please try again.',
  blocked: 'This account is not allowed to sign in. Contact support if you think this is a mistake.',
};

/** /dashboard — the member area: sidebar + the page picked in it. */
@Component({
  selector: 'app-dashboard',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    @if (store.state() === 'signin') {
      <section class="wrap section" style="max-width:620px">
        @if (loginMsg) { <div class="errbox" style="margin-bottom:18px">{{ loginMsg }}</div> }
        <div class="card center pop" style="padding:48px 28px">
          <div class="why-ico" style="margin:0 auto"><app-icon name="lock" /></div>
          <h1 style="font-size:28px;margin:18px 0 8px">Your dashboard</h1>
          <p class="mut">Sign in with Discord to see your plan, get your licence key, redeem a key and manage your sessions.</p>
          <button class="btn btn-discord" (click)="session.login('/dashboard')">Continue with Discord</button>
          <p class="help" style="margin-top:14px">We only read your Discord name, avatar and ID. No e-mail, no servers, no messages.</p>
        </div>
      </section>
    } @else if (store.state() === 'error') {
      <section class="wrap section"><div class="errbox">Your dashboard could not be loaded. Please refresh the page.</div></section>
    } @else {
      <div class="wrap dash">
        <aside class="side" aria-label="Dashboard">
          @if (session.user(); as u) {
            <div class="me">
              @if (u.avatarUrl) { <img [src]="u.avatarUrl" alt="" style="border-radius:50%" /> } @else { <span class="ava">{{ u.name.charAt(0) }}</span> }
              <div><b>{{ u.name }}</b><span class="small faint">{{ u.username }}</span></div>
            </div>
          }
          <a routerLink="/dashboard" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }"><app-icon name="home" /> Overview</a>
          <a routerLink="/dashboard/billing" routerLinkActive="on"><app-icon name="card" /> Billing</a>
          <a routerLink="/dashboard/licence" routerLinkActive="on"><app-icon name="key" /> Licence</a>
          <a routerLink="/dashboard/redeem" routerLinkActive="on"><app-icon name="gift" /> Redeem a key</a>
          <a routerLink="/dashboard/security" routerLinkActive="on"><app-icon name="shield" /> Security</a>
          <button (click)="session.logout()"><app-icon name="logout" /> Sign out</button>
        </aside>
        <div style="min-width:0">
          @if (store.state() === 'loading') { <p class="mut">Loading…</p> } @else { <router-outlet /> }
        </div>
      </div>
    }
  `,
})
export class DashboardComponent {
  store = inject(DashboardStore);
  session = inject(SessionService);
  loginMsg = LOGIN_MESSAGES[inject(ActivatedRoute).snapshot.queryParamMap.get('login') ?? ''] ?? '';

  constructor() {
    this.store.state.set('loading');
    this.store.load();
  }
}
