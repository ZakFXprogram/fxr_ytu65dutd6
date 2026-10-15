export interface Plan {
  id: string; label: string; price: number; days: number;
  lifetime: boolean; perMonth: number | null;
}
export interface SiteInfo {
  name: string; company: string; discord: string; support: string; paymentsOpen: boolean; plans: Plan[];
}

export interface PublicUser { id: string; name: string; username: string; avatarUrl: string | null; }
export interface Me {
  authenticated: boolean;
  user?: PublicUser;
  admin?: boolean;
  adminMfaRequired?: boolean;
}

export interface MyLicence {
  id: string; plan: string; planLabel: string; status: string; lifetime: boolean; expiresAt: number;
  activated: boolean; keySetAt: number; canMove: boolean; nextMoveAt: number;
}
export interface Order {
  id: string; plan: string; planLabel: string; amount: string; token: string; network: string; payTo: string;
  status: 'pending' | 'submitted' | 'paid' | 'rejected' | 'expired' | 'cancelled';
  txid: string | null; note: string | null;
  createdAt: number; expiresAt: number; submittedAt: number | null; decidedAt: number | null;
}
export interface Account { licences: MyLicence[]; orders: Order[]; }

export interface AdminOrder extends Order { userId: string; userName: string | null; }
export interface AdminLicence {
  id: string; userRef: string; userName: string | null; plan: string; status: string; lifetime: boolean;
  expiresAt: number; activated: boolean; keySet: boolean; lastSeenAt: number | null; source: string; createdAt: number;
}
export interface AdminMember {
  id: string; name: string; username: string; banned: boolean; licences: number; lastLoginAt: number; owner: boolean;
}
export interface AdminState {
  payAddress: string;
  usdtContract: string;
  stats: { total: number; active: number; expiringSoon: number; toCheck: number; members: number };
  plans: { id: string; label: string; days: number; price: number }[];
  orders: AdminOrder[];
  licences: AdminLicence[];
  members: AdminMember[];
  events: { ts_ms: number; kind: string; text: string }[];
}
