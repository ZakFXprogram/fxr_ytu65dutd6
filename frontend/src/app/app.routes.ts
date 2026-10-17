import { Routes } from '@angular/router';
import { PANEL_PATH } from './core/panel';

// The panel route exists only on the page served at the secret path (see core/panel.ts).
const panel: Routes = PANEL_PATH
  ? [{ path: PANEL_PATH, loadComponent: () => import('./pages/panel/panel.component').then((m) => m.PanelComponent), title: 'FXR OrderFlow' }]
  : [];

const T = (t: string) => `${t} — FXR OrderFlow`;

export const routes: Routes = [
  ...panel,
  { path: '', loadComponent: () => import('./pages/home.component').then((m) => m.HomeComponent), title: 'FXR OrderFlow — Order flow studies for MotiveWave' },
  { path: 'studies', loadComponent: () => import('./pages/studies.component').then((m) => m.StudiesComponent), title: T('Studies') },
  { path: 'studies/:slug', loadComponent: () => import('./pages/study.component').then((m) => m.StudyComponent), title: T('Study') },
  { path: 'pricing', loadComponent: () => import('./pages/pricing.component').then((m) => m.PricingComponent), title: T('Pricing') },
  { path: 'install', loadComponent: () => import('./pages/install.component').then((m) => m.InstallComponent), title: T('Install') },
  { path: 'loader', loadComponent: () => import('./pages/loader-link.component').then((m) => m.LoaderLinkComponent), title: T('Loader') },
  { path: 'faq', loadComponent: () => import('./pages/faq.component').then((m) => m.FaqComponent), title: T('FAQ') },
  { path: 'legal/:doc', loadComponent: () => import('./pages/legal.component').then((m) => m.LegalComponent), title: T('Legal') },
  { path: 'buy/:plan', loadComponent: () => import('./pages/buy.component').then((m) => m.BuyComponent), title: T('Checkout') },
  { path: 'checkout/:id', loadComponent: () => import('./pages/checkout.component').then((m) => m.CheckoutComponent), title: T('Order') },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    children: [
      { path: '', loadComponent: () => import('./pages/dashboard/overview.component').then((m) => m.OverviewComponent), title: T('Dashboard') },
      { path: 'billing', loadComponent: () => import('./pages/dashboard/billing.component').then((m) => m.BillingComponent), title: T('Billing') },
      { path: 'licence', loadComponent: () => import('./pages/dashboard/licence.component').then((m) => m.LicenceComponent), title: T('Licence') },
      { path: 'redeem', loadComponent: () => import('./pages/dashboard/redeem.component').then((m) => m.RedeemComponent), title: T('Redeem a key') },
      { path: 'security', loadComponent: () => import('./pages/dashboard/security.component').then((m) => m.SecurityComponent), title: T('Security') },
    ],
  },
  { path: 'account', redirectTo: 'dashboard' },
  { path: 'licence', redirectTo: 'dashboard/licence' },
  { path: 'get-started', redirectTo: 'install' },
  { path: '**', loadComponent: () => import('./pages/not-found.component').then((m) => m.NotFoundComponent), title: 'Not found' },
];
