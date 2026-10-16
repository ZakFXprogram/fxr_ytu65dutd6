// Real site build: no demo code at all. The preview build swaps this file for demo-setup.demo.ts (angular.json).
import type { HttpFeature, HttpFeatureKind } from '@angular/common/http';
import type { RouterFeatures } from '@angular/router';

export interface DemoApi {
  persona(): 'visitor' | 'member' | 'owner';
  signIn(): void;
  setPersona(p: 'member' | 'owner'): void;
  panelPath: string;
  /** Preview only: plays a payment (detected, then confirmed) for an order. */
  simulatePayment?(orderId: string): void;
}

export const DEMO = false;
export const demoApi: DemoApi | null = null;
export const demoRouterFeatures: RouterFeatures[] = [];
export const demoHttpFeatures: HttpFeature<HttpFeatureKind>[] = [];
