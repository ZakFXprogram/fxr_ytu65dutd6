import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DashboardStore } from './dashboard.store';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { IconComponent } from '../../core/icon.component';

/** Redeem an activation key (giveaway, partner, gift): its time goes onto this Discord account. */
@Component({
  selector: 'app-dash-redeem',
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <h1 class="rise">Redeem a key</h1>
    <p class="mut rise" style="--d:60ms">Received an activation key? Enter it here: its time is added to your licence and your Discord role follows.</p>

    <div class="card bundle rise" style="--d:120ms;margin-top:18px;max-width:640px" [class.shake]="shake()">
      <label for="redeem-code">Activation key</label>
      <input id="redeem-code" class="redeem-code" [ngModel]="code()" (ngModelChange)="format($event)" placeholder="RDM-XXXX-XXXX-XXXX-XXXX"
             autocomplete="off" spellcheck="false" maxlength="23" (keydown.enter)="submit()" />
      <button class="btn btn-primary btn-block" style="margin-top:14px" [disabled]="busy() || code().length < 23" (click)="submit()">
        <app-icon name="gift" /> {{ busy() ? 'Checking…' : 'Redeem' }}
      </button>
      @if (error()) { <p class="err small" style="margin:12px 0 0">{{ error() }}</p> }
    </div>

    @if (done(); as d) {
      <div class="card pop" style="margin-top:18px;max-width:640px;border-color:rgba(74,222,128,.4)">
        <svg class="success" viewBox="0 0 52 52" aria-hidden="true" style="width:56px;height:56px;margin:0"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
        <h3 style="margin:12px 0 6px">{{ d.days ? '+' + d.days + ' days added' : 'Lifetime access unlocked' }}</h3>
        <p class="mut" style="margin:0">{{ d.expiresAt ? 'Your licence is active until ' + fmt.date(d.expiresAt) + '.' : 'Your licence no longer expires.' }} Your Discord role is being added.</p>
        <div class="row" style="margin-top:14px">
          <a class="btn btn-primary btn-sm" routerLink="/dashboard/licence">Get my licence key</a>
          <a class="btn btn-ghost btn-sm" routerLink="/dashboard">Back to overview</a>
        </div>
      </div>
    }

    <p class="help" style="margin-top:18px;max-width:640px">A key works once and is tied to the first account that redeems it. Never buy keys from people you don't know: only keys from FXR or its official partners are valid.</p>
  `,
})
export class RedeemComponent {
  private store = inject(DashboardStore);
  private api = inject(ApiService);
  fmt = fmt;
  code = signal('');
  busy = signal(false);
  error = signal('');
  shake = signal(false);
  done = signal<{ plan: string; days: number; expiresAt: number } | null>(null);

  /** Keeps the input as RDM-XXXX-XXXX-XXXX-XXXX while typing or pasting. */
  format(v: string): void {
    let s = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.startsWith('RDM')) s = s.slice(3);
    s = s.slice(0, 16);
    const groups = s.match(/.{1,4}/g) ?? [];
    this.code.set(groups.length ? 'RDM-' + groups.join('-') : v.toUpperCase().startsWith('R') ? v.toUpperCase().slice(0, 4) : '');
  }

  submit(): void {
    if (this.code().length < 23 || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.redeem(this.code()).subscribe({
      next: (r) => { this.busy.set(false); this.done.set(r); this.code.set(''); this.store.load(); },
      error: (e) => {
        this.busy.set(false);
        this.error.set(apiError(e, 'This key could not be redeemed.'));
        this.shake.set(false);
        setTimeout(() => this.shake.set(true));
      },
    });
  }
}
