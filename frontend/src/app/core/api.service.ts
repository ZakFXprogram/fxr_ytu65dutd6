import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  Account, AdminCode, AdminEvent, AdminLicence, AdminMember, AdminOrder, AdminTransfer, ListQuery, Me, MemberDetail, Order, Overview,
  Page, Session, SiteInfo,
} from './models';
import { PANEL_PATH } from './panel';

type Ok = { ok: boolean };
type Done = { done: number };

/** All backend calls. Same origin, so no CORS and the session cookie flows automatically. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  site(): Observable<SiteInfo> { return this.http.get<SiteInfo>('/api/site'); }

  // session
  me(): Observable<Me> { return this.http.get<Me>('/api/auth/me'); }
  logout(): Observable<Ok> { return this.http.post<Ok>('/api/auth/logout', {}); }

  // member
  account(): Observable<Account> { return this.http.get<Account>('/api/account'); }
  newKey(licenceId: string): Observable<{ key: string }> { return this.http.post<{ key: string }>(`/api/account/licences/${licenceId}/key`, {}); }
  moveComputer(licenceId: string): Observable<{ ok: boolean; nextMoveAt: number }> {
    return this.http.post<{ ok: boolean; nextMoveAt: number }>(`/api/account/licences/${licenceId}/move`, {});
  }
  redeem(code: string): Observable<{ plan: string; days: number; expiresAt: number }> {
    return this.http.post<{ plan: string; days: number; expiresAt: number }>('/api/account/redeem', { code });
  }
  syncRole(): Observable<{ result: string }> { return this.http.post<{ result: string }>('/api/account/discord/sync', {}); }
  loaderLink(req: string): Observable<{ allowed: boolean }> { return this.http.post<{ allowed: boolean }>('/api/account/loader-link', { req }); }
  sessions(): Observable<Session[]> { return this.http.get<Session[]>('/api/account/sessions'); }
  revokeSession(id: string): Observable<Ok> { return this.http.post<Ok>('/api/account/sessions/revoke', { id }); }
  revokeOtherSessions(): Observable<{ ok: boolean; ended: number }> { return this.http.post<{ ok: boolean; ended: number }>('/api/account/sessions/revoke-others', {}); }
  createOrder(plan: string, acceptTerms: boolean): Observable<Order> { return this.http.post<Order>('/api/orders', { plan, acceptTerms }); }
  order(id: string): Observable<Order> { return this.http.get<Order>(`/api/orders/${id}`); }
  cancelOrder(id: string): Observable<Order> { return this.http.post<Order>(`/api/orders/${id}/cancel`, {}); }
  claimTx(id: string, txid: string): Observable<Order> { return this.http.post<Order>(`/api/orders/${id}/txid`, { txid }); }

  // owner panel (its path is only known on the panel page)
  private p(path: string): string { return `/api/${PANEL_PATH}/${path}`; }
  private params(q: ListQuery & { tz?: number }): HttpParams {
    let hp = new HttpParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') hp = hp.set(k, String(v));
    return hp;
  }
  overview(tz: number): Observable<Overview> { return this.http.get<Overview>(this.p('overview'), { params: this.params({ tz }) }); }
  orders(q: ListQuery): Observable<Page<AdminOrder>> { return this.http.get<Page<AdminOrder>>(this.p('orders'), { params: this.params(q) }); }
  ordersCsvUrl(q: ListQuery): string { const s = this.params(q).toString(); return this.p('orders.csv') + (s ? '?' + s : ''); }
  recheckOrder(id: string): Observable<{ status: string }> { return this.http.post<{ status: string }>(this.p('orders/recheck'), { id }); }
  markPaid(id: string, note: string): Observable<{ status: string }> { return this.http.post<{ status: string }>(this.p('orders/mark-paid'), { id, note }); }
  cancelOrders(ids: string[]): Observable<Done> { return this.http.post<Done>(this.p('orders/cancel'), { ids }); }
  transfers(q: ListQuery): Observable<Page<AdminTransfer & { id: string }>> {
    return this.http.get<Page<AdminTransfer>>(this.p('transfers'), { params: this.params(q) })
      .pipe(map((p) => ({ ...p, items: p.items.map((t) => ({ ...t, id: t.txid })) })));
  }
  assignTransfer(txid: string, orderId: string): Observable<{ status: string }> { return this.http.post<{ status: string }>(this.p('transfers/assign'), { txid, orderId }); }
  ignoreTransfer(txid: string, note: string): Observable<{ ok: boolean }> { return this.http.post<{ ok: boolean }>(this.p('transfers/ignore'), { txid, note }); }
  licences(q: ListQuery): Observable<Page<AdminLicence>> { return this.http.get<Page<AdminLicence>>(this.p('licences'), { params: this.params(q) }); }
  grant(userId: string, plan: string, days?: number): Observable<{ id: string }> { return this.http.post<{ id: string }>(this.p('licences/grant'), { userId, plan, days }); }
  extend(ids: string[], days: number): Observable<Done> { return this.http.post<Done>(this.p('licences/extend'), { ids, days }); }
  revoke(ids: string[]): Observable<Done> { return this.http.post<Done>(this.p('licences/revoke'), { ids }); }
  resetMachine(id: string): Observable<Ok> { return this.http.post<Ok>(this.p('licences/reset-machine'), { id }); }
  members(q: ListQuery): Observable<Page<AdminMember>> { return this.http.get<Page<AdminMember>>(this.p('members'), { params: this.params(q) }); }
  member(id: string): Observable<MemberDetail> { return this.http.get<MemberDetail>(this.p('members/' + id)); }
  ban(ids: string[], ban: boolean): Observable<Done> { return this.http.post<Done>(this.p(ban ? 'members/ban' : 'members/unban'), { ids }); }
  logoutMember(id: string): Observable<{ ended: number }> { return this.http.post<{ ended: number }>(this.p('members/logout'), { id }); }
  syncMemberRole(id: string): Observable<{ result: string }> { return this.http.post<{ result: string }>(this.p('members/sync-role'), { id }); }
  codes(q: ListQuery): Observable<Page<AdminCode> & { batches: { batch: string; n: number; used: number }[] }> {
    return this.http.get<Page<AdminCode> & { batches: { batch: string; n: number; used: number }[] }>(this.p('codes'), { params: this.params(q) });
  }
  generateCodes(plan: string, count: number, batch: string): Observable<{ codes: string[] }> {
    return this.http.post<{ codes: string[] }>(this.p('codes/generate'), { plan, count, batch });
  }
  disableCodes(ids: string[]): Observable<Done> { return this.http.post<Done>(this.p('codes/disable'), { ids }); }
  events(q: ListQuery): Observable<Page<AdminEvent>> { return this.http.get<Page<AdminEvent>>(this.p('events'), { params: this.params(q) }); }

  // ----- Discord bot (manager migration)
  botStatus(): Observable<BotStatus> { return this.http.get<BotStatus>(this.p('bot/status')); }
  registerCommands(): Observable<{ ok: boolean; count?: number; error?: string }> { return this.http.post<{ ok: boolean; count?: number; error?: string }>(this.p('bot/register-commands'), {}); }
  botPosts(): Observable<BotPost[]> { return this.http.get<BotPost[]>(this.p('bot/posts')); }
  publishPost(postId: string, channelId: string): Observable<{ ok: boolean; messageId: string; edited: boolean }> { return this.http.post<{ ok: boolean; messageId: string; edited: boolean }>(this.p('bot/publish-post'), { postId, channelId }); }
  publishJar(channelId?: string): Observable<{ ok: boolean; messageId: string; version: string }> { return this.http.post<{ ok: boolean; messageId: string; version: string }>(this.p('bot/publish-jar'), { channelId }); }
  runReminders(): Observable<{ ok: boolean; sent?: number; failed?: number; error?: string }> { return this.http.post<{ ok: boolean; sent?: number; failed?: number; error?: string }>(this.p('bot/run-reminders'), {}); }
  setupPreview(): Observable<SetupPlan> { return this.http.get<SetupPlan>(this.p('bot/setup-preview')); }
  setupApply(): Observable<SetupReport> { return this.http.post<SetupReport>(this.p('bot/setup-apply'), {}); }
  createInvite(channelId?: string): Observable<{ ok: boolean; url: string }> { return this.http.post<{ ok: boolean; url: string }>(this.p('bot/create-invite'), { channelId }); }
}

export interface BotStatus {
  botConfigured: boolean;
  appId: boolean;
  publicKey: boolean;
  memberRole: boolean;
  affiliateRole: boolean;
  downloadsChannel: boolean;
  interactionsUrl: string;
  invite: string;
  botInvite: boolean;
}
export interface BotPost {
  id: string;
  title: string;
  posted: { channelId: string; messageId: string; at: number } | null;
}

/** Human-readable message from an API error. */
export function apiError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof HttpErrorResponse) {
    const m = (e.error as { message?: unknown } | null)?.message;
    if (typeof m === 'string' && m && e.status < 500) return m;
    if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
    if (e.status === 502 && typeof m === 'string') return m;
  }
  return fallback;
}

/** Shared date formatting. */
export const fmt = {
  date: (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'),
  dt: (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'),
  ago: (ms: number | null | undefined) => {
    if (!ms) return '—';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  },
  usd: (n: number | string) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
};

export interface SetupRename { id: string; kind: string; from: string; to: string; unknown: string[]; }
export interface SetupPlan {
  renames: SetupRename[];
  untranslated: SetupRename[];
  support: string | null;
  templates: { exists: boolean; name: string; parent: string | null };
}
export interface SetupReport {
  renamed: string[];
  failed: string[];
  untranslated: string[];
  templatesChannel: string | null;
  ticketPanel: string | null;
  postsUpdated: string[];
  jarText: boolean;
  commands: number;
}
