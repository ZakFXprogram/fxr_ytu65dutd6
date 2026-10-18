import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { STUDIES } from '../core/studies';
import { IconComponent } from '../core/icon.component';
import { RevealDirective, SpotDirective } from '../core/motion';

/** /studies/:slug — one study in detail, with the way back into the bundle. */
@Component({
  selector: 'app-study',
  imports: [RouterLink, IconComponent, RevealDirective, SpotDirective],
  template: `
    @if (study(); as s) {
      <section class="wrap section-tight" style="padding-top:48px">
        <a routerLink="/studies" class="small mut rise">← All studies</a>
        <div class="row rise" style="--d:60ms;margin-top:18px"><span class="chip">{{ s.tag }}</span><span class="chip">In the FXR Bundle</span></div>
        <h1 class="rise" style="--d:120ms;margin-top:16px">{{ s.name }}</h1>
        <p class="lead rise" style="--d:180ms">{{ s.blurb }}</p>
      </section>

      <section class="wrap" style="padding-bottom:72px">
        <div class="study-detail">
          <div class="rise" style="--d:240ms">
            <img [src]="'studies/' + s.img + '.jpg'" [alt]="s.name + ' on a MotiveWave chart'" />
            <p class="small faint" style="margin-top:10px">Rendered by MotiveWave on simulated data.</p>
          </div>
          <div class="stack" style="gap:18px">
            <div class="card" fxrSpot fxrReveal>
              <h3>What it shows</h3>
              <p class="mut" style="margin:0">{{ s.about }}</p>
            </div>
            <div class="card" fxrSpot fxrReveal="80">
              <h3>Highlights</h3>
              <ul class="checks">@for (p of s.points; track p) { <li>{{ p }}</li> }</ul>
            </div>
            <div class="card" fxrSpot fxrReveal="160">
              <h3>Data it needs</h3>
              <p class="mut" style="margin:0">{{ s.data }}</p>
            </div>
            <div class="card bundle" fxrReveal="220">
              <h3 style="margin-bottom:6px">Get {{ s.name }} with the bundle</h3>
              <p class="mut">All eight studies, automatic updates and the Discord community, from 8 USDT a month.</p>
              <a class="btn btn-primary btn-block" routerLink="/pricing">See pricing <app-icon name="arrow" /></a>
            </div>
          </div>
        </div>

        <div class="spread" style="margin-top:56px;border-top:1px solid var(--line);padding-top:24px">
          <a class="btn btn-ghost btn-sm" [routerLink]="['/studies', prev().slug]">← {{ prev().name }}</a>
          <a class="btn btn-ghost btn-sm" [routerLink]="['/studies', next().slug]">{{ next().name }} →</a>
        </div>
        <p class="small faint" style="margin-top:28px">Studies are analysis tools for educational and informational purposes only, not investment advice. See the <a routerLink="/legal/risk">risk disclosure</a>.</p>
      </section>
    } @else {
      <section class="wrap section center">
        <h1 class="grad">Study not found</h1>
        <a class="btn btn-ghost" routerLink="/studies">See all studies</a>
      </section>
    }
  `,
})
export class StudyComponent {
  private slug = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('slug') ?? '')), { initialValue: '' });
  private index = computed(() => STUDIES.findIndex((s) => s.slug === this.slug()));
  study = computed(() => STUDIES[this.index()] ?? null);
  prev = computed(() => STUDIES[(this.index() - 1 + STUDIES.length) % STUDIES.length]);
  next = computed(() => STUDIES[(this.index() + 1) % STUDIES.length]);
}
