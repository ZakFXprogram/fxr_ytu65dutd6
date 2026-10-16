import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ListQuery, Page } from '../../core/models';
import { apiError } from '../../core/api.service';

/**
 * State of one server-side list in the panel: search, filters, page, selection. Every change reloads only the
 * current page from the API, so the panel stays fast with tens of thousands of rows.
 */
export class ListState<T extends { id: string }> {
  readonly q = signal('');
  readonly status = signal('');
  readonly plan = signal('');
  readonly extra = signal<Record<string, string>>({});
  readonly page = signal(1);
  readonly size = signal(25);
  readonly items = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selected = signal<Set<string>>(new Set());
  private typed = new Subject<void>();
  private sub?: Subscription;

  constructor(
    private readonly fetch: (q: ListQuery) => Observable<Page<T>>,
    private readonly onPage?: (p: Page<T>) => void,
  ) {
    inject(DestroyRef).onDestroy(() => { this.sub?.unsubscribe(); this.typed.complete(); });
    this.typed.pipe(debounceTime(250)).subscribe(() => this.go(1));
  }

  search(v: string): void { this.q.set(v); this.typed.next(); }
  filter(status: string): void { this.status.set(status); this.go(1); }
  setPlan(plan: string): void { this.plan.set(plan); this.go(1); }
  setExtra(k: string, v: string): void { this.extra.update((e) => ({ ...e, [k]: v })); this.go(1); }
  setSize(n: number): void { this.size.set(n); this.go(1); }

  go(page = this.page()): void {
    this.page.set(Math.max(1, page));
    this.loading.set(true);
    this.sub?.unsubscribe();
    this.sub = this.fetch({ q: this.q().trim() || undefined, status: this.status() || undefined, plan: this.plan() || undefined, ...this.extra(), page: this.page(), size: this.size() })
      .subscribe({
        next: (p) => {
          this.items.set(p.items);
          this.total.set(p.total);
          this.loading.set(false);
          this.error.set('');
          const ids = new Set(p.items.map((i) => i.id));
          this.selected.update((s) => new Set([...s].filter((x) => ids.has(x))));
          this.onPage?.(p);
        },
        error: (e) => { this.loading.set(false); this.error.set(apiError(e)); },
      });
  }

  toggle(id: string): void {
    this.selected.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  toggleAll(): void {
    const all = this.items().map((i) => i.id);
    this.selected.update((s) => (all.every((x) => s.has(x)) ? new Set() : new Set(all)));
  }
  allSelected(): boolean { const it = this.items(); return it.length > 0 && it.every((i) => this.selected().has(i.id)); }
  clear(): void { this.selected.set(new Set()); }
  ids(): string[] { return [...this.selected()]; }
  pages(): number { return Math.max(1, Math.ceil(this.total() / this.size())); }
}

/** "Showing 26–50 of 1 204" + previous / next + rows per page. */
@Component({
  selector: 'app-pager',
  template: `
    <div class="pager">
      <span>{{ total() ? (from() + '–' + to() + ' of ' + total().toLocaleString('en-US')) : 'No results' }}</span>
      <span class="row" style="gap:8px">
        <select [value]="size()" (change)="sizeChange.emit(+$any($event.target).value)" aria-label="Rows per page">
          @for (n of [25, 50, 100]; track n) { <option [value]="n">{{ n }} / page</option> }
        </select>
        <button class="btn btn-ghost btn-xs" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">← Prev</button>
        <span class="num">{{ page() }} / {{ pages() }}</span>
        <button class="btn btn-ghost btn-xs" [disabled]="page() >= pages()" (click)="pageChange.emit(page() + 1)">Next →</button>
      </span>
    </div>
  `,
})
export class PagerComponent {
  page = input.required<number>();
  size = input.required<number>();
  total = input.required<number>();
  pageChange = output<number>();
  sizeChange = output<number>();
  pages = () => Math.max(1, Math.ceil(this.total() / this.size()));
  from = () => (this.page() - 1) * this.size() + 1;
  to = () => Math.min(this.total(), this.page() * this.size());
}

export const ORDER_LABEL: Record<string, string> = {
  pending: 'awaiting payment', confirming: 'confirming', paid: 'paid', partially_paid: 'partially paid', review: 'review',
  failed: 'failed', expired: 'expired', cancelled: 'cancelled', refunded: 'refunded',
};
