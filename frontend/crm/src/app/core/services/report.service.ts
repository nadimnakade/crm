import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private apiUrl = `${environment.apiBase}/reports`;

  constructor(private http: HttpClient) {}

  exportInteractions(options: {
    from?: string;
    to?: string;
    customerId?: number | null;
    agentId?: number | null;
    limit?: number;
    format?: 'xlsx' | 'csv';
  }): Observable<Blob> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.customerId != null) params = params.set('customerId', String(options.customerId));
    if (options.agentId != null) params = params.set('agentId', String(options.agentId));
    if (options.limit != null) params = params.set('limit', String(options.limit));
    params = params.set('format', options.format || 'xlsx');

    return this.http.get(`${this.apiUrl}/interactions/export`, {
      params,
      responseType: 'blob'
    });
  }

  exportOrders(options: {
    from?: string;
    to?: string;
    limit?: number;
    format?: 'xlsx' | 'csv';
  }): Observable<Blob> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.limit != null) params = params.set('limit', String(options.limit));
    params = params.set('format', options.format || 'xlsx');

    return this.http.get(`${this.apiUrl}/orders/export`, {
      params,
      responseType: 'blob'
    });
  }

  exportFollowups(options: {
    from?: string;
    to?: string;
    limit?: number;
    format?: 'xlsx' | 'csv';
  }): Observable<Blob> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.limit != null) params = params.set('limit', String(options.limit));
    params = params.set('format', options.format || 'xlsx');

    return this.http.get(`${this.apiUrl}/followups/export`, {
      params,
      responseType: 'blob'
    });
  }

  getFollowupStatusUpdates(options: {
    from?: string;
    to?: string;
    limit?: number;
  }): Observable<{ data: any[]; total: number }> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.limit != null) params = params.set('limit', String(options.limit));

    return this.http.get<{ data: any[]; total: number }>(`${this.apiUrl}/followup-updates`, {
      params
    });
  }

  getReorderStatusUpdates(options: {
    from?: string;
    to?: string;
    limit?: number;
  }): Observable<{ data: any[]; total: number }> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.limit != null) params = params.set('limit', String(options.limit));

    return this.http.get<{ data: any[]; total: number }>(`${this.apiUrl}/reorder-updates`, {
      params
    });
  }

  getFollowupCountsHierarchy(options: {
    from?: string;
    to?: string;
  }): Observable<any[]> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);

    return this.http.get<any[]>(`${this.apiUrl}/followup-counts-hierarchy`, {
      params
    });
  }

  exportFollowupStatusUpdates(options: {
    from?: string;
    to?: string;
    limit?: number;
    format?: 'xlsx' | 'csv';
  }): Observable<Blob> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.limit != null) params = params.set('limit', String(options.limit));
    params = params.set('format', options.format || 'xlsx');

    return this.http.get(`${this.apiUrl}/followup-updates/export`, {
      params,
      responseType: 'blob'
    });
  }

  exportReorderStatusUpdates(options: {
    from?: string;
    to?: string;
    limit?: number;
    format?: 'xlsx' | 'csv';
  }): Observable<Blob> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.limit != null) params = params.set('limit', String(options.limit));
    params = params.set('format', options.format || 'xlsx');

    return this.http.get(`${this.apiUrl}/reorder-updates/export`, {
      params,
      responseType: 'blob'
    });
  }

  getOrderStatusUpdates(options: {
    from?: string;
    to?: string;
    status?: string;
    limit?: number;
  }): Observable<{ data: any[]; total: number }> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.status) params = params.set('status', options.status);
    if (options.limit != null) params = params.set('limit', String(options.limit));

    return this.http.get<{ data: any[]; total: number }>(`${this.apiUrl}/order-status`, {
      params
    });
  }

  exportOrderStatusUpdates(options: {
    from?: string;
    to?: string;
    status?: string;
    limit?: number;
    format?: 'xlsx' | 'csv';
  }): Observable<Blob> {
    let params = new HttpParams();
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    if (options.status) params = params.set('status', options.status);
    if (options.limit != null) params = params.set('limit', String(options.limit));
    params = params.set('format', options.format || 'xlsx');

    return this.http.get(`${this.apiUrl}/order-status/export`, {
      params,
      responseType: 'blob'
    });
  }

  getFollowupReportExportUrl(from?: string, to?: string, agentId?: number): string {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    if (agentId) params = params.set('agentId', agentId.toString());

    return `${this.apiUrl}/followups/export?${params.toString()}`;
  }

  getTopAgents(options?: { skipLoader?: boolean }): Observable<any[]> {
    const headers = options?.skipLoader ? new HttpHeaders({ 'X-Skip-Loading': '1' }) : undefined;
    return this.http.get<any[]>(`${this.apiUrl}/top-agents`, { headers });
  }

  getActiveUsers(options?: { skipLoader?: boolean }): Observable<any[]> {
    const headers = options?.skipLoader ? new HttpHeaders({ 'X-Skip-Loading': '1' }) : undefined;
    return this.http.get<any[]>(`${this.apiUrl}/active-users`, { headers });
  }

  getWeeklyOrderStats(options?: { skipLoader?: boolean }): Observable<any[]> {
    const headers = options?.skipLoader ? new HttpHeaders({ 'X-Skip-Loading': '1' }) : undefined;
    return this.http.get<any[]>(`${this.apiUrl}/weekly-orders`, { headers });
  }

  getCallOutcomeStats(options?: { skipLoader?: boolean }): Observable<any[]> {
    const headers = options?.skipLoader ? new HttpHeaders({ 'X-Skip-Loading': '1' }) : undefined;
    return this.http.get<any[]>(`${this.apiUrl}/call-outcomes`, { headers });
  }
}
