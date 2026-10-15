import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STUDIES } from '../core/studies';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="wrap hero">
      <span class="chip">Order flow for MotiveWave · Rithmic &amp; tick data</span>
      <h1>See the <span class="grad">big players</span><br />before the move</h1>
      <p>FXR OrderFlow brings institutional-grade order flow — big trades, market-by-order, delta and volume profiles — straight into your MotiveWave charts.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" routerLink="/pricing">Get access — from 8 USDT/mo</a>
        <a class="btn btn-ghost" routerLink="/studies">Explore the studies</a>
      </div>
      <div class="chips">
        <span class="chip">Sign in with Discord</span>
        <span class="chip">Updates included</span>
        <span class="chip">One licence, your machine</span>
        <span class="chip">Pay in USDT</span>
      </div>
    </section>

    <section class="wrap section">
      <img src="studies/deep_trades.jpg" alt="Deep Trades on a chart"
           style="width:100%;border-radius:16px;border:1px solid var(--line)" />
    </section>

    <section class="wrap section">
      <div class="center" style="margin-bottom:28px">
        <h2 style="font-size:30px">Everything you need to read the tape</h2>
        <p class="mut">Seven studies that work together, all driven by tick-by-tick data.</p>
      </div>
      <div class="grid g3">
        @for (s of studies; track s.name) {
          <div class="card">
            <div class="study-txt"><span class="tag">{{ s.tag }}</span>
              <h3 style="font-size:19px;margin:6px 0 8px">{{ s.name }}</h3>
              <p class="mut" style="margin:0;font-size:14px">{{ s.blurb }}</p>
            </div>
          </div>
        }
      </div>
      <div class="center" style="margin-top:26px">
        <a class="btn btn-ghost" routerLink="/studies">See them on real charts →</a>
      </div>
    </section>

    <section class="wrap section">
      <div class="card" style="text-align:center;padding:40px">
        <h2 style="font-size:28px;margin:0 0 8px">Ready in three minutes</h2>
        <p class="mut" style="max-width:520px;margin:0 auto 20px">Buy a licence, drop the FXR Loader into MotiveWave, paste your key. Your studies appear in the FXR menu.</p>
        <a class="btn btn-primary" routerLink="/pricing">Choose a plan</a>
      </div>
    </section>
  `,
})
export class HomeComponent {
  studies = STUDIES;
}
