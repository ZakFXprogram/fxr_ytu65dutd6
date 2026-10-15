// Preview build only: hash routing + an in-browser fake API. Nothing is sent anywhere.
import { withInterceptors, type HttpFeature, type HttpFeatureKind } from '@angular/common/http';
import { withHashLocation, type RouterFeatures } from '@angular/router';
import { demoInterceptor, demoStore } from './demo-backend';

export interface DemoApi {
  persona(): 'visitor' | 'member' | 'owner';
  signIn(): void;
  setPersona(p: 'member' | 'owner'): void;
  panelPath: string;
}

export const DEMO = true;
export const demoApi: DemoApi | null = {
  persona: () => demoStore.persona,
  signIn: () => { if (demoStore.persona === 'visitor') demoStore.persona = 'member'; },
  setPersona: (p) => { demoStore.persona = p; },
  panelPath: demoStore.panelPath,
};
export const demoRouterFeatures: RouterFeatures[] = [withHashLocation()];
export const demoHttpFeatures: HttpFeature<HttpFeatureKind>[] = [withInterceptors([demoInterceptor])];
