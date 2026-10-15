import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home.component').then((m) => m.HomeComponent), title: 'FXR OrderFlow — Order flow for MotiveWave' },
  { path: 'studies', loadComponent: () => import('./pages/studies.component').then((m) => m.StudiesComponent), title: 'Studies — FXR OrderFlow' },
  { path: 'pricing', loadComponent: () => import('./pages/pricing.component').then((m) => m.PricingComponent), title: 'Pricing — FXR OrderFlow' },
  { path: 'install', loadComponent: () => import('./pages/install.component').then((m) => m.InstallComponent), title: 'Install — FXR OrderFlow' },
  { path: 'licence', loadComponent: () => import('./pages/licence.component').then((m) => m.LicenceComponent), title: 'My licence — FXR OrderFlow' },
  { path: 'faq', loadComponent: () => import('./pages/faq.component').then((m) => m.FaqComponent), title: 'FAQ — FXR OrderFlow' },
  { path: 'legal/:doc', loadComponent: () => import('./pages/legal.component').then((m) => m.LegalComponent), title: 'Legal — FXR OrderFlow' },
  { path: 'admin', loadComponent: () => import('./pages/admin.component').then((m) => m.AdminComponent), title: 'Admin — FXR OrderFlow' },
  { path: '**', loadComponent: () => import('./pages/not-found.component').then((m) => m.NotFoundComponent), title: 'Not found' },
];
