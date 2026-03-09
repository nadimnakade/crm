import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CallService {
  private apiUrl = `${environment.apiBase}/calls`;
  private smartfloUrl = `${environment.apiBase}/smartflo`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  getCalls(params?: {
    page?: number;
    pageSize?: number;
    searchTerm?: string;
    status?: string;
    type?: string; // maps to callType
    customerId?: number;
    agentId?: number;
    orderId?: string;
    hasOrderDetails?: boolean;
    hasRefundDetails?: boolean;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Observable<{ data: any[]; total: number; page: number; pageSize: number }> {
    return this.http.get<{ data: any[]; total: number; page: number; pageSize: number }>(
      this.apiUrl,
      { headers: this.getHeaders(), params: params as any }
    );
  }

  getCall(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  createCall(call: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, call, { headers: this.getHeaders() });
  }

  updateCall(id: number, call: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, call, { headers: this.getHeaders() });
  }

  deleteCall(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  // Dashboard analytics endpoints
  getRecentCalls(limit: number = 10): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/recent`, {
      headers: this.getHeaders(),
      params: { limit }
    });
  }

  getTopCallersDaily(date?: string, limit: number = 10): Observable<any[]> {
    const params: any = { limit };
    if (date) params.date = date;
    return this.http.get<any[]>(`${this.apiUrl}/top-callers/daily`, {
      headers: this.getHeaders(),
      params
    });
  }

  getTopCallersWeekly(startDate?: string, endDate?: string, limit: number = 10): Observable<any[]> {
    const params: any = { limit };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return this.http.get<any[]>(`${this.apiUrl}/top-callers/weekly`, {
      headers: this.getHeaders(),
      params
    });
  }

  // Recent order details (by date, default today)
  getRecentOrderDetails(params?: { page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'ASC'|'DESC'; search?: string; agentId?: number; date?: string }): Observable<{ data: any[]; total: number; page: number; pageSize: number }> {
    const q: any = {};
    if (params?.page) q.page = String(params.page);
    if (params?.pageSize) q.pageSize = String(params.pageSize);
    if (params?.sortBy) q.sortBy = params.sortBy;
    if (params?.sortOrder) q.sortOrder = params.sortOrder;
    if (params?.search) q.search = params.search;
    if (params?.agentId) q.agentId = String(params.agentId);
    if (params?.date) q.date = params.date;
    
    return this.http.get<{ data: any[]; total: number; page: number; pageSize: number }>(
      `${this.apiUrl}/recent-order-details`,
      { headers: this.getHeaders(), params: q }
    );
  }

  getDueFollowUps(limitOrShowAll: number | boolean = 5, options?: { skipLoader?: boolean }): Observable<any[]> {
    let limit = 5;
    let showAll = false;
    
    if (typeof limitOrShowAll === 'boolean') {
      showAll = limitOrShowAll;
      limit = 100; // Default limit when showing all, or we can remove limit
    } else {
      limit = limitOrShowAll;
    }

    const headers = options?.skipLoader ? this.getHeaders().set('X-Skip-Loading', '1') : this.getHeaders();
    
    // Check if we need to use the 'all' param like core service or stick to existing
    // If showAll is true, we might want to pass a param to backend
    const params: any = { limit };
    if (showAll) {
      params.all = 'true';
    }

    return this.http.get<any[]>(`${this.apiUrl}/follow-ups/due`, {
      headers,
      params
    });
  }

  getRecentOrderCount(startDate?: string, endDate?: string, options?: { skipLoader?: boolean }): Observable<{ total: number }> {
    const headers = options?.skipLoader ? this.getHeaders().set('X-Skip-Loading', '1') : this.getHeaders();
    const params: any = {};
    if (startDate) params.date = startDate; // Backend expects 'date', not 'startDate'
    // endDate is ignored by backend currently as it only supports single date, but keeping arg for future
    
    return this.http.get<{ total: number }>(`${this.apiUrl}/orders/recent/count`, {
      headers,
      params
    });
  }

  getCallFiles(id: number | string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${id}/files`, { headers: this.getHeaders() });
  }

  getCustomerStatusHistory(customerId: number): Observable<{ data: any[] }> {
    return this.http.get<{ data: any[] }>(`${this.apiUrl}/customer/${customerId}/status-history`, {
      headers: this.getHeaders()
    });
  }

  // Smartflo Click-to-Call
  initiateSmartfloCall(fromNumber: string, toNumber: string): Observable<any> {
    return this.http.post<any>(
      `${this.smartfloUrl}/click-to-call`,
      { from: fromNumber, to: toNumber },
      { headers: this.getHeaders() }
    );
  }

  getFollowupReport(params: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    from?: string;
    to?: string;
    agentId?: number;
    export?: string;
    search?: string;
  }): Observable<{ data: any[]; total: number } | Blob> {
    if (params.export === 'true') {
      return this.http.get(
        `${this.apiUrl}/orders/followups`,
        { headers: this.getHeaders(), params: params as any, responseType: 'blob' }
      );
    }
    return this.http.get<{ data: any[]; total: number }>(
      `${this.apiUrl}/orders/followups`,
      { headers: this.getHeaders(), params: params as any }
    );
  }

  uploadDocument(id: number | string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('document', file);
    const token = this.authService.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    return this.http.post(`${this.apiUrl}/${id}/upload/document`, formData, { headers });
  }
}
