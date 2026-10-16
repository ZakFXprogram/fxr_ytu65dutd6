import { Component, computed, inject, output, signal } from '@angular/core';
import { ApiService, apiError, fmt } from '../../core/api.service';
import { CountDirective } from '../../core/motion';
import { Overview } from '../../core/models';

const W = 640;
const H = 190;
const PAD_L = 40;
const PAD_B = 22;
const PAD_T = 10;

@Component({
  selector: 'app-panel-overview',
  imports: [CountDirective],
  template: `
    @if (o(); as o) {
      <div class="kpis">
        <div class="card kpi"><div class="k">Revenue, 30 days</div><div class="v"><span [fxrCount]="o.revenue.last30" [decimals]="0"></span> <small class="mut" style="font:700 13px var(--body);margin-left:4px">USDT</small></div><div class="s">{{ o.revenue.orders30 }} paid orders · {{ fmt.usd(o.revenue.today) }} today</div></div>
        <div class="card kpi"><div class="k">Active licences</div><div class="v" [fxrCount]="o.stats.activeLicences"></div><div class="s">{{ o.stats.lifetime }} lifetime · {{ o.stats.expiring7 }} expire within 7 days</div></div>
        <button class="card kpi" style="text-align:left;font:inherit;color:inherit;cursor:pointer" [class.hot]="o.stats.attention > 0" (click)="o.stats.attention > 0 && o.stats.attention === o.stats.unmatched ? go.emit({ view: 'payments' }) : go.emit({ view: 'orders', status: 'attention' })">
          <div class="k">Needs attention</div><div class="v">{{ o.stats.attention }}</div><div class="s">{{ o.stats.unmatched }} to assign · {{ o.stats.inProgress }} waiting for payment →</div>
        </button>
        <div class="card kpi"><div class="k">Members</div><div class="v" [fxrCount]="o.stats.members"></div><div class="s">+{{ o.stats.newMembers7 }} in 7 days · {{ o.stats.unusedCodes }} unused keys</div></div>
      </div>

      <div class="grid ov-grid" style="margin-top:14px;align-items:start">
        <div class="card" style="position:relative">
          <div class="spread"><h3 style="margin:0">Paid revenue per day</h3><span class="small faint">Last 30 days · USDT · total {{ fmt.usd(o.revenue.total) }}</span></div>
          <svg class="chart" style="height:auto;margin-top:10px" [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" aria-label="Paid revenue per day over the last 30 days" (mouseleave)="hover.set(-1)">
            @for (t of ticks(); track t.v) {
              <line class="grid" [attr.x1]="PAD_L" [attr.x2]="W" [attr.y1]="t.y" [attr.y2]="t.y" />
              <text class="axis" [attr.x]="PAD_L - 6" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
            }
            @for (b of bars(); track b.i) {
              <path class="bar" [attr.d]="b.d" [style.opacity]="hover() === -1 || hover() === b.i ? 1 : .45" />
              <rect [attr.x]="b.x - 1" [attr.y]="PAD_T" [attr.width]="b.w + 2" [attr.height]="H - PAD_B - PAD_T" fill="transparent" (mouseenter)="hover.set(b.i)" />
              @if ((b.i % 7 === 0 && b.i <= 21) || b.i === 29) { <text class="axis" [attr.x]="b.i === 29 ? b.x + b.w : b.x + b.w / 2" [attr.y]="H - 6" [attr.text-anchor]="b.i === 29 ? 'end' : 'middle'">{{ b.label }}</text> }
            }
          </svg>
          @if (tip(); as t) {
            <div class="chart-tip" [style.left.%]="t.left"><b>{{ t.label }}</b><span>{{ fmt.usd(t.amount) }} USDT · {{ t.orders }} order{{ t.orders === 1 ? '' : 's' }}</span></div>
          }
        </div>

        <div class="stack" style="gap:14px">
          <div class="card">
            <h3 style="margin:0 0 12px">Active plans</h3>
            <div class="mix">
              @for (p of o.planMix; track p.plan) {
                <div><div class="spread small"><span>{{ p.plan }}</span><span class="num">{{ p.count }}</span></div><div class="bar"><i [style.width.%]="(p.count / mixMax()) * 100"></i></div></div>
              } @empty { <p class="mut small" style="margin:0">No active licence yet.</p> }
            </div>
          </div>
          <div class="card">
            <h3 style="margin:0 0 10px">Payments</h3>
            @if (recentChange()) {
              <div class="errbox small" style="margin-bottom:10px"><b>The receiving address changed {{ fmt.ago(o.checkout.addressChangedAt) }}.</b> If you did not change it yourself, stop sales and check your Railway variables and accounts now.</div>
            }
            <div class="kv small"><span class="mut">Checkout</span><span [class.ok]="o.checkout.configured" [class.err]="!o.checkout.configured">{{ o.checkout.configured ? 'open' : 'closed: no address set' }}</span></div>
            <div class="kv small"><span class="mut">Paid in</span><span>{{ o.checkout.payCurrency }}, to your wallet</span></div>
            @if (o.checkout.address; as a) {
              <div class="kv small"><span class="mut">Your address</span><span class="mono" style="overflow-wrap:anywhere;text-align:right"><b>{{ a.slice(0, 4) }}</b>{{ a.slice(4, -4) }}<b>{{ a.slice(-4) }}</b></span></div>
            }
            <div class="kv small"><span class="mut">Blockchain check</span>
              @if (watchOk()) { <span class="ok">{{ fmt.ago(o.checkout.lastOkAt) }}</span> }
              @else { <span class="err" [title]="o.checkout.lastError || ''">{{ o.checkout.lastError ? 'failing: ' + fmt.ago(o.checkout.lastErrorAt) : 'not yet' }}</span> }
            </div>
            <div class="kv small"><span class="mut">Sources</span><span class="faint">{{ o.checkout.sources.join(' + ') }}</span></div>
            <div class="kv small"><span class="mut">To assign</span><button class="linkish" (click)="go.emit({ view: 'payments' })">{{ o.stats.unmatched }} payment{{ o.stats.unmatched === 1 ? '' : 's' }} →</button></div>
            <div class="kv small"><span class="mut">Discord role</span><span [class.ok]="o.roleSync" [class.faint]="!o.roleSync">{{ o.roleSync ? 'synced automatically' : 'off' }}</span></div>
          </div>
        </div>
      </div>
    } @else if (error()) {
      <div class="errbox">{{ error() }}</div>
    } @else {
      <p class="mut">Loading…</p>
    }
  `,
})
export class PanelOverviewComponent {
  private api = inject(ApiService);
  go = output<{ view: string; status?: string }>();
  fmt = fmt;
  W = W; H = H; PAD_L = PAD_L; PAD_T = PAD_T; PAD_B = PAD_B;
  o = signal<Overview | null>(null);
  error = signal('');
  hover = signal(-1);

