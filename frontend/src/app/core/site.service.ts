import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { SiteInfo } from './models';

/** Site info (plans, Discord invite, support e-mail), fetched once and shared. */
@Injectable({ providedIn: 'root' })
export class SiteService {
  private api = inject(ApiService);
  readonly info = signal<SiteInfo | null>(null);
  readonly failed = signal(false);

  constructor() {
    this.api.site().subscribe({ next: (s) => this.info.set(s), error: () => this.failed.set(true) });
  }
}
