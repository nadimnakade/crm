import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomerMedicineDetailService {
  private baseUrl = `${environment.apiBase}/customer-medicine-details`;

  constructor(private http: HttpClient) {}

  list(params: { pageSize: number; cursorId?: number | null; q?: string; mobile?: string; unique?: boolean; uniqueBy?: string }, options?: { skipLoader?: boolean }): Observable<any> {
    let hp = new HttpParams()
      .set('pageSize', String(params.pageSize));
    if (params.cursorId !== undefined && params.cursorId !== null) hp = hp.set('cursorId', String(params.cursorId));
    if (params.q) hp = hp.set('q', params.q);
    if (params.mobile) hp = hp.set('mobile', params.mobile);
    if (params.unique) hp = hp.set('unique', 'true');
    if (params.uniqueBy) hp = hp.set('uniqueBy', params.uniqueBy);
    const headers = options?.skipLoader ? new HttpHeaders({ 'X-Skip-Loading': '1' }) : undefined;
    return this.http.get<any>(this.baseUrl, { params: hp, headers });
  }

  upload(fd: FormData): Observable<any> {
    const headers = new HttpHeaders({}); // let browser set multipart boundaries
    return this.http.post<any>(`${this.baseUrl}/upload`, fd, { headers });
  }

  // Export filtered data as Excel (Blob)
  export(params: { q?: string; mobile?: string; unique?: boolean; groupId?: string; pinCode?: string; from?: string; to?: string; limit?: number }): Observable<Blob> {
    let hp = new HttpParams();
    if (params.q) hp = hp.set('q', params.q);
    if (params.mobile) hp = hp.set('mobile', params.mobile);
    if (params.unique) hp = hp.set('unique', 'true');
    if (params.groupId) hp = hp.set('groupId', params.groupId);
    if (params.pinCode) hp = hp.set('pinCode', params.pinCode);
    if (params.from) hp = hp.set('from', params.from);
    if (params.to) hp = hp.set('to', params.to);
    if (params.limit) hp = hp.set('limit', String(params.limit));
    return this.http.get(`${this.baseUrl}/export`, { params: hp, responseType: 'blob' });
  }
}
