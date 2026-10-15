export interface Plan {
  id: string; label: string; price: number; days: number;
  lifetime: boolean; perMonth: number | null; checkoutUrl: string;
}
export interface SiteInfo {
  name: string; company: string; discord: string; support: string; plans: Plan[];
}
export interface LicenceStatus {
  found: boolean; plan?: string; status?: string; expiresAt?: number;
  lifetime?: boolean; activated?: boolean;
}
export interface AdminLicence {
  id: string; userRef: string; plan: string; status: string; lifetime: boolean;
  expiresAt: number; activated: boolean; lastSeenAt: number | null; source: string;
  createdAt: number; active: boolean;
}
export interface AdminState {
  stats: { total: number; active: number; expiringSoon: number };
  plans: { id: string; label: string; days: number }[];
  licences: AdminLicence[];
  events: { ts_ms: number; kind: string; text: string }[];
}
