import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SiteInfo, LicenceStatus, AdminState } from './models';

/** All backend calls. Same origin, so no CORS and cookies flow automatically. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  site(): Observable<SiteInfo> { return this.http.get<SiteInfo>('/api/site'); }
  licenceStatus(key: string): Observable<LicenceStatus> {
    return this.http.post<LicenceStatus>('/api/licence/status', { key });
  }

  adminMe(): Observable<{ authenticated: boolean }> { return this.http.get<{ authenticated: boolean }>('/api/admin/me'); }
  adminLogin(user: string, password: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>('/api/admin/login', { user, password });
  }
  adminLogout(): Observable<{ ok: boolean }> { return this.http.post<{ ok: boolean }>('/api/admin/logout', {}); }
  adminState(): Observable<AdminState> { return this.http.get<AdminState>('/api/admin/state'); }
  adminCreate(userRef: string, plan: string, days?: number): Observable<{ id: string; key: string }> {
    return this.http.post<{ id: string; key: string }>('/api/admin/licences/create', { userRef, plan, days });
  }
  adminRevoke(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>('/api/admin/licences/revoke', { id });
  }
  adminResetMachine(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>('/api/admin/licences/reset-machine', { id });
  }
}
