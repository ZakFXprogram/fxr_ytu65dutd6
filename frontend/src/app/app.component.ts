import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from './core/api.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="hdr">
      <div class="wrap hdr-in">
        <a class="hdr-logo" routerLink="/"><img src="/logo.png" alt="FXR" /> FXR OrderFlow</a>
        <nav class="nav">
          <a routerLink="/studies" routerLinkActive="active">Studies</a>
          <a routerLink="/pricing" routerLinkActive="active">Pricing</a>
          <a routerLink="/install" routerLinkActive="active">Install</a>
          <a routerLink="/faq" routerLinkActive="active">FAQ</a>
        </nav>
        <div class="hdr-cta">
          <a class="btn btn-ghost" routerLink="/licence">My licence</a>
          <a class="btn btn-primary" routerLink="/pricing">Get access</a>
        </div>
        <button class="burger" (click)="menu.set(!menu())" aria-label="Menu">☰</button>
      </div>
      <div class="mnav" [class.open]="menu()" (click)="menu.set(false)">
        <a routerLink="/studies">Studies</a>
        <a routerLink="/pricing">Pricing</a>
        <a routerLink="/install">Install</a>
        <a routerLink="/faq">FAQ</a>
        <a routerLink="/licence">My licence</a>
      </div>
    </header>

    <main><router-outlet /></main>

    <footer class="ftr">
      <div class="wrap ftr-in">
        <div style="max-width:320px">
          <div class="hdr-logo" style="margin-bottom:8px"><img src="/logo.png" alt="FXR" style="width:28px;height:28px" /> FXR OrderFlow</div>
          <div>Institutional-grade order flow studies for MotiveWave. Payments are verified on-chain; we never ask for your wallet's private key or seed phrase.</div>
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
            <a routerLink="/licence">My licence</a>
            @if (discord()) { <a [href]="discord()" target="_blank" rel="noopener">Discord</a> }
          </div>
          <div>
            <strong style="color:var(--mut)">Legal</strong>
            <a routerLink="/legal/terms">Terms</a>
            <a routerLink="/legal/privacy">Privacy</a>
            <a routerLink="/legal/refunds">Refunds</a>
          </div>
        </div>
      </div>
      <div class="wrap" style="margin-top:20px">© {{ year }} {{ company() }}. Not affiliated with MotiveWave.</div>
    </footer>
  `,
})
export class AppComponent {
  private api = inject(ApiService);
  menu = signal(false);
  year = new Date().getFullYear();
  private site = toSignal(this.api.site().pipe(catchError(() => of(null))), { initialValue: null });
  company = () => this.site()?.company ?? 'FXR Fluxora';
  discord = () => this.site()?.discord ?? '';
}
