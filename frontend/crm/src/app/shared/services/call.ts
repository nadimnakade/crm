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
}
