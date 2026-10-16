import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, inject, viewChild } from '@angular/core';
import { reducedMotion } from '../core/motion';

interface Pt { t: number; p: number }
interface Bubble { t: number; p: number; size: number; buy: boolean; born: number }

const TICK = 0.25;
const STEP_MS = 110;
const WINDOW = 150; // steps visible
const AXIS_W = 74;

/**
 * The hero's signature: a simulated ES tape drawn the way Big Trades draws it. Price walks, large aggressive
 * prints pop up as bubbles sized by volume (cyan buyers, magenta sellers), a volume profile builds up on the
 * right, and the pointer gets a crosshair with the print under it. Pauses when off screen; a still frame for
 * visitors who prefer reduced motion.
 */
@Component({
  selector: 'app-tape',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tape">
      <canvas #c role="img" aria-label="Animated simulation of big trades on an ES price chart"></canvas>
      <div class="tape-head"><span><b>ES</b>&nbsp; Big Trades</span><span class="row" style="gap:7px"><i class="dot"></i>Simulation</span></div>
      <div class="tape-legend"><span><i style="background:var(--buy)"></i>Aggressive buyers</span><span><i style="background:var(--sell)"></i>Aggressive sellers</span></div>
    </div>
  `,
})
export class TapeComponent implements AfterViewInit, OnDestroy {
  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  private zone = inject(NgZone);
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private pts: Pt[] = [];
  private bubbles: Bubble[] = [];
  private profile = new Map<number, { b: number; s: number }>();
  private t = 0;
  private price = 5912.25;
  private drift = 0;
  private lastStep = 0;
  private lo = 0;
  private hi = 0;
  private raf = 0;
  private visible = true;
  private mouse: { x: number; y: number } | null = null;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private still = reducedMotion();

  ngAfterViewInit(): void {
    const c = this.canvasRef().nativeElement;
    this.ctx = c.getContext('2d')!;
    for (let i = 0; i < WINDOW + 5; i++) this.step(performance.now() - (WINDOW + 5 - i) * 600);
    this.lo = Math.min(...this.pts.map((p) => p.p)) - 2;
    this.hi = Math.max(...this.pts.map((p) => p.p)) + 2;
    this.resize();
    // everything below runs outside Angular: 60 redraws a second must not trigger change detection
    this.zone.runOutsideAngular(() => {
      this.ro = new ResizeObserver(() => { this.resize(); if (this.still) this.draw(performance.now()); });
      this.ro.observe(c);
      c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (this.still) this.draw(performance.now()); });
      c.addEventListener('pointerleave', () => { this.mouse = null; if (this.still) this.draw(performance.now()); });
      if (this.still) { this.draw(performance.now()); return; }
      this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.loop(); });
      this.io.observe(c);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.loop();
    });
  }

  private onVisibility = (): void => { if (!document.hidden && this.visible) this.loop(); };

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
  }

  private loop = (): void => {
    cancelAnimationFrame(this.raf);
    const frame = (now: number) => {
      if (!this.visible || document.hidden) return;
      if (now - this.lastStep > 2000) this.lastStep = now - STEP_MS; // back from a hidden tab: no catch-up burst
      while (now - this.lastStep >= STEP_MS) this.step(this.lastStep ? this.lastStep + STEP_MS : now);
      this.draw(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  };

  private resize(): void {
    const c = this.canvasRef().nativeElement;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = c.clientWidth;
    this.h = c.clientHeight;
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
  }

  /** One simulation step: price walk, profile volume, sometimes a big print. */
  private step(now: number): void {
    this.lastStep = now;
    this.t++;
    if (Math.random() < 0.04) this.drift = (Math.random() - 0.5) * 0.5;
    const move = Math.round((this.drift + (Math.random() - 0.5) * 1.6) / 1) * TICK * (Math.random() < 0.55 ? 1 : 0);
    this.price = Math.round((this.price + move) / TICK) * TICK;
    this.pts.push({ t: this.t, p: this.price });
    const lvl = Math.round(this.price / TICK);
    const cell = this.profile.get(lvl) ?? { b: 0, s: 0 };
    const vol = 5 + Math.random() * 30;
    if (move >= 0) cell.b += vol; else cell.s += vol;
    if (Math.random() < 0.09) {
      const size = Math.min(900, Math.round(40 + 160 * (Math.pow(Math.random(), -0.55) - 1)));
      const buy = move > 0 ? Math.random() < 0.75 : move < 0 ? Math.random() < 0.25 : Math.random() < 0.5;
      this.bubbles.push({ t: this.t, p: this.price, size, buy, born: now });
      if (buy) cell.b += size; else cell.s += size;
      if (Math.abs(this.drift) < 0.3) this.drift += buy ? 0.08 : -0.08;
    }
    this.profile.set(lvl, cell);
    const oldest = this.t - WINDOW - 4;
    while (this.pts.length && this.pts[0].t < oldest) this.pts.shift();
    while (this.bubbles.length && this.bubbles[0].t < oldest) this.bubbles.shift();
  }

  private draw(now: number): void {
    const { ctx, w, h, dpr } = this;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const top = 46, bottom = h - 40, plotW = w - AXIS_W;
    const frac = this.still ? 0 : Math.min(1, (now - this.lastStep) / STEP_MS);
    const tEnd = this.t + frac;
    const xOf = (t: number) => ((t - (tEnd - WINDOW)) / WINDOW) * (plotW - 18);

    // smooth vertical range
    const ps = this.pts.map((p) => p.p);
    const wantLo = Math.min(...ps) - 1.5, wantHi = Math.max(...ps) + 1.5;
    this.lo += (wantLo - this.lo) * 0.06;
    this.hi += (wantHi - this.hi) * 0.06;
    const span = Math.max(this.hi - this.lo, 6);
    const yOf = (p: number) => bottom - ((p - this.lo) / span) * (bottom - top);

    // grid + price labels
    const stepP = span > 24 ? 4 : span > 12 ? 2 : 1;
    ctx.font = '500 11px "Manrope Variable", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let p = Math.ceil(this.lo / stepP) * stepP; p <= this.hi; p += stepP) {
      const y = yOf(p);
      if (y < top - 6 || y > bottom + 6) continue;
      ctx.strokeStyle = 'rgba(58,51,82,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(plotW, Math.round(y) + 0.5); ctx.stroke();
      ctx.fillStyle = '#6f6889';
      ctx.fillText(p.toFixed(2), plotW + 10, y);
    }

    // volume profile (right side of the plot)
    let maxV = 1;
    for (const [lvl, c] of this.profile) if (lvl * TICK >= this.lo && lvl * TICK <= this.hi) maxV = Math.max(maxV, c.b + c.s);
    const rowH = Math.max(2, ((bottom - top) / span) * TICK - 1);
    for (const [lvl, c] of this.profile) {
      const p = lvl * TICK;
      if (p < this.lo || p > this.hi) continue;
      const y = yOf(p) - rowH / 2;
      const full = ((c.b + c.s) / maxV) * plotW * 0.26;
      const bw = full * (c.b / (c.b + c.s || 1));
      ctx.fillStyle = 'rgba(34,211,238,.16)';
      ctx.fillRect(plotW - full, y, bw, rowH);
      ctx.fillStyle = 'rgba(232,121,249,.16)';
      ctx.fillRect(plotW - full + bw, y, full - bw, rowH);
    }

    // price line + area
    if (this.pts.length > 1) {
      const grad = ctx.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, 'rgba(168,85,247,.22)');
      grad.addColorStop(1, 'rgba(168,85,247,0)');
      ctx.beginPath();
      this.pts.forEach((pt, i) => (i ? ctx.lineTo(xOf(pt.t), yOf(pt.p)) : ctx.moveTo(xOf(pt.t), yOf(pt.p))));
      const last = this.pts[this.pts.length - 1];
      ctx.lineTo(xOf(tEnd), yOf(last.p));
      ctx.strokeStyle = '#c4a6fb';
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineTo(xOf(tEnd), bottom);
      ctx.lineTo(xOf(this.pts[0].t), bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // bubbles
    let hover: Bubble | null = null;
    for (const b of this.bubbles) {
      const x = xOf(b.t), y = yOf(b.p);
      if (x < -40) continue;
      const age = this.still ? 1 : Math.min(1, (now - b.born) / 450);
      const ease = age < 1 ? 1 + 2.2 * Math.pow(age - 1, 3) + 1.2 * Math.pow(age - 1, 2) : 1; // ease-out-back
      const r = (4 + Math.sqrt(b.size) * 0.95) * ease;
      const col = b.buy ? '34,211,238' : '232,121,249';
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(${col},.55)`);
      g.addColorStop(1, `rgba(${col},.12)`);
      ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0.1), 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(${col},.95)`; ctx.stroke();
      if (age < 1) { // ring on arrival
        ctx.beginPath(); ctx.arc(x, y, r + 10 * age, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${col},${0.5 * (1 - age)})`; ctx.stroke();
      }
      if (b.size >= 260 && r > 14) {
        ctx.fillStyle = '#fff';
        ctx.font = '600 10.5px "Unbounded Variable", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(b.size), x, y);
        ctx.textAlign = 'start';
      }
      if (this.mouse && Math.hypot(this.mouse.x - x, this.mouse.y - y) < Math.max(r, 8)) hover = b;
    }

    // last price tag
    const lp = this.pts[this.pts.length - 1].p;
    const ly = yOf(lp);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(196,166,251,.5)';
    ctx.beginPath(); ctx.moveTo(xOf(tEnd), ly); ctx.lineTo(plotW, ly); ctx.stroke();
    ctx.setLineDash([]);
    this.tag(plotW + 4, ly, lp.toFixed(2), '#7c3aed');

    // crosshair + hovered print
    if (this.mouse && this.mouse.x < plotW && this.mouse.y > top - 10 && this.mouse.y < bottom + 10) {
      const { x, y } = this.mouse;
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(236,233,245,.35)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.moveTo(x, top - 10); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.setLineDash([]);
      const p = this.lo + ((bottom - y) / (bottom - top)) * span;
      this.tag(plotW + 4, y, (Math.round(p / TICK) * TICK).toFixed(2), '#3a3352');
      if (hover) {
        const label = `${hover.buy ? 'BUY' : 'SELL'} ${hover.size} @ ${hover.p.toFixed(2)}`;
        ctx.font = '700 12px "Manrope Variable", system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 18;
        const bx = Math.min(x + 12, plotW - tw - 4), by = Math.max(top, y - 34);
        ctx.fillStyle = 'rgba(12,10,19,.92)';
        this.round(bx, by, tw, 24, 7); ctx.fill();
        ctx.strokeStyle = hover.buy ? '#22d3ee' : '#e879f9'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(label, bx + 9, by + 12);
      }
    }
  }

  private tag(x: number, y: number, text: string, bg: string): void {
    const { ctx } = this;
    ctx.font = '600 11px "Unbounded Variable", system-ui, sans-serif';
    const tw = Math.min(ctx.measureText(text).width + 12, AXIS_W - 6);
    ctx.fillStyle = bg;
    this.round(x, y - 10, tw, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 6, y + 0.5);
  }

  private round(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}
