import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomerMedicineDetailService {
  private baseUrl = `${environment.apiBase}/customer-medicine-details`;

  constructor(private http: HttpClient) {}

  list(params: { page: number; pageSize: number; sortBy: string; sortOrder: string; q?: string; mobile?: string; unique?: boolean }): Observable<any> {
    let hp = new HttpParams()
      .set('page', String(params.page))
      .set('pageSize', String(params.pageSize))
      .set('sortBy', params.sortBy)
      .set('sortOrder', params.sortOrder);
    if (params.q) hp = hp.set('q', params.q);
    if (params.mobile) hp = hp.set('mobile', params.mobile);
    if (params.unique) hp = hp.set('unique', 'true');
    return this.http.get<any>(this.baseUrl, { params: hp });
  }

  upload(fd: FormData): Observable<any> {
    const headers = new HttpHeaders({}); // let browser set multipart boundaries
    return this.http.post<any>(`${this.baseUrl}/upload`, fd, { headers });
  }
}