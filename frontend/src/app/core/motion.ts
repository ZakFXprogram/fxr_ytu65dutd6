import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let io: IntersectionObserver | null = null;
const handlers = new WeakMap<Element, () => void>();
function observer(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        handlers.get(e.target)?.();
        io!.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  return io;
}

/** Fades and lifts an element in the first time it scrolls into view. `fxrReveal="120"` delays it by 120 ms. */
@Directive({ selector: '[fxrReveal]', host: { 'data-reveal': '' } })
export class RevealDirective implements OnInit, OnDestroy {
  delay = input<string | number>('', { alias: 'fxrReveal' });
  private el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  ngOnInit(): void {
    const d = Number(this.delay()) || 0;
    if (d) this.el.style.setProperty('--d', `${d}ms`);
    const o = observer();
    if (!o) return void this.el.classList.add('in');
    handlers.set(this.el, () => this.el.classList.add('in'));
    o.observe(this.el);
  }

  ngOnDestroy(): void {
    io?.unobserve(this.el);
  }
}

/** A soft glow that follows the pointer across a card. */
@Directive({ selector: '[fxrSpot]', host: { class: 'spot', '(pointermove)': 'move($event)' } })
export class SpotDirective {
  private el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  move(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    this.el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
}

/** Counts a number up from zero when it scrolls into view. */
@Directive({ selector: '[fxrCount]' })
export class CountDirective implements OnInit {
  to = input.required<number>({ alias: 'fxrCount' });
  decimals = input(0);
  private el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  ngOnInit(): void {
    const target = this.to();
    const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: this.decimals(), maximumFractionDigits: this.decimals() });
    this.el.textContent = fmt(target);
    const o = observer();
    if (!o || reducedMotion()) return;
    this.el.textContent = fmt(0);
    handlers.set(this.el, () => {
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 1100);
        this.el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    o.observe(this.el);
  }
}
