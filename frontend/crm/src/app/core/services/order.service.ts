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

  getReorders(page: number = 1, pageSize: number = 10): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/reorders?page=${page}&pageSize=${pageSize}`);
  }

  getReordersCount(options?: { skipLoader?: boolean }): Observable<{ count: number }> {
    const headers = options?.skipLoader ? new HttpHeaders({ 'X-Skip-Loading': '1' }) : undefined;
    return this.http.get<{ count: number }>(`${this.apiUrl}/reorders/count`, { headers });
  }

  getUploadedOrders(date?: string): Observable<any[]> {
    let params = {};
    if (date) {
      params = { date };
    }
    return this.http.get<any[]>(`${this.apiUrl}/uploaded`, { params });
  }

  updateOrderStatus(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/status`, data);
  }
}
