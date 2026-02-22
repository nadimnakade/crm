import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private apiUrl = `${environment.apiBase}/orders`;

  constructor(private http: HttpClient) {}

  uploadOrders(file: File, orderType?: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (orderType) {
      formData.append('orderType', orderType);
    }
    return this.http.post(`${this.apiUrl}/uploadOrders`, formData);
  }

  downloadTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/template`, { responseType: 'blob' });
  }

  getReorders(params?: { page?: number; pageSize?: number; from?: string; to?: string; search?: string }): Observable<any> {
    const q: any = {};
    if (params?.page) q.page = String(params.page);
    if (params?.pageSize) q.pageSize = String(params.pageSize);
    if (params?.from) q.from = params.from;
    if (params?.to) q.to = params.to;
    if (params?.search) q.search = params.search;
    return this.http.get<any>(`${this.apiUrl}/reorders`, { params: q });
  }

  getReordersCount(from?: string, to?: string, options?: { skipLoader?: boolean }): Observable<{ count: number }> {
    const headers = options?.skipLoader ? new HttpHeaders({ 'X-Skip-Loading': '1' }) : undefined;
    const params: any = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return this.http.get<{ count: number }>(`${this.apiUrl}/reorders/count`, { headers, params });
  }

  getUploadedOrders(params?: { from?: string; to?: string; page?: number; pageSize?: number }): Observable<{ data: any[]; total: number; page: number; pageSize: number }> {
    const q: any = {};
    if (params?.from) q.from = params.from;
    if (params?.to) q.to = params.to;
    if (params?.page) q.page = String(params.page);
    if (params?.pageSize) q.pageSize = String(params.pageSize);
    return this.http.get<{ data: any[]; total: number; page: number; pageSize: number }>(`${this.apiUrl}/uploaded`, { params: q });
  }

  updateOrderStatus(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/status`, data);
  }
}
