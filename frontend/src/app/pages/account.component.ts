import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, apiError } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { Account } from '../core/models';

const LOGIN_MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled on Discord.',
  expired: 'Your sign-in took too long. Please try again.',
  failed: 'Discord could not confirm your sign-in. Please try again.',
  blocked: 'This account is not allowed to sign in. Contact support if you think this is a mistake.',
};

@Component({
  selector: 'app-account',
  imports: [RouterLink],
  template: `
    <section class="wrap section" style="max-width:760px">
      @if (loginMsg) { <div class="errbox" style="margin-bottom:18px">{{ loginMsg }}</div> }

      @if (state() === 'signin') {
        <div class="card center" style="padding:40px 24px">
          <h1 style="font-size:28px;margin:0 0 8px">My account</h1>
          <p class="mut" style="margin:0 0 20px">Sign in with your Discord account to see your licences, get your key and follow your orders.</p>
          <button class="btn btn-discord" (click)="session.login('/account')">Continue with Discord</button>
          <p class="help" style="margin-top:14px">We only read your Discord name, avatar and id. No e-mail, no servers, no messages.</p>
        </div>
      } @else if (state() === 'loading') {
        <p class="mut center">Loading…</p>
      } @else if (state() === 'error') {
        <div class="errbox">Could not load your account. Please refresh.</div>
      } @else {
       @if (data(); as d) {
        <div class="spread" style="margin-bottom:22px">
          <div class="row">
            @if (session.user()?.avatarUrl) { <img [src]="session.user()!.avatarUrl" alt="" style="width:46px;height:46px;border-radius:50%" /> }
            <div>
              <h1 style="font-size:26px;margin:0">{{ session.user()?.name }}</h1>
              <div class="mut small">Signed in with Discord · {{ session.user()?.username }}</div>
            </div>
          </div>
          <a class="btn btn-primary btn-sm" routerLink="/pricing">{{ d.licences.length ? 'Extend my plan' : 'Get access' }}</a>
        </div>

        <h2 style="font-size:20px">Licence</h2>
        @for (l of d.licences; track l.id) {
          <div class="card" style="margin-bottom:14px">
            <div class="spread">
              <strong>{{ l.lifetime ? 'Lifetime' : l.planLabel }}</strong>
              <span class="pill" [class]="l.status">{{ l.status }}</span>
            </div>
            <div style="margin-top:10px">
              <div class="kv"><span class="mut">Expires</span><span>{{ l.lifetime ? 'Never' : date(l.expiresAt) }}</span></div>
              <div class="kv"><span class="mut">Computer</span><span>{{ l.activated ? 'Activated on one computer' : 'Not activated yet' }}</span></div>
              <div class="kv"><span class="mut">Key</span><span>{{ l.keySetAt ? 'Generated ' + date(l.keySetAt) : 'Not generated yet' }}</span></div>
            </div>

            @if (l.status !== 'revoked') {
              @if (keys()[l.id]; as k) {
                <div style="margin-top:14px">
                  <label>Your licence key — copy it now, it will not be shown again</label>
                  <div class="copy"><code>{{ k }}</code><button class="btn btn-ghost btn-sm" (click)="copy(k)">{{ copied() === k ? 'Copied' : 'Copy' }}</button></div>
                  <p class="help">Paste it into FXR Loader in MotiveWave. Lost it? Generate a new one here at any time.</p>
                </div>
              } @else if (confirmKey() === l.id) {
                <div class="notice" style="margin-top:14px">
                  A new key disconnects the current one from FXR Loader. Continue?
                  <div class="row" style="margin-top:10px">
                    <button class="btn btn-primary btn-xs" [disabled]="busy()" (click)="generate(l.id)">Yes, new key</button>
                    <button class="btn btn-ghost btn-xs" (click)="confirmKey.set('')">Cancel</button>
                  </div>
                </div>
              } @else {
                <div class="row" style="margin-top:14px">
                  @if (l.keySetAt) {
                    <button class="btn btn-ghost btn-sm" (click)="confirmKey.set(l.id)">Generate a new key</button>
                  } @else {
                    <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="generate(l.id)">Get my licence key</button>
                  }
                  @if (l.activated) {
                    @if (l.canMove) {
                      @if (confirmMove() === l.id) {
                        <span class="small mut">Release this computer?</span>
                        <button class="btn btn-primary btn-xs" [disabled]="busy()" (click)="move(l.id)">Yes</button>
                        <button class="btn btn-ghost btn-xs" (click)="confirmMove.set('')">No</button>
                      } @else {
                        <button class="btn btn-ghost btn-sm" (click)="confirmMove.set(l.id)">Move to another computer</button>
                      }
                    } @else {
                      <span class="small mut">Next move possible {{ date(l.nextMoveAt) }}</span>
                    }
                  }
                </div>
              }
            }
          </div>
        } @empty {
          <div class="card mut">No licence yet. <a routerLink="/pricing">Choose a plan</a> to get one.</div>
        }
        @if (error()) { <div class="errbox" style="margin-top:12px">{{ error() }}</div> }

        <h2 style="font-size:20px;margin-top:34px">Orders</h2>
        <div class="card tbl">
          <table>
            <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (o of d.orders; track o.id) {
                <tr>
                  <td>{{ date(o.createdAt) }}</td>
                  <td>{{ o.planLabel }}</td>
                  <td class="mono">{{ o.amount }} USDT</td>
                  <td><span class="pill" [class]="o.status">{{ label(o.status) }}</span></td>
                  <td style="text-align:right">
                    @if (o.status === 'pending' || o.status === 'submitted') { <a [routerLink]="['/checkout', o.id]">Open</a> }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="mut">No orders yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
       }
      }
    </section>
  `,
})
export class AccountComponent {
  private api = inject(ApiService);
  session = inject(SessionService);
  state = signal<'loading' | 'signin' | 'ready' | 'error'>('loading');
  data = signal<Account | null>(null);
  keys = signal<Record<string, string>>({});
  confirmKey = signal('');
  confirmMove = signal('');
  copied = signal('');
  busy = signal(false);
  error = signal('');
  loginMsg = LOGIN_MESSAGES[inject(ActivatedRoute).snapshot.queryParamMap.get('login') ?? ''] ?? '';

  constructor() {
    this.load();
  }

  load(): void {
    this.api.account().subscribe({
      next: (d) => { this.data.set(d); this.state.set('ready'); },
      error: (e: HttpErrorResponse) => this.state.set(e.status === 401 ? 'signin' : 'error'),
    });
  }

  generate(id: string): void {
    this.busy.set(true); this.error.set('');
    this.api.newKey(id).subscribe({
      next: (r) => { this.keys.update((k) => ({ ...k, [id]: r.key })); this.confirmKey.set(''); this.busy.set(false); this.load(); },
      error: (e) => { this.error.set(apiError(e)); this.busy.set(false); },
    });
  }

  move(id: string): void {
    this.busy.set(true); this.error.set('');
    this.api.moveComputer(id).subscribe({
      next: () => { this.confirmMove.set(''); this.busy.set(false); this.load(); },
      error: (e) => { this.error.set(apiError(e)); this.busy.set(false); this.confirmMove.set(''); },
    });
  }

  copy(text: string): void {
    void navigator.clipboard?.writeText(text).then(() => this.copied.set(text)).catch(() => undefined);
  }

  label(s: string): string {
    return s === 'pending' ? 'awaiting payment' : s === 'submitted' ? 'being checked' : s;
  }

  date(ms: number): string {
    return ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  }
}
