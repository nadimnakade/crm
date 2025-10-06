import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private apiUrl = `${environment.apiBase}/customers`;

  constructor(private http: HttpClient) { }

  // Get all customers
  getCustomers(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  // Get customer by ID
  getCustomerById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  // Create new customer
  createCustomer(customer: any): Observable<any> {
    return this.http.post(this.apiUrl, customer);
  }

  // Update customer
  updateCustomer(id: string, customer: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, customer);
  }

  // Delete customer
  deleteCustomer(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}