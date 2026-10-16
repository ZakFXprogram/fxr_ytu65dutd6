import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STUDIES } from '../core/studies';
import { TapeComponent } from '../components/tape.component';
import { PricingBlockComponent } from '../components/pricing-block.component';
import { IconComponent } from '../core/icon.component';
import { CountDirective, RevealDirective, SpotDirective } from '../core/motion';
import { SiteService } from '../core/site.service';
import { FAQ } from './faq.data';

@Component({
  selector: 'app-home',
  imports: [RouterLink, TapeComponent, PricingBlockComponent, IconComponent, RevealDirective, SpotDirective, CountDirective],
  template: `
    <section class="wrap hero">
      <div>
        <span class="chip rise" style="--d:0ms"><i class="dot"></i> Order flow studies for MotiveWave</span>
        <h1>
          <span class="l rise" style="--d:80ms">Read the tape.</span>
          <span class="l rise grad" style="--d:180ms">See size before</span>
          <span class="l rise" style="--d:280ms">the move.</span>
        </h1>
        <p class="lead rise" style="--d:380ms">Seven studies built on every tick and on market-by-order data: big trades, who hit whom, delta and the levels that matter, right on your MotiveWave charts.</p>
        <div class="hero-cta rise" style="--d:460ms">
          <a class="btn btn-primary" routerLink="/pricing">Get the bundle <app-icon name="arrow" /></a>
          <a class="btn btn-ghost" routerLink="/studies">Explore the studies</a>
        </div>
        <div class="hero-facts rise" style="--d:560ms">
          <div><b class="num" [fxrCount]="7"></b><span>studies in one bundle</span></div>
          <div><b class="num" [fxrCount]="8"></b><span>USDT a month</span></div>
          <div><b class="num" [fxrCount]="67"></b><span>USDT for lifetime</span></div>
        </div>
      </div>
      <app-tape class="rise" style="--d:200ms" />
    </section>

    <div class="ticker" aria-hidden="true">
      <div class="ticker-track">
        @for (r of [0, 1]; track r) {
          @for (s of studies; track s.slug) {
            <span><i class="dot" [style.background]="$index % 2 ? 'var(--sell)' : 'var(--buy)'" style="animation:none"></i><b>{{ s.name }}</b> {{ s.tag.toLowerCase() }}</span>
          }
        }
      </div>
    </div>

    <section class="wrap section">
      <div class="sec-head">
        <h2 fxrReveal>Built for traders who read order flow</h2>
        <p fxrReveal="80">No repainting tricks and no black box: every mark on your chart comes from real prints and real orders, and you control how each study groups them.</p>
      </div>
      <div class="why">
        @for (w of why; track w.t; let i = $index) {
          <div class="card" fxrSpot [fxrReveal]="i * 90">
            <div class="why-ico"><app-icon [name]="w.i" /></div>
            <h3>{{ w.t }}</h3>
            <p>{{ w.d }}</p>
          </div>
        }
      </div>
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="sec-head">
        <h2 fxrReveal>The studies</h2>
        <p fxrReveal="80">Each one does one job well, and they share the same data so they agree with each other. All seven come in the bundle.</p>
      </div>
      <div class="studies">
        @for (s of studies; track s.slug; let i = $index) {
          <a class="card study-card" fxrSpot [fxrReveal]="(i % 3) * 90" [routerLink]="['/studies', s.slug]">
            <div class="shot"><img [src]="'studies/' + s.img + '.jpg'" [alt]="s.name + ' on a MotiveWave chart'" loading="lazy" /></div>
            <div class="body">
              <span class="tag">{{ s.tag }}</span>
              <h3>{{ s.name }}</h3>
              <p>{{ s.blurb }}</p>
              <span class="go">View study <app-icon name="arrow" /></span>
            </div>
          </a>
        }
      </div>
    </section>

    <section class="wrap section" id="pricing" style="padding-top:0">
      <div class="sec-head">
        <h2 fxrReveal>One bundle, every study</h2>
        <p fxrReveal="80">Pick a subscription or pay once for lifetime. Sign in with Discord, pay in USDT, and your access turns on by itself.</p>
      </div>
      <app-pricing-block fxrReveal />
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="sec-head">
        <h2 fxrReveal>From payment to chart in minutes</h2>
        <p fxrReveal="80">Everything after the payment happens on our Discord, where the install guide and support live.</p>
      </div>
      <div class="steps">
        @for (s of steps; track s.t; let i = $index) {
          <div class="card step" fxrSpot [fxrReveal]="i * 100"><h3>{{ s.t }}</h3><p>{{ s.d }}</p></div>
        }
      </div>
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="support">
        <div class="card" fxrSpot fxrReveal>
          <div class="why-ico"><app-icon name="chat" /></div>
          <h3 style="margin:16px 0 6px">Discord — fastest answers</h3>
          <p class="mut">Members get a private support channel. Most questions are answered within a few hours.</p>
          @if (site.info()?.discord) { <a class="btn btn-discord btn-sm" [href]="site.info()!.discord" target="_blank" rel="noopener noreferrer">Join the Discord</a> }
        </div>
        <div class="card" fxrSpot fxrReveal="100">
          <div class="why-ico"><app-icon name="mail" /></div>
          <h3 style="margin:16px 0 6px">E-mail</h3>
          <p class="mut">For billing questions or anything you'd rather not post on Discord.</p>
          @if (site.info()?.support) { <span class="mono" style="user-select:all">{{ site.info()!.support }}</span> } @else { <a routerLink="/faq">Read the FAQ first</a> }
        </div>
      </div>
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="sec-head">
        <h2 fxrReveal>Questions people ask</h2>
        <p fxrReveal="80"><a routerLink="/faq">See every question</a></p>
      </div>
      @for (q of faq; track q.q) {
        <details class="acc" fxrReveal><summary>{{ q.q }}<span class="plus"></span></summary><div class="ans">{{ q.a }}</div></details>
      }
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="cta-band" fxrReveal>
        <h2>Put real order flow on your charts</h2>
        <p>All seven studies, automatic updates and the Discord community, from 8 USDT a month.</p>
        <div class="row" style="justify-content:center">
          <a class="btn btn-primary" routerLink="/pricing">See pricing</a>
          <a class="btn btn-ghost" routerLink="/studies">Browse the studies</a>
        </div>
      </div>
    </section>
  `,
})
export class HomeComponent {
  site = inject(SiteService);
  studies = STUDIES;
  faq = FAQ.flatMap((c) => c.items).filter((q) => q.home);
  why = [
    { i: 'tick', t: 'Every tick, not summaries', d: 'Studies read each print with its bid/ask side, so a 300-lot fill shows up as a 300-lot fill.' },
    { i: 'layers', t: 'Market by order', d: 'Deep Trades uses MBO data to show whether size came from one order or a crowd, and what it hit.' },
    { i: 'bolt', t: 'One loader, auto-updates', d: 'Install FXR Loader once. New versions and new studies arrive without touching your files again.' },
    { i: 'shield', t: 'Your licence, your account', d: 'Access is tied to your Discord account and one computer, and you move it yourself when you change PC.' },
  ];
  steps = [
    { t: 'Sign in with Discord', d: 'Your licence lives on your Discord account. No password to create, nothing to remember.' },
    { t: 'Pay in USDT', d: 'Send the exact amount shown to our TRON address. The blockchain confirms it, your access turns on by itself.' },
    { t: 'Install from Discord', d: 'Your role unlocks the install channel: download FXR Loader, paste your key from the dashboard, done.' },
  ];
}
