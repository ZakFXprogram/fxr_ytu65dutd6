import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { LicenceStatus } from '../core/models';

@Component({
  selector: 'app-licence',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="wrap section" style="max-width:560px">
      <div class="center" style="margin-bottom:22px">
        <span class="chip">Account</span>
        <h1 style="font-size:34px;margin:14px 0 8px">My licence</h1>
        <p class="mut">Check your plan, expiry and activation status.</p>
      </div>

      <div class="card">
        <label for="key">Licence key</label>
        <input id="key" [(ngModel)]="key" placeholder="FXR-XXXX-XXXX-XXXX-XXXX" (keydown.enter)="check()" autocomplete="off" />
        <button class="btn btn-primary" style="width:100%;margin-top:14px" [disabled]="loading()" (click)="check()">
          {{ loading() ? 'Checking…' : 'Check my licence' }}
        </button>
        @if (error()) { <p class="err" style="margin:12px 0 0">{{ error() }}</p> }

        @if (result(); as r) {
          @if (r.found) {
            <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:16px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span>Status</span>
                <span class="pill" [class]="r.status">{{ r.status }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:10px"><span>Plan</span><span>{{ r.plan }}</span></div>
              <div style="display:flex;justify-content:space-between;margin-top:10px"><span>Expires</span><span>{{ r.lifetime ? 'Never (lifetime)' : fmt(r.expiresAt) }}</span></div>
              <div style="display:flex;justify-content:space-between;margin-top:10px"><span>Computer</span><span>{{ r.activated ? 'Activated' : 'Not activated yet' }}</span></div>
            </div>
          } @else {
            <p class="mut" style="margin-top:16px">No licence matches that key. Check for typos, or <a routerLink="/pricing">get access</a>.</p>
          }
        }
      </div>
      <p class="help center" style="margin-top:14px">Need to move your licence to another computer? Contact support to reset the activation.</p>
    </section>
  `,
})
export class LicenceComponent {
  private api = inject(ApiService);
  key = '';
  loading = signal(false);
  error = signal('');
  result = signal<LicenceStatus | null>(null);

  check(): void {
    const k = this.key.trim();
    if (!k) { this.error.set('Enter your licence key.'); return; }
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    this.api.licenceStatus(k).subscribe({
      next: (r) => { this.result.set(r); this.loading.set(false); },
      error: () => { this.error.set('Something went wrong. Please try again.'); this.loading.set(false); },
    });
  }

  fmt(ms?: number): string {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
