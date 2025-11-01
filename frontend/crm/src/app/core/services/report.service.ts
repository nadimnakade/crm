import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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
}