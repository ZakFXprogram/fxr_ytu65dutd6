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
export type OrderStatus = 'pending' | 'confirming' | 'paid' | 'partially_paid' | 'review' | 'failed' | 'expired' | 'cancelled' | 'refunded';
/** Where and how much to pay: USDT on TRON straight to the owner's wallet. */
export interface PayInfo { address: string; amount: string; network: string; token: string; contract: string; }
export interface Order {
  id: string; plan: string; planLabel: string; amount: string; currency: string; status: OrderStatus;
  createdAt: number; expiresAt: number; paidAt: number | null;
  pay: PayInfo | null; txid: string | null; received: string | null; canClaim: boolean;
}
export interface Activity { at: number; kind: string; text: string; }
export interface Account {
  licences: MyLicence[];
  orders: Order[];
  discord: { invite: string; roleSync: boolean; roleGranted: boolean; inServer: boolean | null };
  activity: Activity[];
}
export interface Session { id: string; current: boolean; device: string; createdAt: number; lastSeenAt: number; expiresAt: number; }

// ---------- owner panel
export interface Page<T> { items: T[]; total: number; page: number; size: number; }
export interface ListQuery { q?: string; status?: string; plan?: string; filter?: string; kind?: string; batch?: string; sort?: string; page?: number; size?: number; }
export interface Overview {
  revenue: { today: number; last30: number; total: number; orders30: number };
  days: { day: number; amount: number; orders: number }[];
  stats: { activeLicences: number; lifetime: number; expiring7: number; members: number; newMembers7: number; attention: number; unmatched: number; inProgress: number; unusedCodes: number };
  planMix: { plan: string; count: number }[];
  checkout: {
    provider: string; configured: boolean; payCurrency: string; address: string | null; sources: string[]; windowMinutes: number;
    lastOkAt: number | null; lastError: string | null; lastErrorAt: number | null; addressChangedAt: number | null;
  };
  roleSync: boolean;
}
export interface AdminOrder {
  id: string; userId: string; userName: string | null; plan: string; planLabel: string; amount: string; status: OrderStatus;
  expected: string | null; received: string | null; txid: string | null; claimedTxid: string | null; payer: string | null;
  paidTxAt: number | null; expiresAt: number; note: string | null; createdAt: number; updatedAt: number; paidAt: number | null; decidedBy: string | null;
}
/** A USDT transfer seen on the blockchain, matched to an order or waiting for the owner. */
export interface AdminTransfer {
  txid: string; from: string | null; amount: string; paidAt: number; status: 'matched' | 'unmatched' | 'ignored';
  orderId: string | null; note: string | null; seenAt: number; decidedBy: string | null;
}
export interface AdminLicence {
  id: string; userId: string; userName: string | null; plan: string; planLabel: string; status: string; lifetime: boolean;
  startedAt: number; expiresAt: number; activated: boolean; keySet: boolean; lastSeenAt: number | null; source: string; role: boolean;
}
export interface AdminMember {
  id: string; name: string; username: string; avatarUrl: string | null; banned: boolean; owner: boolean; spent: number; orders: number;
  licences: number; activeUntil: number | null; role: boolean; inServer: boolean | null; joinedAt: number; lastLoginAt: number;
}
export interface MemberDetail {
  user: { id: string; name: string; username: string; avatarUrl: string | null; banned: boolean; owner: boolean; joinedAt: number; lastLoginAt: number; role: boolean; inServer: boolean | null };
  spent: number;
  licences: AdminLicence[];
  orders: AdminOrder[];
  sessions: { device: string; lastSeenAt: number; createdAt: number; owner: boolean }[];
  codes: { hint: string; plan: string; days: number; usedAt: number }[];
  events: Activity[];
}
export interface AdminCode {
  id: string; hint: string; plan: string; days: number; status: string; batch: string | null; createdAt: number;
  usedBy: string | null; usedByName: string | null; usedAt: number | null;
}
export interface AdminEvent { id: number; at: number; kind: string; text: string; userId: string | null; userName: string | null; }
