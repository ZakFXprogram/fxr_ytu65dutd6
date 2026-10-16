import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FAQ } from './faq.data';
import { IconComponent } from '../core/icon.component';
import { RevealDirective } from '../core/motion';

@Component({
  selector: 'app-faq',
  imports: [FormsModule, RouterLink, IconComponent, RevealDirective],
  template: `
    <section class="wrap section-tight" style="padding-top:64px">
      <span class="chip rise">Help centre</span>
      <h1 class="rise" style="--d:80ms;margin-top:16px">Frequently asked questions</h1>
      <p class="lead rise" style="--d:160ms">Installation, payments, licences and the studies themselves. Can't find it? Ask on Discord.</p>
    </section>

    <section class="wrap" style="max-width:860px;padding-bottom:88px">
      <div class="search rise" style="--d:220ms;max-width:none;margin-bottom:16px">
        <app-icon name="search" />
        <input id="faq-search" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Search the questions" autocomplete="off" />
      </div>
      <div class="faq-cats rise" style="--d:260ms">
        <div class="seg">
          <button [class.on]="cat() === ''" (click)="cat.set('')">All</button>
          @for (c of cats; track c.id) { <button [class.on]="cat() === c.id" (click)="cat.set(c.id)">{{ c.label }}</button> }
        </div>
      </div>

      @for (c of shown(); track c.id) {
        <h2 style="font-size:18px;margin:28px 0 12px" class="mut" fxrReveal>{{ c.label }}</h2>
        @for (item of c.items; track item.q) {
          <details class="acc" fxrReveal><summary>{{ item.q }}<span class="plus"></span></summary><div class="ans">{{ item.a }}</div></details>
        }
      } @empty {
        <div class="card empty">No question matches "{{ q() }}". Try another word, or ask us on Discord.</div>
      }
      <p class="mut" style="margin-top:28px">Still stuck? Open a ticket on Discord or read the <a routerLink="/legal/terms">Terms</a> and the <a routerLink="/legal/risk">Risk disclosure</a>.</p>
    </section>
  `,
})
export class FaqComponent {
  cats = FAQ;
  q = signal('');
  cat = signal('');
  shown = computed(() => {
    const words = this.q().toLowerCase().split(/\s+/).filter(Boolean);
    return FAQ.filter((c) => !this.cat() || c.id === this.cat())
      .map((c) => ({ ...c, items: c.items.filter((i) => words.every((w) => (i.q + ' ' + i.a).toLowerCase().includes(w))) }))
      .filter((c) => c.items.length);
  });
}
