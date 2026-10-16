import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { IconComponent } from '../../core/icon.component';
import { PanelOverviewComponent } from './panel-overview.component';
import { PanelOrdersComponent } from './panel-orders.component';
import { PanelPaymentsComponent } from './panel-payments.component';
import { PanelMembersComponent } from './panel-members.component';
import { PanelLicencesComponent } from './panel-licences.component';
import { PanelKeysComponent } from './panel-keys.component';
import { PanelActivityComponent } from './panel-activity.component';
import { MemberDrawerComponent } from './member-drawer.component';

type View = 'overview' | 'orders' | 'payments' | 'members' | 'licences' | 'keys' | 'activity';
const VIEWS: { id: View; label: string; icon: string; title: string; sub: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'chart', title: 'Overview', sub: 'Revenue, licences and what needs you.' },
  { id: 'orders', label: 'Orders', icon: 'receipt', title: 'Orders', sub: 'Every checkout, searchable. Paid orders confirm themselves.' },
  { id: 'payments', label: 'Payments received', icon: 'wallet', title: 'Payments received', sub: 'Every USDT transfer that reached your address. Assign the ones that found no order.' },
  { id: 'members', label: 'Members', icon: 'users', title: 'Members', sub: 'Everyone who signed in with Discord.' },
  { id: 'licences', label: 'Licences', icon: 'key', title: 'Licences', sub: 'Extend or revoke many at once.' },
  { id: 'keys', label: 'Redeem keys', icon: 'ticket', title: 'Redeem keys', sub: 'Activation keys for giveaways and partners.' },
  { id: 'activity', label: 'Activity log', icon: 'activity', title: 'Activity log', sub: 'Everything that happened, newest first.' },
];

/**
 * The owner's panel, served only at the secret path. Anyone who is not an owner sees the normal 404 page.
 * The owner signs in with Discord from the site header (Discord 2FA must be on), then opens the secret URL.
 */
@Component({
  selector: 'app-panel',
  imports: [RouterLink, IconComponent, PanelOverviewComponent, PanelOrdersComponent, PanelPaymentsComponent, PanelMembersComponent, PanelLicencesComponent, PanelKeysComponent, PanelActivityComponent, MemberDrawerComponent],
  template: `
    @if (mode() === 'hidden') {
      <section class="wrap section center" style="padding:90px 16px">
        <h1 style="font-size:64px;margin:0" class="grad">404</h1>
        <p class="mut">This page doesn't exist.</p>
        <a class="btn btn-ghost" routerLink="/">Back home</a>
      </section>
    } @else if (mode() === 'mfa') {
      <section class="wrap section" style="max-width:560px">
        <div class="errbox"><strong>Two-factor authentication required.</strong><br />
          Turn on 2FA on your Discord account (User Settings → My Account → Enable Authenticator App), then sign out and sign in again.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px" (click)="session.logout()">Sign out</button>
      </section>
    } @else if (mode() === 'ready') {
      <div class="pnl">
        <aside class="pnl-side">
          <nav class="side" aria-label="Panel">
            @for (v of views; track v.id) {
              <a [routerLink]="[]" [queryParams]="{ view: v.id === 'overview' ? null : v.id }" [class.on]="view() === v.id" (click)="show(v.id)">
                <app-icon [name]="v.icon" /> {{ v.label }}
                @if (v.id === 'orders' && attention() - unmatched() > 0) { <span class="badge">{{ attention() - unmatched() }}</span> }
                @if (v.id === 'payments' && unmatched()) { <span class="badge">{{ unmatched() }}</span> }
              </a>
            }
            <button (click)="session.logout()"><app-icon name="logout" /> Sign out</button>
          </nav>
        </aside>
        <section class="pnl-main">
          <div class="spread">
            <div><h1>{{ current().title }}</h1><p class="mut small" style="margin:4px 0 0">{{ current().sub }}</p></div>
            <span class="small faint">Signed in as {{ session.user()?.name }}</span>
          </div>
          @switch (view()) {
            @case ('overview') { <app-panel-overview style="display:block;margin-top:18px" (go)="show($any($event.view), $event.status)" /> }
            @case ('orders') { <app-panel-orders [initialStatus]="status()" (member)="memberId.set($event)" (changed)="loadBadge()" /> }
            @case ('payments') { <app-panel-payments (changed)="loadBadge()" /> }
            @case ('members') { <app-panel-members (member)="memberId.set($event)" /> }
            @case ('licences') { <app-panel-licences (member)="memberId.set($event)" /> }
            @case ('keys') { <app-panel-keys /> }
            @case ('activity') { <app-panel-activity (member)="memberId.set($event)" /> }
          }
        </section>
      </div>
      @if (memberId(); as id) {
        <app-member-drawer [memberId]="id" (closed)="memberId.set(null)" (changed)="loadBadge()" />
      }
    } @else {
      <p class="mut center section">…</p>
    }
  `,
})
export class PanelComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  session = inject(SessionService);
  views = VIEWS;
  mode = signal<'loading' | 'hidden' | 'mfa' | 'ready'>('loading');
  view = signal<View>((VIEWS.find((v) => v.id === this.route.snapshot.queryParamMap.get('view'))?.id ?? 'overview') as View);
  status = signal('');
  attention = signal(0);
  unmatched = signal(0);
  memberId = signal<string | null>(null);
  current = () => VIEWS.find((v) => v.id === this.view())!;

  constructor() {
    this.api.me().subscribe({
      next: (m) => {
        if (m.admin) { this.mode.set('ready'); this.loadBadge(); }
        else this.mode.set(m.authenticated && m.adminMfaRequired ? 'mfa' : 'hidden');
      },
      error: () => this.mode.set('hidden'),
    });
  }

  show(v: View, status = ''): void {
    this.status.set(status);
    if (this.view() === v && !status) return;
    this.view.set(v);
    void this.router.navigate([], { queryParams: { view: v === 'overview' ? null : v }, replaceUrl: true });
  }

  loadBadge(): void {
    this.api.overview(new Date().getTimezoneOffset()).subscribe({ next: (o) => { this.attention.set(o.stats.attention); this.unmatched.set(o.stats.unmatched ?? 0); }, error: () => undefined });
  }
}
