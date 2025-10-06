import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CallService } from '../../../core/services/call.service';
import { CustomerService } from '../../../core/services/customer.service';

@Component({
  selector: 'app-call-list',
  templateUrl: './call-list.component.html',
  styleUrls: ['./call-list.scss'],
  standalone:false
})
export class CallListComponent implements OnInit {
  calls = [];
  customers = {};
  isLoading = true;
  searchTerm = '';

  constructor(
    private callService: CallService,
    private customerService: CustomerService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadCustomers();
    this.loadCalls();
  }

  loadCustomers(): void {
    this.customerService.getCustomers().subscribe(
      data => {
        // Create a map of customer IDs to customer objects for quick lookup
        this.customers = data.reduce((map: { [key: string]: any }, customer) => {
          map[customer.id] = customer;
          return map;
        }, {});
      },
      error => {
        console.error('Error loading customers', error);
      }
    );
  }

  loadCalls(): void {
    this.isLoading = true;
    this.callService.getCalls().subscribe(
      data => {
        this.calls = data;
        this.isLoading = false;
      },
      error => {
        console.error('Error loading calls', error);
        this.isLoading = false;
      }
    );
  }

  getCustomerName(customerId: number): string {
    const customer = this.customers[customerId];
    return customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown';
  }

  viewCallDetails(callId: number): void {
    this.router.navigate(['/calls', callId]);
  }

  viewOrderDetails(callId: number): void {
    // Navigate to order details view
    this.router.navigate(['/calls', callId], { queryParams: { tab: 'order' } });
  }

  viewHistory(callId: number): void {
    // Navigate to call detail and focus status history section
    this.router.navigate(['/calls', callId], { fragment: 'history' });
  }

  viewFiles(callId: number): void {
    // Navigate to call detail and focus attachments section
    this.router.navigate(['/calls', callId], { fragment: 'attachments' });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'new': return 'badge bg-info';
      case 'in-progress': return 'badge bg-warning';
      case 'completed': return 'badge bg-success';
      case 'scheduled': return 'badge bg-primary';
      case 'missed': return 'badge bg-danger';
      case 'cancelled': return 'badge bg-secondary';
      default: return 'badge bg-light';
    }
  }

  filterCalls(): any[] {
    if (!this.searchTerm) return this.calls;

    const term = this.searchTerm.toLowerCase();
    return this.calls.filter((call: any) => {
      const customer = this.customers[call.customerId];
      const customerName = customer ? `${customer.firstName} ${customer.lastName}`.toLowerCase() : '';

      return (
        (call.orderId && call.orderId.toLowerCase().includes(term)) ||
        (call.mobileNo && call.mobileNo.toLowerCase().includes(term)) ||
        (call.address && call.address.toLowerCase().includes(term)) ||
        customerName.includes(term)
      );
    });
  }
}
