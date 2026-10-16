import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStore, kindIcon } from './dashboard.store';
import { ApiService, fmt } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';
import { RevealDirective, SpotDirective } from '../../core/motion';

@Component({
  selector: 'app-dash-overview',
  imports: [RouterLink, RevealDirective, SpotDirective],
  template: `
    @if (store.account(); as a) {
      <h1 class="rise">Welcome back, {{ session.user()?.name }}</h1>
      <p class="mut rise" style="--d:60ms">Your plan, your licence and what happened on your account.</p>

      <div class="card bundle rise" style="--d:120ms;margin-top:18px">
        @if (store.licence(); as l) {
          <div class="row" style="gap:24px;align-items:center">
            <svg class="ring" viewBox="0 0 96 96" aria-hidden="true">
              <defs><linearGradient id="ringGrad" x1="0" x2="1"><stop offset="0" stop-color="#7c3aed" /><stop offset="1" stop-color="#22d3ee" /></linearGradient></defs>
              <circle class="bg" cx="48" cy="48" r="40" />
              <circle class="fg" cx="48" cy="48" r="40" [attr.stroke-dasharray]="circ" [attr.stroke-dashoffset]="offset()" />
              <text x="48" y="50" text-anchor="middle">{{ store.daysLeft() === Infinity ? '∞' : store.daysLeft() }}</text>
              <text class="lbl" x="48" y="66" text-anchor="middle">{{ store.daysLeft() === Infinity ? 'LIFETIME' : 'DAYS LEFT' }}</text>
            </svg>
            <div style="flex:1;min-width:220px">
              <div class="row"><h2 style="font-size:22px;margin:0">FXR Bundle · {{ l.lifetime ? 'Lifetime' : l.planLabel }}</h2><span class="pill" [class]="l.status">{{ l.status }}</span></div>
              <p class="mut" style="margin:6px 0 0">
                @if (l.status === 'active') { {{ l.lifetime ? 'Access without end date.' : 'Active until ' + fmt.date(l.expiresAt) + '. Plans do not renew on their own.' }} }
                @else if (l.status === 'expired') { Your access ended on {{ fmt.date(l.expiresAt) }}. Buy any plan to turn it back on. }
                @else { This licence was revoked. Contact support if you think this is a mistake. }
              </p>
            </div>
            <div class="row">
              @if (!l.lifetime) { <a class="btn btn-primary btn-sm" routerLink="/pricing">{{ l.status === 'active' ? 'Extend' : 'Renew' }}</a> }
              <a class="btn btn-ghost btn-sm" routerLink="/dashboard/licence">Licence key</a>
            </div>
          </div>
        } @else {
          <div class="spread">
            <div>
              <h2 style="font-size:22px;margin:0 0 6px">No active plan yet</h2>
              <p class="mut" style="margin:0">Get the bundle, or redeem a key if you received one.</p>
            </div>
            <div class="row">
              <a class="btn btn-primary btn-sm" routerLink="/pricing">See pricing</a>
              <a class="btn btn-ghost btn-sm" routerLink="/dashboard/redeem">Redeem a key</a>
            </div>
          </div>
        }
      </div>

      <div class="tiles" style="margin-top:14px">
        <div class="card tile" fxrSpot fxrReveal>
          <div class="k">Licence key</div>
          <div class="v">{{ store.licence()?.keySetAt ? 'Generated' : 'Not yet' }}</div>
          <a class="small" routerLink="/dashboard/licence">{{ store.licence()?.keySetAt ? 'Replace it' : 'Get it' }} →</a>
        </div>
        <div class="card tile" fxrSpot fxrReveal="80">
          <div class="k">Computer</div>
          <div class="v">{{ store.licence()?.activated ? 'Activated' : 'Not activated' }}</div>
          <span class="small faint">One computer at a time</span>
        </div>
        <div class="card tile" fxrSpot fxrReveal="160">
          <div class="k">Discord role</div>
          <div class="v">{{ roleLabel() }}</div>
          @if (a.discord.roleSync && store.active() && !a.discord.roleGranted) {
            <button class="linkish small" [disabled]="checking()" (click)="checkRole()">{{ checking() ? 'Checking…' : 'Check my role' }} →</button>
          } @else { <span class="small faint">Opens the install channel</span> }
        </div>
      </div>

      @if (a.discord.roleSync && store.active() && a.discord.inServer === false) {
        <div class="notice" style="margin-top:14px">
          Join our Discord server with this account to receive your member role and the install channel.
          @if (a.discord.invite) { <a [href]="a.discord.invite" target="_blank" rel="noopener noreferrer">Join the server</a> }
        </div>
      }

      <div class="card" style="margin-top:22px" fxrReveal>
        <div class="spread"><h3 style="margin:0">Recent activity</h3><span class="small faint">Only you can see this</span></div>
        <div class="timeline" style="margin-top:8px">
          @for (e of a.activity.slice(0, 12); track $index) {
            <div class="ev"><i [class]="e.kind"></i><span>{{ e.text }}</span><span class="small faint">{{ fmt.ago(e.at) }}</span></div>
          } @empty {
            <p class="mut" style="margin:10px 0 0">Nothing yet.</p>
          }
        </div>
      </div>
    }
  `,
})
export class OverviewComponent {
  store = inject(DashboardStore);
  session = inject(SessionService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  fmt = fmt;
  Infinity = Infinity;
  icon = kindIcon;
  circ = 2 * Math.PI * 40;
  checking = signal(false);
  private shown = signal(false);
  offset = computed(() => {
    const d = this.store.daysLeft();
    const l = this.store.licence();
    if (!this.shown()) return this.circ;
    if (d === Infinity) return 0;
    const span = l && !l.lifetime ? ({ month1: 30, month3: 90, month6: 180, year1: 365 } as Record<string, number>)[l.plan] ?? 30 : 30;
    return this.circ * (1 - Math.min(1, d / span));
  });
  roleLabel = computed(() => {
    const a = this.store.account();
    if (!a?.discord.roleSync) return 'Managed on Discord';
    if (a.discord.roleGranted) return 'Granted';
    if (!this.store.active()) return 'Needs a plan';
    return a.discord.inServer === false ? 'Join the server' : 'Pending';
  });

  constructor() {
    setTimeout(() => this.shown.set(true), 150); // let the ring draw itself
  }

  checkRole(): void {
    this.checking.set(true);
    this.api.syncRole().subscribe({
      next: (r) => {
        this.checking.set(false);
        const msg: Record<string, [string, boolean]> = {
          granted: ['Your Discord role was added.', true],
          unchanged: ['Your role is up to date.', true],
          not_in_server: ['Join our Discord server first, then check again.', false],
          error: ['Discord did not answer. Try again in a minute.', false],
        };
        const [t, ok] = msg[r.result] ?? ['Done.', true];
        this.toast.show(t, ok);
        this.store.load();
      },
      error: () => { this.checking.set(false); this.toast.show('Please wait a moment before checking again.', false); },
    });
  }
}
