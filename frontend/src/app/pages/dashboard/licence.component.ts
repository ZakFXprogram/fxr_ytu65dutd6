import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStore } from './dashboard.store';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../core/icon.component';

@Component({
  selector: 'app-dash-licence',
  imports: [RouterLink, IconComponent],
  template: `
    @if (store.account(); as a) {
      <h1 class="rise">Licence</h1>
      <p class="mut rise" style="--d:60ms">Your key for FXR Loader and the computer it runs on.</p>

      @for (l of a.licences; track l.id) {
        <div class="card rise" style="--d:120ms;margin-top:18px">
          <div class="spread">
            <h3 style="margin:0">FXR Bundle · {{ l.lifetime ? 'Lifetime' : l.planLabel }}</h3>
            <span class="pill" [class]="l.status">{{ l.status }}</span>
          </div>
          <div style="margin-top:12px">
            <div class="kv"><span class="mut">Expires</span><span>{{ l.lifetime ? 'Never' : fmt.date(l.expiresAt) }}</span></div>
            <div class="kv"><span class="mut">Computer</span><span>{{ l.activated ? 'Activated on one computer' : 'Not activated yet' }}</span></div>
            <div class="kv"><span class="mut">Key</span><span>{{ l.keySetAt ? 'Generated ' + fmt.date(l.keySetAt) : 'Not generated yet' }}</span></div>
          </div>

          @if (l.status !== 'revoked') {
            @if (keys()[l.id]; as k) {
              <div class="pop" style="margin-top:16px">
                <label>Your licence key — copy it now, it is shown only once</label>
                <div class="copy"><code>{{ k }}</code><button class="btn btn-ghost btn-sm" (click)="copy(k)"><app-icon name="copy" /> {{ copied() === k ? 'Copied' : 'Copy' }}</button></div>
                <p class="help">Paste it into FXR Loader in MotiveWave. Lost it? Generate a new one here at any time.</p>
              </div>
            } @else if (confirmKey() === l.id) {
              <div class="notice pop" style="margin-top:16px">
                A new key disconnects the current one from FXR Loader. Continue?
                <div class="row" style="margin-top:10px">
                  <button class="btn btn-primary btn-xs" [disabled]="busy()" (click)="generate(l.id)">Yes, new key</button>
                  <button class="btn btn-ghost btn-xs" (click)="confirmKey.set('')">Cancel</button>
                </div>
              </div>
            } @else {
              <div class="row" style="margin-top:16px">
                @if (l.keySetAt) {
                  <button class="btn btn-ghost btn-sm" (click)="confirmKey.set(l.id)"><app-icon name="refresh" /> Generate a new key</button>
                } @else {
                  <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="generate(l.id)"><app-icon name="key" /> Get my licence key</button>
                }
                @if (l.activated) {
                  @if (l.canMove) {
                    @if (confirmMove() === l.id) {
                      <span class="small mut">Release this computer?</span>
                      <button class="btn btn-primary btn-xs" [disabled]="busy()" (click)="move(l.id)">Yes</button>
                      <button class="btn btn-ghost btn-xs" (click)="confirmMove.set('')">No</button>
                    } @else {
                      <button class="btn btn-ghost btn-sm" (click)="confirmMove.set(l.id)"><app-icon name="monitor" /> Move to another computer</button>
                    }
                  } @else {
                    <span class="small mut">Next move possible {{ fmt.date(l.nextMoveAt) }}</span>
                  }
                }
              </div>
            }
          }
        </div>
      } @empty {
        <div class="card mut" style="margin-top:18px">No licence yet. <a routerLink="/pricing">Choose a plan</a> or <a routerLink="/dashboard/redeem">redeem a key</a>.</div>
      }

      <div class="card" style="margin-top:18px">
        <h3>Where do I paste the key?</h3>
        <p class="mut" style="margin:0">Install FXR Loader from the members' channel on Discord, open MotiveWave and add any FXR study: the loader asks for your key once. The key is tied to one computer; use "Move to another computer" when you change PC (once every 7 days).</p>
      </div>
    }
  `,
})
export class LicenceComponent {
  store = inject(DashboardStore);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  fmt = fmt;
  keys = signal<Record<string, string>>({});
  confirmKey = signal('');
  confirmMove = signal('');
  copied = signal('');
  busy = signal(false);

  generate(id: string): void {
    this.busy.set(true);
    this.api.newKey(id).subscribe({
      next: (r) => { this.keys.update((k) => ({ ...k, [id]: r.key })); this.confirmKey.set(''); this.busy.set(false); this.store.load(); },
      error: (e) => { this.toast.show(apiError(e), false); this.busy.set(false); },
    });
  }

  move(id: string): void {
    this.busy.set(true);
    this.api.moveComputer(id).subscribe({
      next: () => { this.confirmMove.set(''); this.busy.set(false); this.toast.show('Computer released. Activate the key on your new computer.'); this.store.load(); },
      error: (e) => { this.toast.show(apiError(e), false); this.busy.set(false); this.confirmMove.set(''); },
    });
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => this.copied.set(text)).catch(() => this.toast.show('Select the key and copy it manually.', false));
  }
}
