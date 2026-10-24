import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STUDIES } from '../core/studies';
import { IconComponent } from '../core/icon.component';
import { RevealDirective, SpotDirective } from '../core/motion';

@Component({
  selector: 'app-studies',
  imports: [RouterLink, IconComponent, RevealDirective, SpotDirective],
  template: `
    <section class="wrap section-tight" style="padding-top:64px">
      <span class="chip rise">The FXR Bundle</span>
      <h1 class="rise" style="--d:80ms;margin-top:16px">Eleven studies, <span class="grad">one tape</span></h1>
      <p class="lead rise" style="--d:160ms">Every study reads the same tick-by-tick data, so they agree with each other. Screenshots are rendered by MotiveWave on simulated data.</p>
      <div class="seg rise" style="--d:240ms;margin-top:10px">
        @for (t of tags; track t) {
          <button [class.on]="tag() === t" (click)="tag.set(t)">{{ t || 'All' }} <span class="n">{{ count(t) }}</span></button>
        }
      </div>
    </section>

    <section class="wrap" style="padding-bottom:88px">
      <div class="studies">
        @for (s of shown(); track s.slug; let i = $index) {
          <a class="card study-card" fxrSpot [fxrReveal]="(i % 3) * 80" [routerLink]="['/studies', s.slug]">
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

      <div class="cta-band" fxrReveal style="margin-top:56px">
        <h2>All ten are in the bundle</h2>
        <p>One licence unlocks every study, every update and every future study.</p>
        <a class="btn btn-primary" routerLink="/pricing">See the bundle <app-icon name="arrow" /></a>
      </div>
    </section>
  `,
})
export class StudiesComponent {
  tags = ['', ...Array.from(new Set(STUDIES.map((s) => s.tag)))];
  tag = signal('');
  shown = computed(() => STUDIES.filter((s) => !this.tag() || s.tag === this.tag()));
  count(t: string): number {
    return STUDIES.filter((s) => !t || s.tag === t).length;
  }
}
