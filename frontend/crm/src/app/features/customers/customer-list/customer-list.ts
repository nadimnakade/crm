import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../shared/services/customer';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

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
  page: number = 1;
  pageSize: number = 10;
  total: number = 0;
  sortBy: string = 'createdAt';
  sortOrder: 'ASC' | 'DESC' = 'DESC';
  statusFilter: string = '';
  statusOptions: string[] = [];
  // Expose Math for template usage (e.g., Math.min)
  public Math = Math;
  
  constructor(private customerService: CustomerService, private sanitizer: DomSanitizer) { }

  ngOnInit(): void {
    this.loadCustomers();
  }

  loadCustomers(): void {
    // Load initial page without filter
    this.customerService.searchCustomers('', this.page, this.pageSize, this.statusFilter, this.sortBy, this.sortOrder).subscribe({
      next: (resp) => {
        this.customers = resp.data;
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = resp.page;
        this.pageSize = resp.pageSize;
        this.computeStatusOptions(resp.data);
      },
      error: (error) => {
        console.error('Error loading customers', error);
      }
    });
  }

  filterCustomers(): void {
    const term = (this.searchTerm || '').trim();
    // Reset to first page on new search input
    this.page = 1;
    this.customerService.searchCustomers(term, this.page, this.pageSize, this.statusFilter, this.sortBy, this.sortOrder).subscribe({
      next: resp => {
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = resp.page;
        this.pageSize = resp.pageSize;
        this.computeStatusOptions(resp.data);
      },
      error: err => {
        console.error('Search failed, falling back to client filter', err);
        const lower = term.toLowerCase();
        this.filteredCustomers = this.customers.filter(customer => {
          const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim().toLowerCase();
          return (
            fullName.includes(lower) ||
            (customer.phone || '').toLowerCase().includes(lower)
          );
        });
        this.total = this.filteredCustomers.length;
      }
    });
  }

  nextPage(): void {
    const term = (this.searchTerm || '').trim();
    const maxPage = Math.ceil(this.total / this.pageSize) || 1;
    if (this.page >= maxPage) return;
    this.page += 1;
    this.customerService.searchCustomers(term, this.page, this.pageSize, this.statusFilter, this.sortBy, this.sortOrder).subscribe({
      next: resp => {
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = resp.page;
        this.pageSize = resp.pageSize;
      },
      error: err => console.error('Pagination next failed', err)
    });
  }

  prevPage(): void {
    const term = (this.searchTerm || '').trim();
    if (this.page <= 1) return;
    this.page -= 1;
    this.customerService.searchCustomers(term, this.page, this.pageSize, this.statusFilter, this.sortBy, this.sortOrder).subscribe({
      next: resp => {
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = resp.page;
        this.pageSize = resp.pageSize;
      },
      error: err => console.error('Pagination prev failed', err)
    });
  }

  onPageSizeChange(): void {
    this.page = 1;
    this.filterCustomers();
  }

  onStatusChange(): void {
    this.page = 1;
    this.filterCustomers();
  }

  setSort(column: string): void {
    if (this.sortBy === column) {
      this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortBy = column;
      this.sortOrder = 'ASC';
    }
    this.page = 1;
    this.filterCustomers();
  }

  private computeStatusOptions(rows: any[]): void {
    const set = new Set<string>();
    rows.forEach(r => { if (r.status) set.add(r.status); });
    this.statusOptions = Array.from(set).sort();
  }

  highlight(text: string | undefined | null): SafeHtml {
    const term = (this.searchTerm || '').trim();
    const source = (text || '').toString();
    if (!term) return source;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    const html = source.replace(re, (match) => `<mark>${match}</mark>`);
    return this.sanitizer.bypassSecurityTrustHtml(html);
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
