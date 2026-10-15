import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, apiError } from '../core/api.service';
import { SessionService } from '../core/session.service';

/** /buy/:plan — opens (or re-opens) an order for the signed-in member, then goes to its checkout page. */
@Component({
  selector: 'app-buy',
  imports: [RouterLink],
  template: `
    <section class="wrap section" style="max-width:520px">
      @if (needLogin()) {
        <div class="card center" style="padding:36px 24px">
          <h1 style="font-size:26px;margin:0 0 8px">Sign in to continue</h1>
          <p class="mut" style="margin:0 0 20px">Your licence is linked to your Discord account, so you can find it again from any computer.</p>
          <button class="btn btn-discord" (click)="session.login(path)">Continue with Discord</button>
        </div>
      } @else if (error()) {
        <div class="errbox">{{ error() }}</div>
        <p class="center" style="margin-top:16px"><a routerLink="/account">Go to my account</a> · <a routerLink="/pricing">Back to pricing</a></p>
      } @else {
        <p class="mut center">Preparing your order…</p>
      }
    </section>
  `,
})
export class BuyComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  session = inject(SessionService);
  needLogin = signal(false);
  error = signal('');
  private plan = inject(ActivatedRoute).snapshot.paramMap.get('plan') ?? '';
  path = '/buy/' + encodeURIComponent(this.plan);

  constructor() {
    this.api.createOrder(this.plan).subscribe({
      next: (o) => void this.router.navigate(['/checkout', o.id], { replaceUrl: true }),
      error: (e: HttpErrorResponse) => {
        if (e.status === 401) this.needLogin.set(true);
        else this.error.set(apiError(e, 'Could not open your order. Please try again.'));
      },
    });
  }
}
