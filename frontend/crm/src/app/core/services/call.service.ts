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
  getCalls(): Observable<any> {
    return this.http.get(this.apiUrl);
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
}