  private max = computed(() => {
    const m = Math.max(0, ...(this.o()?.days ?? []).map((d) => d.amount));
    if (m <= 0) return 10;
    const step = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / step) * step;
  });
  ticks = computed(() => {
    const max = this.max();
    return [0, 0.5, 1].map((f) => ({ v: f, y: this.y(max * f), label: fmt.usd(Math.round(max * f)) }));
  });
  bars = computed(() => {
    const days = this.o()?.days ?? [];
    const slot = (W - PAD_L) / Math.max(1, days.length);
    return days.map((d, i) => {
      const w = Math.max(2, slot - 2); // 2px gap between bars
      const x = PAD_L + i * slot + 1;
      const y = this.y(d.amount);
      const base = H - PAD_B;
      const h = base - y;
      const r = Math.min(4, w / 2, h);
      const path = h <= 0.5
        ? `M${x},${base}h${w}`
        : `M${x},${base}V${y + r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}V${base}Z`;
      const label = new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return { i, x, w, d: path, label, amount: d.amount, orders: d.orders };
    });
  });
  tip = computed(() => {
    const i = this.hover();
    const b = this.bars()[i];
    if (!b) return null;
    return { ...b, left: Math.min(78, Math.max(8, ((b.x + b.w / 2) / W) * 100)) };
  });
  /** Last successful look at the blockchain is newer than the last failure. */
  watchOk = computed(() => {
    const c = this.o()?.checkout;
    return !!c?.lastOkAt && (!c.lastErrorAt || c.lastOkAt > c.lastErrorAt);
  });
  recentChange = computed(() => {
    const t = this.o()?.checkout.addressChangedAt;
    return !!t && Date.now() - t < 14 * 86400_000;
  });
  mixMax = computed(() => Math.max(1, ...(this.o()?.planMix ?? []).map((p) => p.count)));

  constructor() {
    this.load();
  }

  load(): void {
    this.api.overview(new Date().getTimezoneOffset()).subscribe({ next: (o) => this.o.set(o), error: (e) => this.error.set(apiError(e)) });
  }

  private y(v: number): number {
    return PAD_T + (H - PAD_B - PAD_T) * (1 - v / this.max());
  }
}
