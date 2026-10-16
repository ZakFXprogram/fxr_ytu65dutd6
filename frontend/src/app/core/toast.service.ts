import { Injectable, signal } from '@angular/core';

/** One short message at the bottom of the screen after an action. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<{ text: string; ok: boolean } | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(text: string, ok = true): void {
    clearTimeout(this.timer);
    this.current.set({ text, ok });
    this.timer = setTimeout(() => this.current.set(null), 3500);
  }
}
