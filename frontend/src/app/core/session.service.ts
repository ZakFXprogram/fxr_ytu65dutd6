import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { Me } from './models';
import { demoApi } from './demo/demo-setup';

/** Who is signed in. Sign-in is Discord only: the browser goes to Discord and comes back with a session cookie. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly me = signal<Me | null>(null); // null while loading
  readonly signedIn = computed(() => this.me()?.authenticated === true);
  readonly user = computed(() => this.me()?.user ?? null);

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.api.me().subscribe({
      next: (m) => this.me.set(m),
      error: () => this.me.set({ authenticated: false }),
    });
  }

  /** Full-page redirect to Discord; comes back to `next`, or to the current page (home goes to the dashboard). */
  login(next?: string): void {
    if (demoApi) {
      // preview build: no Discord, sign straight in as the demo member
      demoApi.signIn();
      this.refresh();
      const r = this.router.url;
      void this.router.navigateByUrl(next ?? (r === '/' ? '/dashboard' : r));
      return;
    }
    const here = window.location.pathname + window.location.search;
    const back = next ?? (window.location.pathname === '/' ? '/dashboard' : here);
    window.location.href = '/api/auth/discord?next=' + encodeURIComponent(back);
  }

  logout(): void {
    this.api.logout().subscribe({
      complete: () => {
        this.me.set({ authenticated: false });
        void this.router.navigateByUrl('/');
      },
    });
  }
}
