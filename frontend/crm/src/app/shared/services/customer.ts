import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private apiUrl = `${environment.apiBase}/customers`;

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

  getCustomers(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl, { headers: this.getHeaders() });
  }

  searchCustomers(
    q: string,
    page = 1,
    pageSize = 10,
    status: string = '',
    sortBy: string = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC'
  ): Observable<{ data: any[]; total: number; page: number; pageSize: number }> {
    return this.http.get<{ data: any[]; total: number; page: number; pageSize: number }>(this.apiUrl, {
      headers: this.getHeaders(),
      params: { q, page, pageSize, status, sortBy, sortOrder }
    });
  }

  getCustomer(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  createCustomer(customer: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, customer, { headers: this.getHeaders() });
  }

  updateCustomer(id: number, customer: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, customer, { headers: this.getHeaders() });
  }

  deleteCustomer(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  // Attachments APIs
  uploadCustomerFiles(id: number, files: File[], fileType?: string): Observable<{ files: any[] }> {
    const token = this.authService.getToken();
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    if (fileType) form.append('fileType', fileType);
    return this.http.post<{ files: any[] }>(`${this.apiUrl}/${id}/files`, form, {
      headers: new HttpHeaders({ 'Authorization': `Bearer ${token}` })
    });
  }

  getCustomerFiles(id: number): Observable<{ files: { filename: string; url: string }[] }> {
    return this.http.get<{ files: { filename: string; url: string }[] }>(`${this.apiUrl}/${id}/files`, {
      headers: this.getHeaders()
    });
  }

  deleteCustomerFile(id: number, filename: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}/files/${encodeURIComponent(filename)}`, {
      headers: this.getHeaders()
    });
  }
}
