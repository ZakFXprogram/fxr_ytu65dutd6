import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Account, AdminState, Me, Order, SiteInfo } from './models';
import { PANEL_PATH } from './panel';

/** All backend calls. Same origin, so no CORS and the session cookie flows automatically. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  site(): Observable<SiteInfo> { return this.http.get<SiteInfo>('/api/site'); }

  // session
  me(): Observable<Me> { return this.http.get<Me>('/api/auth/me'); }
  logout(): Observable<{ ok: boolean }> { return this.http.post<{ ok: boolean }>('/api/auth/logout', {}); }

  // member
  account(): Observable<Account> { return this.http.get<Account>('/api/account'); }
  newKey(licenceId: string): Observable<{ key: string }> {
    return this.http.post<{ key: string }>(`/api/account/licences/${licenceId}/key`, {});
  }
  moveComputer(licenceId: string): Observable<{ ok: boolean; nextMoveAt: number }> {
    return this.http.post<{ ok: boolean; nextMoveAt: number }>(`/api/account/licences/${licenceId}/move`, {});
  }
  createOrder(plan: string): Observable<Order> { return this.http.post<Order>('/api/orders', { plan }); }
  order(id: string): Observable<Order> { return this.http.get<Order>(`/api/orders/${id}`); }
  submitTxid(id: string, txid: string): Observable<Order> { return this.http.post<Order>(`/api/orders/${id}/txid`, { txid }); }
  cancelOrder(id: string): Observable<Order> { return this.http.post<Order>(`/api/orders/${id}/cancel`, {}); }

  // owner panel (path only known on the panel page)
  private panel(p: string): string { return `/api/${PANEL_PATH}/${p}`; }
  adminState(): Observable<AdminState> { return this.http.get<AdminState>(this.panel('state')); }
  adminConfirm(id: string): Observable<Order> { return this.http.post<Order>(this.panel('orders/confirm'), { id }); }
  adminReject(id: string, note: string): Observable<Order> { return this.http.post<Order>(this.panel('orders/reject'), { id, note }); }
  adminGrant(userRef: string, plan: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(this.panel('licences/create'), { userRef, plan });
  }
  adminRevoke(id: string): Observable<{ ok: boolean }> { return this.http.post<{ ok: boolean }>(this.panel('licences/revoke'), { id }); }
  adminResetMachine(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(this.panel('licences/reset-machine'), { id });
  }
  adminBan(id: string, ban: boolean): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(this.panel(ban ? 'members/ban' : 'members/unban'), { id });
  }
  adminLogoutMember(id: string): Observable<{ ok: boolean }> { return this.http.post<{ ok: boolean }>(this.panel('members/logout'), { id }); }
}

/** Human-readable message from an API error. */
export function apiError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof HttpErrorResponse) {
    const m = (e.error as { message?: unknown } | null)?.message;
    if (typeof m === 'string' && e.status < 500) return m;
    if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  }
  return fallback;
}
