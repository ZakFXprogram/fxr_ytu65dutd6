import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STUDIES } from '../core/studies';

@Component({
  selector: 'app-studies',
  imports: [RouterLink],
  template: `
    <section class="wrap" style="padding-top:48px">
      <div class="center">
        <span class="chip">The FXR suite</span>
        <h1 style="font-size:38px;margin:14px 0 10px">Seven studies, one tape</h1>
        <p class="mut" style="max-width:600px;margin:0 auto">Every study below is driven by tick-by-tick data with bid/ask side. Screenshots are rendered by MotiveWave's own engine on simulated data.</p>
      </div>
    </section>

    <section class="wrap section" style="display:grid;gap:40px">
      @for (s of studies; track s.name) {
        <div class="study">
          <img [src]="'/studies/' + s.img + '.jpg'" [alt]="s.name" loading="lazy" />
          <div class="study-txt">
            <span class="tag">{{ s.tag }}</span>
            <h3>{{ s.name }}</h3>
            <p class="mut">{{ s.blurb }}</p>
            <ul style="margin:12px 0 0;padding-left:18px;color:var(--mut)">
              @for (p of s.points; track p) { <li style="margin-bottom:5px">{{ p }}</li> }
            </ul>
          </div>
        </div>
      }
    </section>

    <section class="wrap section center">
      <a class="btn btn-primary" routerLink="/pricing">Get the full suite</a>
    </section>
  `,
})
export class StudiesComponent {
  studies = STUDIES;
}
