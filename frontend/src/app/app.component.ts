import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './core/api.service';
import { SessionService } from './core/session.service';
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
        <a class="hdr-logo" routerLink="/"><img src="logo.png" alt="FXR" /> FXR OrderFlow</a>
        <nav class="nav">
          <a routerLink="/studies" routerLinkActive="active">Studies</a>
          <a routerLink="/pricing" routerLinkActive="active">Pricing</a>
          <a routerLink="/install" routerLinkActive="active">Install</a>
          <a routerLink="/faq" routerLinkActive="active">FAQ</a>
        </nav>
        <div class="hdr-cta">
          @if (session.user(); as u) {
            <a class="who" routerLink="/account" title="My account">
              @if (u.avatarUrl) { <img [src]="u.avatarUrl" alt="" /> } @else { <span class="ava">{{ u.name.charAt(0) }}</span> }
              <span>{{ u.name }}</span>
            </a>
            <button class="btn btn-ghost btn-sm" (click)="session.logout()">Sign out</button>
          } @else if (session.me()) {
            <button class="btn btn-discord btn-sm" (click)="session.login()">Continue with Discord</button>
            <a class="btn btn-primary btn-sm" routerLink="/pricing">Get access</a>
          }
        </div>
        <button class="burger" (click)="menu.set(!menu())" aria-label="Menu">☰</button>
      </div>
      <div class="mnav" [class.open]="menu()" (click)="menu.set(false)">
        <a routerLink="/studies">Studies</a>
        <a routerLink="/pricing">Pricing</a>
        <a routerLink="/install">Install</a>
        <a routerLink="/faq">FAQ</a>
        @if (session.signedIn()) {
          <a routerLink="/account">My account</a>
          <a (click)="session.logout()" style="cursor:pointer">Sign out</a>
        } @else {
          <a (click)="session.login()" style="cursor:pointer">Continue with Discord</a>
        }
      </div>
    </header>

    <main><router-outlet /></main>

    <footer class="ftr">
      <div class="wrap ftr-in">
        <div style="max-width:320px">
          <div class="hdr-logo" style="margin-bottom:8px"><img src="logo.png" alt="FXR" style="width:28px;height:28px" /> FXR OrderFlow</div>
          <div>Institutional-grade order flow studies for MotiveWave. We never ask for your wallet's private key or seed phrase, and we never send payment addresses by DM.</div>
        </div>
        <div class="ftr-cols">
          <div>
            <strong style="color:var(--mut)">Product</strong>
            <a routerLink="/studies">Studies</a>
            <a routerLink="/pricing">Pricing</a>
            <a routerLink="/install">Install guide</a>
          </div>
          <div>
            <strong style="color:var(--mut)">Support</strong>
            <a routerLink="/faq">FAQ</a>
            <a routerLink="/account">My account</a>
            @if (discord()) { <a [href]="discord()" target="_blank" rel="noopener noreferrer">Discord</a> }
          </div>
          <div>
            <strong style="color:var(--mut)">Legal</strong>
            <a routerLink="/legal/terms">Terms</a>
            <a routerLink="/legal/privacy">Privacy</a>
            <a routerLink="/legal/refunds">Refunds</a>
          </div>
        </div>
      </div>
      <div class="wrap" style="margin-top:20px">© {{ year }} {{ company() }}. Not affiliated with MotiveWave or Discord.</div>
    </footer>
  `,
})
export class AppComponent {
  private api = inject(ApiService);
  session = inject(SessionService);
  private router = inject(Router);
  demo = demoApi;
  menu = signal(false);
  year = new Date().getFullYear();
  private site = toSignal(this.api.site().pipe(catchError(() => of(null))), { initialValue: null });
  company = () => this.site()?.company ?? 'FXR Fluxora';
  discord = () => this.site()?.discord ?? '';

  /** Preview build only: switch between the member's and the owner's view. */
  viewAs(p: 'member' | 'owner'): void {
    if (!this.demo) return;
    this.demo.setPersona(p);
    this.session.refresh();
    void this.router.navigateByUrl(p === 'owner' ? '/' + this.demo.panelPath : '/account');
  }
}
