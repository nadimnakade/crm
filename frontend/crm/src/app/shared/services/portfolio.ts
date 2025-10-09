import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth';

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  private apiUrl = `${environment.apiBase}/portfolio`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private getHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  // Overloads to keep backward compatibility
  list(mobile?: string): Observable<{ items: any[]; total?: number; page?: number; pageSize?: number; mode?: string }>;
  list(params?: { mobile?: string; q?: string; page?: number; pageSize?: number; unique?: boolean; groupId?: string; pinCode?: string; from?: string; to?: string }): Observable<{ items: any[]; total?: number; page?: number; pageSize?: number; mode?: string }>;
  list(arg?: string | { mobile?: string; q?: string; page?: number; pageSize?: number; unique?: boolean; groupId?: string; pinCode?: string; from?: string; to?: string }): Observable<{ items: any[]; total?: number; page?: number; pageSize?: number; mode?: string }> {
    const params = typeof arg === 'string' ? { mobile: arg } : (arg || {});
    const qp: string[] = [];
    if (params.mobile) qp.push(`mobile=${encodeURIComponent(params.mobile)}`);
    if (params.q) qp.push(`q=${encodeURIComponent(params.q)}`);
    if (params.page) qp.push(`page=${params.page}`);
    if (params.pageSize) qp.push(`pageSize=${params.pageSize}`);
    if (params.unique) qp.push(`unique=true`);
    if (params.groupId) qp.push(`groupId=${encodeURIComponent(params.groupId)}`);
    if (params.pinCode) qp.push(`pinCode=${encodeURIComponent(params.pinCode)}`);
    if (params.from) qp.push(`from=${encodeURIComponent(params.from)}`);
    if (params.to) qp.push(`to=${encodeURIComponent(params.to)}`);
    const url = qp.length ? `${this.apiUrl}?${qp.join('&')}` : this.apiUrl;
    return this.http.get<{ items: any[]; total?: number; page?: number; pageSize?: number; mode?: string }>(url, { headers: this.getHeaders() });
  }

  // Supports two call styles for backward compatibility:
  // 1) upload({ mobile, ... , files })
  // 2) upload(data, files)
  upload(payloadOrData: any, maybeFiles?: File[]): Observable<{ items: any[] }> {
    const form = new FormData();
    const payload = Array.isArray(maybeFiles)
      ? { ...(payloadOrData || {}), files: maybeFiles }
      : payloadOrData;

    form.append('mobile', payload.mobile || '');
    if (payload.groupId) form.append('groupId', payload.groupId);
    if (payload.name) form.append('name', payload.name);
    if (payload.address) form.append('address', payload.address);
    if (payload.pinCode) form.append('pinCode', payload.pinCode);
    if (payload.skuName) form.append('skuName', payload.skuName);
    if (payload.fileType) form.append('fileType', payload.fileType);
    (payload.files || []).forEach((f: File) => form.append('files', f));
    return this.http.post<{ items: any[] }>(`${this.apiUrl}/upload`, form, { headers: this.getHeaders() });
  }
}