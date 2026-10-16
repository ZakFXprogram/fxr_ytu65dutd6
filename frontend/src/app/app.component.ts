import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { SessionService } from './core/session.service';
import { SiteService } from './core/site.service';
import { ToastService } from './core/toast.service';
import { reducedMotion } from './core/motion';
import { PANEL_PATH } from './core/panel';
import { demoApi } from './core/demo/demo-setup';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (demo) {
      <div class="demo-bar">
        <div class="wrap spread">
          <span><strong>Preview</strong> — sign-in and payments are simulated. Nothing here is real or sent anywhere.</span>
          <span class="row" style="gap:6px">
            <span class="small">View as</span>
            <button class="btn btn-xs" [class.btn-primary]="!session.me()?.admin" [class.btn-ghost]="session.me()?.admin" (click)="viewAs('member')">Member</button>
            <button class="btn btn-xs" [class.btn-primary]="session.me()?.admin" [class.btn-ghost]="!session.me()?.admin" (click)="viewAs('owner')">Owner</button>
          </span>
        </div>
      </div>
    }
    <header class="hdr">
      <div class="wrap hdr-in">
        <a class="hdr-logo" routerLink="/"><img src="logo.png" alt="" /> FXR OrderFlow</a>
        <nav class="nav" aria-label="Main">
          <a routerLink="/studies" routerLinkActive="active">Studies</a>
          <a routerLink="/pricing" routerLinkActive="active">Pricing</a>
          <a routerLink="/install" routerLinkActive="active">Install</a>
          <a routerLink="/faq" routerLinkActive="active">FAQ</a>
        </nav>
        <div class="hdr-cta">
          @if (session.user(); as u) {
            <a class="who" routerLink="/dashboard" title="My dashboard">
              @if (u.avatarUrl) { <img [src]="u.avatarUrl" alt="" /> } @else { <span class="ava">{{ u.name.charAt(0) }}</span> }
              <span>Dashboard</span>
            </a>
          } @else if (session.me()) {
            <button class="btn btn-ghost btn-sm" (click)="session.login()">Sign in</button>
            <a class="btn btn-primary btn-sm" routerLink="/pricing">Get access</a>
          }
        </div>
        <button class="burger" (click)="menu.set(!menu())" [attr.aria-expanded]="menu()" aria-label="Menu">☰</button>
      </div>
      <div class="mnav" [class.open]="menu()" (click)="menu.set(false)">
        <a routerLink="/studies">Studies</a>
        <a routerLink="/pricing">Pricing</a>
        <a routerLink="/install">Install</a>
        <a routerLink="/faq">FAQ</a>
        @if (session.signedIn()) {
          <a routerLink="/dashboard">My dashboard</a>
          <button (click)="session.logout()">Sign out</button>
        } @else {
          <button (click)="session.login()">Sign in with Discord</button>
        }
      </div>
    </header>

    <main><router-outlet /></main>

    @if (!inPanel()) {
      <footer class="ftr">
        <div class="wrap">
          <div class="ftr-top">
            <div>
              <div class="hdr-logo"><img src="logo.png" alt="" style="width:30px;height:30px" /> FXR OrderFlow</div>
              <p style="margin:12px 0 0;max-width:36ch">Order flow studies for MotiveWave, built on every tick and on market-by-order data.</p>
              <div class="status">
                <i class="dot" [style.background]="up() === false ? 'var(--warn)' : 'var(--ok)'"></i>
                {{ up() === false ? 'Service check failed — retrying' : 'All systems operational' }}
              </div>
            </div>
            <div class="ftr-cols">
              <div>
                <strong>Product</strong>
                <a routerLink="/studies">Studies</a>
                <a routerLink="/pricing">Pricing</a>
                <a routerLink="/install">Install</a>
                <a routerLink="/faq">FAQ</a>
              </div>
              <div>
                <strong>Account</strong>
                <a routerLink="/dashboard">Dashboard</a>
                <a routerLink="/dashboard/licence">Licence key</a>
                <a routerLink="/dashboard/redeem">Redeem a key</a>
                <a routerLink="/dashboard/security">Security</a>
              </div>
              <div>
                <strong>Community</strong>
                @if (site.info()?.discord) { <a [href]="site.info()!.discord" target="_blank" rel="noopener noreferrer">Discord</a> }
                <a routerLink="/install">Install guide</a>
                @if (site.info()?.support) { <span style="user-select:all">{{ site.info()!.support }}</span> }
              </div>
              <div>
                <strong>Legal</strong>
                <a routerLink="/legal/terms">Terms of Service</a>
                <a routerLink="/legal/risk">Risk disclosure</a>
                <a routerLink="/legal/privacy">Privacy</a>
                <a routerLink="/legal/refunds">Refunds</a>
              </div>
            </div>
          </div>

          <div class="disclaimer">
            <p><strong>Risk disclosure.</strong> Trading futures, forex, options, CFDs and crypto-assets involves a substantial risk of loss and is not suitable for every investor; you can lose more than your initial deposit. FXR OrderFlow studies are analysis software provided for educational and informational purposes only. Nothing on this website, in the software, on our Discord or in any communication from {{ company() }} is investment advice, a recommendation, or an offer or solicitation to buy or sell any financial instrument. We are not a registered investment adviser or broker. Past performance and examples, including screenshots made on simulated data, do not guarantee future results. You alone are responsible for your trading decisions.</p>
            <p><strong>Payments.</strong> We never ask for your wallet's private key or seed phrase, and we never send payment addresses or links by direct message. Only pay through the checkout opened from this website.</p>
          </div>
          <div class="ftr-base">
            <span>© {{ year }} {{ company() }}. All rights reserved.</span>
            <span>Not affiliated with MotiveWave, Rithmic, Discord or NOWPayments.</span>
          </div>
        </div>
      </footer>
    }

    @if (toast.current(); as t) {
      <div class="toast" [class.ok]="t.ok" [class.bad]="!t.ok" role="status">{{ t.text }}</div>
    }
  `,
})
export class AppComponent {
  session = inject(SessionService);
  site = inject(SiteService);
  toast = inject(ToastService);
  private router = inject(Router);
  demo = demoApi;
  menu = signal(false);
  up = signal<boolean | null>(null);
  inPanel = signal(false);
  year = new Date().getFullYear();
  company = () => this.site.info()?.company ?? 'FXR Fluxora';

  constructor() {
    if (!reducedMotion()) document.documentElement.classList.add('motion');
    inject(HttpClient).get('/api/health').subscribe({ next: () => this.up.set(true), error: () => this.up.set(false) });
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0];
      this.inPanel.set(!!PANEL_PATH && path === '/' + PANEL_PATH);
      this.menu.set(false);
    });
  }

  /** Preview build only: switch between the member's and the owner's view. */
  viewAs(p: 'member' | 'owner'): void {
    if (!this.demo) return;
    this.demo.setPersona(p);
    this.session.refresh();
    void this.router.navigateByUrl(p === 'owner' ? '/' + this.demo.panelPath : '/dashboard');
  }
}
