import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';
import { demoHttpFeatures, demoRouterFeatures } from './core/demo/demo-setup';
import { reducedMotion } from './core/motion';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      ...(reducedMotion() ? [] : [withViewTransitions({ skipInitialTransition: true })]),
      ...demoRouterFeatures,
    ),
    provideHttpClient(withFetch(), ...demoHttpFeatures),
  ],
};
