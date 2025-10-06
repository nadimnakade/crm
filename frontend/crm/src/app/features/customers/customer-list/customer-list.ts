import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../shared/services/customer';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './customer-list.html',
  styleUrls: ['./customer-list.scss']
})
export class CustomerListComponent implements OnInit {
  customers: any[] = [];
  filteredCustomers: any[] = [];
  searchTerm: string = '';
  
  constructor(private customerService: CustomerService) { }

  ngOnInit(): void {
    this.loadCustomers();
  }

  loadCustomers(): void {
    this.customerService.getCustomers().subscribe({
      next: (data) => {
        this.customers = data;
        this.filteredCustomers = data;
      },
      error: (error) => {
        console.error('Error loading customers', error);
      }
    });
  }

  filterCustomers(): void {
    if (!this.searchTerm) {
      this.filteredCustomers = this.customers;
      return;
    }
    
    const term = this.searchTerm.toLowerCase();
    this.filteredCustomers = this.customers.filter(customer => {
      const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim().toLowerCase();
      return (
        fullName.includes(term) ||
        (customer.email || '').toLowerCase().includes(term) ||
        (customer.company || '').toLowerCase().includes(term)
      );
    });
  }

  deleteCustomer(id: number): void {
    if (confirm('Are you sure you want to delete this customer?')) {
      this.customerService.deleteCustomer(id).subscribe({
        next: () => {
          this.customers = this.customers.filter(customer => customer.id !== id);
          this.filterCustomers();
        },
        error: (error) => {
          console.error('Error deleting customer', error);
        }
      });
    }
  }
}
