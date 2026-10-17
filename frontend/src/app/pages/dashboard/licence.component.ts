import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStore } from './dashboard.store';
import { fmt } from '../../core/api.service';

@Component({
  selector: 'app-dash-licence',
  imports: [RouterLink],
  template: `
    @if (store.account(); as a) {
      <h1 class="rise">Licence</h1>
      <p class="mut rise" style="--d:60ms">Your FXR licence. The studies unlock through your Discord account — there is no key to type into MotiveWave.</p>

      @for (l of a.licences; track l.id) {
        <div class="card rise" style="--d:120ms;margin-top:18px">
          <div class="spread">
            <h3 style="margin:0">FXR Bundle · {{ l.lifetime ? 'Lifetime' : l.planLabel }}</h3>
            <span class="pill" [class]="l.status">{{ l.status }}</span>
          </div>
          <div style="margin-top:12px">
            <div class="kv"><span class="mut">Type</span><span>{{ l.kind === 'affilie' ? 'Affiliate' : 'Premium' }}</span></div>
            <div class="kv"><span class="mut">Expires</span><span>{{ l.lifetime ? 'Never' : fmt.date(l.expiresAt) }}</span></div>
            <div class="kv"><span class="mut">Access</span><span>Your Discord role ({{ l.kind === 'affilie' ? 'Affiliate' : 'Premium' }})</span></div>
          </div>
        </div>
      } @empty {
        <div class="card mut" style="margin-top:18px">No licence yet. <a routerLink="/pricing">Choose a plan</a> or <a routerLink="/dashboard/redeem">redeem a key</a>.</div>
      }

      <div class="card" style="margin-top:18px">
        <h3>How to get the studies in MotiveWave</h3>
        <ol class="mut" style="margin:6px 0 0;padding-left:18px;line-height:1.7">
          <li>Download <code>FXROrderFlow.jar</code> from <strong>#téléchargements</strong> on Discord (MotiveWave closed).</li>
          <li>In MotiveWave: <strong>Study → FXR OrderFlow → Loader</strong>, add it to a chart.</li>
          <li>A Discord page opens → click <strong>Authorize</strong> → a green <strong>Connected</strong> badge appears bottom-left.</li>
          <li>The <strong>FXR Studies</strong> menu now holds every study (Big Trades, Delta Heatmap, Leg to Leg…).</li>
        </ol>
        <p class="help" style="margin-top:10px">It is tied to your Discord account, not a computer — so it works on all of your own machines, with no key and no per-computer limit. Sign in about once a week.</p>
      </div>
    }
  `,
})
export class LicenceComponent {
  store = inject(DashboardStore);
  fmt = fmt;
}
