import { Routes } from '@angular/router';
import { PANEL_PATH } from './core/panel';

// The panel route exists only on the page served at the secret path (see core/panel.ts).
const panel: Routes = PANEL_PATH
  ? [{ path: PANEL_PATH, loadComponent: () => import('./pages/panel.component').then((m) => m.PanelComponent), title: 'FXR OrderFlow' }]
  : [];

export const routes: Routes = [
  ...panel,
  { path: '', loadComponent: () => import('./pages/home.component').then((m) => m.HomeComponent), title: 'FXR OrderFlow — Order flow for MotiveWave' },
  { path: 'studies', loadComponent: () => import('./pages/studies.component').then((m) => m.StudiesComponent), title: 'Studies — FXR OrderFlow' },
  { path: 'pricing', loadComponent: () => import('./pages/pricing.component').then((m) => m.PricingComponent), title: 'Pricing — FXR OrderFlow' },
  { path: 'install', loadComponent: () => import('./pages/install.component').then((m) => m.InstallComponent), title: 'Install — FXR OrderFlow' },
  { path: 'account', loadComponent: () => import('./pages/account.component').then((m) => m.AccountComponent), title: 'My account — FXR OrderFlow' },
  { path: 'licence', redirectTo: 'account' },
  { path: 'buy/:plan', loadComponent: () => import('./pages/buy.component').then((m) => m.BuyComponent), title: 'Checkout — FXR OrderFlow' },
  { path: 'checkout/:id', loadComponent: () => import('./pages/checkout.component').then((m) => m.CheckoutComponent), title: 'Checkout — FXR OrderFlow' },
  { path: 'faq', loadComponent: () => import('./pages/faq.component').then((m) => m.FaqComponent), title: 'FAQ — FXR OrderFlow' },
  { path: 'legal/:doc', loadComponent: () => import('./pages/legal.component').then((m) => m.LegalComponent), title: 'Legal — FXR OrderFlow' },
  { path: '**', loadComponent: () => import('./pages/not-found.component').then((m) => m.NotFoundComponent), title: 'Not found' },
];
