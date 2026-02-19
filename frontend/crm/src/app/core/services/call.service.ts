import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CallService {
  private apiUrl = `${environment.apiBase}/calls`;

  constructor(private http: HttpClient) { }

  // Get all calls
  getCalls(params?: any): Observable<any> {
    return this.http.get(this.apiUrl, { params });
  }

  // Get call by ID
  getCallById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  // Create new call
  createCall(callData: any): Observable<any> {
    return this.http.post(this.apiUrl, callData);
  }

  // Update call
  updateCall(id: string, callData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, callData);
  }

  // Delete call
  deleteCall(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Get active follow-ups
  getFollowUps(params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/followups`, { params });
  }

  // Get uploaded follow-ups (from file upload)
  getUploadedFollowUps(params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/followups/uploaded`, { params });
  }

  // Upload follow-ups
  uploadFollowUps(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/followups/upload`, formData);
  }

  // Update follow-up status
  updateFollowUpStatus(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/followup-status`, data);
  }

  // Upload medicine list
  uploadMedicineList(id: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('medicineList', file);
    return this.http.post(`${this.apiUrl}/${id}/upload/medicine`, formData);
  }

  // Upload prescription
  uploadPrescription(id: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('prescription', file);
    return this.http.post(`${this.apiUrl}/${id}/upload/prescription`, formData);
  }

  // Upload additional document
  uploadDocument(id: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('document', file);
    return this.http.post(`${this.apiUrl}/${id}/upload/document`, formData);
  }

  // List uploaded files for a call
  getCallFiles(id: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${id}/files`);
  }

  // Get status history for a call
  getCallHistory(id: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${id}/history`);
  }

  // Get due follow-ups
  getDueFollowUps(all: boolean = false): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/follow-ups/due?all=${all}`);
  }
}
