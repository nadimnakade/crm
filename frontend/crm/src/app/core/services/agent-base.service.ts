import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../shared/auth/auth';

export interface AgentBase {
  id: number;
  agentId?: number;
  lastOrderDate?: string;
  followUpDate?: string;
  customerPhone?: string;
  orderCount?: number;
  customerName?: string;
  orderId?: string;
  payableAmount?: number;
  agentName?: string;
  team?: string;
  agent?: {
    firstName: string;
    lastName: string;
  };
}

export interface AgentBaseResponse {
  rows: AgentBase[];
  count: number;
  page: number;
  pageSize: number;
}

@Injectable({
  providedIn: 'root'
})
export class AgentBaseService {
  private apiUrl = `${environment.apiBase}/agent-base`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  getAgentBase(params: any): Observable<AgentBaseResponse> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<AgentBaseResponse>(this.apiUrl, { 
      headers: this.getHeaders(),
      params: httpParams 
    });
  }

  uploadAgentBase(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/upload`, formData, {
      headers: new HttpHeaders({
        'Authorization': `Bearer ${this.authService.getToken()}`
      })
    });
  }

  exportAgentBase(params: any): Observable<Blob> {
    let httpParams = new HttpParams().set('export', 'true');
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get(this.apiUrl, { 
      headers: this.getHeaders(),
      params: httpParams, 
      responseType: 'blob' 
    });
  }
}
