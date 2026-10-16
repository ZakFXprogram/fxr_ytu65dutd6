import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteService } from '../core/site.service';
import { SessionService } from '../core/session.service';
import { IconComponent } from '../core/icon.component';
import { RevealDirective, SpotDirective } from '../core/motion';

/** Installation happens on Discord: this page only points there. */
@Component({
  selector: 'app-install',
  imports: [RouterLink, IconComponent, RevealDirective, SpotDirective],
  template: `
    <section class="wrap section-tight" style="padding-top:64px">
      <span class="chip rise">Install</span>
      <h1 class="rise" style="--d:80ms;margin-top:16px">Installation happens <span class="grad">on Discord</span></h1>
      <p class="lead rise" style="--d:160ms">Once you have paid, your member role opens a private channel with the download link for FXR Loader and the step-by-step guide. Here is the whole path.</p>
      <div class="hero-cta rise" style="--d:240ms">
        @if (site.info()?.discord) {
          <a class="btn btn-discord" [href]="site.info()!.discord" target="_blank" rel="noopener noreferrer"><app-icon name="chat" /> Join the Discord</a>
        }
        <a class="btn btn-ghost" routerLink="/pricing">See pricing</a>
      </div>
    </section>

    <section class="wrap" style="padding-bottom:72px">
      <div class="steps">
        <div class="card step" fxrSpot fxrReveal>
          <h3>Join the Discord server</h3>
          <p>Use the same Discord account you will sign in with. Your member role is given on that account.</p>
        </div>
        <div class="card step" fxrSpot fxrReveal="100">
          <h3>Buy a plan here</h3>
          <p>Sign in with Discord, choose a plan and pay in USDT. Your licence activates as soon as the payment is confirmed.</p>
        </div>
        <div class="card step" fxrSpot fxrReveal="200">
          <h3>Open the install channel</h3>
          <p>Your role unlocks the private channel with the FXR Loader download link and the guide. Paste your key from the <a routerLink="/dashboard/licence">dashboard</a> and you are done.</p>
        </div>
      </div>
    </section>

    <section class="wrap" style="padding-bottom:88px">
      <div class="grid g2">
        <div class="card" fxrSpot fxrReveal>
          <h3>Before you start</h3>
          <ul class="checks">
            <li>MotiveWave on Windows or macOS</li>
            <li>Tick-by-tick data with bid/ask side (Rithmic recommended)</li>
            <li>Market-by-order data for Deep Trades</li>
            <li>An internet connection when MotiveWave starts, to check your licence</li>
          </ul>
        </div>
        <div class="card" fxrSpot fxrReveal="100">
          <h3>Already a member?</h3>
          <p class="mut">Your licence key, your computer and your Discord role are all on your dashboard.</p>
          @if (session.signedIn()) {
            <a class="btn btn-primary" routerLink="/dashboard">Open my dashboard</a>
          } @else {
            <button class="btn btn-discord" (click)="session.login('/dashboard')">Sign in with Discord</button>
          }
        </div>
      </div>
    </section>
  `,
})
export class InstallComponent {
  site = inject(SiteService);
  session = inject(SessionService);
}
