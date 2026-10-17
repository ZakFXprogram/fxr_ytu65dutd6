import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { SessionService } from '../core/session.service';

type State = 'checking' | 'connected' | 'nolicence' | 'badreq' | 'error';

/**
 * Where the FXR Loader sends the member to sign in (instead of a 127.0.0.1 page). We read the `req` nonce the
 * Loader put in the URL, make sure the member is signed in with Discord, then link that sign-in to the waiting
 * Loader. The Loader is polling the API for the result; this page just drives the browser half.
 */
@Component({
  selector: 'app-loader-link',
  imports: [RouterLink],
  template: `
    <section class="wrap section center" style="min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center">
      <div class="brand-badge grad" style="font-size:26px;font-weight:800;letter-spacing:.08em">FXR OrderFlow</div>

      @switch (state()) {
        @case ('checking') {
          <div class="spin" aria-hidden="true"></div>
          <p class="mut">Connexion en cours…</p>
        }
        @case ('connected') {
          <svg class="success" viewBox="0 0 52 52" style="width:64px;height:64px"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
          <h1 style="margin:4px 0;font-size:28px">Connecté <span class="ok">✓</span></h1>
          <p class="lead" style="margin:0">Tu peux fermer cet onglet et revenir sur MotiveWave. Le badge passe au vert dans quelques secondes.</p>
          @if (user()) { <p class="small faint">Connecté en tant que {{ user() }}</p> }
        }
        @case ('nolicence') {
          <h1 style="margin:4px 0;font-size:26px">Pas de licence active</h1>
          <p class="lead" style="margin:0">Ce compte Discord n'a pas de licence FXR active. Prends un plan ou active ta clé, puis relance le Loader.</p>
          <div class="row" style="justify-content:center;margin-top:6px">
            <a class="btn btn-primary btn-sm" routerLink="/pricing">Voir les plans</a>
            <a class="btn btn-ghost btn-sm" routerLink="/dashboard/redeem">Activer une clé</a>
          </div>
        }
        @case ('badreq') {
          <h1 style="margin:4px 0;font-size:26px">Lien invalide</h1>
          <p class="lead" style="margin:0">Ouvre cette page depuis le Loader dans MotiveWave (Study → FXR OrderFlow → Loader).</p>
        }
        @default {
          <h1 style="margin:4px 0;font-size:26px">Une erreur est survenue</h1>
          <p class="lead" style="margin:0">Réessaie depuis le Loader dans MotiveWave. Si ça persiste, contacte le support.</p>
        }
      }
    </section>
  `,
  styles: [`
    .spin { width:34px;height:34px;border-radius:50%;border:3px solid #223; border-top-color:#5fd38d; animation:sp 0.9s linear infinite; }
    @keyframes sp { to { transform:rotate(360deg); } }
    .ok { color:#5fd38d; }
  `],
})
export class LoaderLinkComponent {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private session = inject(SessionService);
  state = signal<State>('checking');
  user = signal<string | null>(null);

  constructor() {
    const req = (this.route.snapshot.queryParamMap.get('req') || '').trim();
    if (!/^[a-f0-9]{24,64}$/i.test(req)) {
      this.state.set('badreq');
      return;
    }
    // Make sure we know the sign-in state, then link (or send to Discord and come back here).
    this.api.me().subscribe({
      next: (m) => {
        if (!m.authenticated) {
          this.session.login(`/loader?req=${req}`);
          return;
        }
        this.user.set(m.user?.name ?? null);
        this.api.loaderLink(req).subscribe({
          next: (r) => this.state.set(r.allowed ? 'connected' : 'nolicence'),
          error: () => this.state.set('error'),
        });
      },
      error: () => this.session.login(`/loader?req=${req}`),
    });
  }
}
