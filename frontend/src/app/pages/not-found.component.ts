import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="wrap section center" style="padding:90px 16px">
      <h1 style="font-size:60px;margin:0" class="grad">404</h1>
      <p class="mut">This page doesn't exist.</p>
      <a class="btn btn-ghost" routerLink="/">Back home</a>
    </section>
  `,
})
export class NotFoundComponent {}
