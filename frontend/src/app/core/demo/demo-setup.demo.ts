// Preview build only: hash routing + an in-browser fake API. Nothing is sent anywhere.
import { withInterceptors, type HttpFeature, type HttpFeatureKind } from '@angular/common/http';
import { withHashLocation, type RouterFeatures } from '@angular/router';
import { demoInterceptor, demoStore } from './demo-backend';

/** QR code of DEMO_ADDRESS, which is not a valid TRON address: scanning it cannot lead to a payment. */
const DEMO_QR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNyAyNyIgc2hhcGUtcmVuZGVyaW5nPSJjcmlzcEVkZ2VzIj48cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNMCAwaDI3djI3SDB6Ii8+PHBhdGggc3Ryb2tlPSIjMGIwYjEyIiBkPSJNMSAxLjVoN20xIDBoMW0yIDBoMW0xIDBoMW0xIDBoMm0xIDBoN00xIDIuNWgxbTUgMGgxbTEgMGgzbTQgMGgxbTIgMGgxbTUgMGgxTTEgMy41aDFtMSAwaDNtMSAwaDFtMyAwaDFtMyAwaDFtMyAwaDFtMSAwaDNtMSAwaDFNMSA0LjVoMW0xIDBoM20xIDBoMW0xIDBoM20xIDBoMm0xIDBoMm0xIDBoMW0xIDBoM20xIDBoMU0xIDUuNWgxbTEgMGgzbTEgMGgxbTQgMGgybTEgMGgybTIgMGgxbTEgMGgzbTEgMGgxTTEgNi41aDFtNSAwaDFtMiAwaDNtMSAwaDFtMSAwaDJtMSAwaDFtNSAwaDFNMSA3LjVoN20xIDBoMW0xIDBoMW0xIDBoMW0xIDBoMW0xIDBoMW0xIDBoN005IDguNWgybTUgMGgxTTEgOS41aDFtMSAwaDJtMSAwaDNtMSAwaDFtMyAwaDFtNCAwaDFtMiAwaDFtMSAwaDJNMiAxMC41aDFtOCAwaDFtMSAwaDFtMiAwaDFtMyAwaDFtMSAwaDRNNCAxMS41aDFtMiAwaDRtMSAwaDFtMiAwaDJtNCAwaDJtMSAwaDFNMiAxMi41aDJtOCAwaDNtMSAwaDJtNSAwaDJNMyAxMy41aDFtMSAwaDRtMSAwaDNtMyAwaDFtMSAwaDFtMSAwaDNtMSAwaDJNMyAxNC41aDFtMSAwaDFtMiAwaDFtMSAwaDFtMSAwaDFtMiAwaDFtMiAwaDhNMiAxNS41aDJtMSAwaDNtNSAwaDJtMiAwaDFtMiAwaDFtMyAwaDFNMSAxNi41aDFtMiAwaDFtNCAwaDNtMSAwaDFtMyAwaDRtMSAwaDFNNCAxNy41aDFtMiAwaDFtMSAwaDRtMiAwaDdtMSAwaDJNOSAxOC41aDJtMiAwaDJtMiAwaDFtMyAwaDFtMSAwaDJNMSAxOS41aDdtMSAwaDJtMSAwaDJtMyAwaDFtMSAwaDFtMSAwaDFtMiAwaDJNMSAyMC41aDFtNSAwaDFtMSAwaDFtMyAwaDFtMSAwaDFtMSAwaDFtMyAwaDFNMSAyMS41aDFtMSAwaDNtMSAwaDFtMiAwaDFtMSAwaDFtMSAwaDFtMSAwaDZtMSAwaDFNMSAyMi41aDFtMSAwaDNtMSAwaDFtMSAwaDFtMSAwaDFtMSAwaDFtMyAwaDNtNCAwaDJNMSAyMy41aDFtMSAwaDNtMSAwaDFtMSAwaDFtMSAwaDJtMiAwaDFtMiAwaDFtMyAwaDFtMSAwaDFNMSAyNC41aDFtNSAwaDFtNiAwaDFtMSAwaDdtMiAwaDFNMSAyNS41aDdtMSAwaDNtMSAwaDFtMyAwaDFtMSAwaDFtMSAwaDFtMSAwaDFtMSAwaDEiLz48L3N2Zz4K';

export interface DemoApi {
  persona(): 'visitor' | 'member' | 'owner';
  signIn(): void;
  setPersona(p: 'member' | 'owner'): void;
  panelPath: string;
  /** Preview only: plays a payment (detected, then confirmed) for an order. */
  simulatePayment?(orderId: string): void;
  /** Preview only: QR code of the (deliberately invalid) sample address. */
  qrUrl?: string;
}

export const DEMO = true;
export const demoApi: DemoApi | null = {
  persona: () => demoStore.persona,
  signIn: () => { if (demoStore.persona === 'visitor') demoStore.persona = 'member'; },
  setPersona: (p) => { demoStore.persona = p; },
  panelPath: demoStore.panelPath,
  simulatePayment: (orderId) => demoStore.pay(orderId),
  qrUrl: DEMO_QR,
};
export const demoRouterFeatures: RouterFeatures[] = [withHashLocation()];
export const demoHttpFeatures: HttpFeature<HttpFeatureKind>[] = [withInterceptors([demoInterceptor])];
