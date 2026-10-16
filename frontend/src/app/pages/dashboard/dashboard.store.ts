import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/api.service';
import { Account, MyLicence } from '../../core/models';

/** The member's account, loaded once for all dashboard pages and refreshed after each action. */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private api = inject(ApiService);
  readonly state = signal<'loading' | 'signin' | 'error' | 'ready'>('loading');
  readonly account = signal<Account | null>(null);

  /** The licence that counts: the active one if any, otherwise the most recent. */
  readonly licence = computed<MyLicence | null>(() => {
    const ls = this.account()?.licences ?? [];
    return ls.find((l) => l.status === 'active') ?? ls[0] ?? null;
  });
  readonly active = computed(() => this.licence()?.status === 'active');
  readonly daysLeft = computed(() => {
    const l = this.licence();
    if (!l || l.status !== 'active') return 0;
    if (l.lifetime) return Infinity;
    return Math.max(0, Math.ceil((l.expiresAt - Date.now()) / 86400_000));
  });

  load(): void {
    this.api.account().subscribe({
      next: (a) => { this.account.set(a); this.state.set('ready'); },
      error: (e: HttpErrorResponse) => this.state.set(e.status === 401 ? 'signin' : 'error'),
    });
  }
}

const KIND_ICON: Record<string, string> = {
  login: 'lock', security: 'shield', order: 'receipt', paid: 'card', redeem: 'gift', key: 'key', move: 'monitor',
  role: 'chat', issue: 'check', renew: 'check', revoke: 'x', attention: 'alert',
};
export const kindIcon = (k: string): string => KIND_ICON[k] ?? 'activity';
