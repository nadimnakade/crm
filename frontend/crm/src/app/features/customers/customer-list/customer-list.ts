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
  // Keyset pagination state
  cursorId: number | null = null;
  nextCursor: number | null = null;
  hasMore: boolean = false;
  cursorStack: (number | null)[] = [];
  // Sorting removed; backend enforces id DESC for performance
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
    this.customerService.searchCustomers('', this.page, this.pageSize, this.statusFilter, 'createdAt', 'DESC', this.cursorId || undefined).subscribe({
      next: (resp) => {
        this.customers = resp.data;
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = 1;
        this.pageSize = resp.pageSize;
        this.hasMore = !!resp.hasMore;
        this.nextCursor = (resp.nextCursor ?? null);
        this.computeStatusOptions(resp.data);
      },
      error: (error) => {
        console.error('Error loading customers', error);
      }
    });
  }

  filterCustomers(resetPage: boolean = false): void {
    const term = (this.searchTerm || '').trim();
    if (resetPage) {
      this.page = 1;
      this.cursorId = null;
      this.cursorStack = [];
    }
    this.customerService.searchCustomers(term, this.page, this.pageSize, this.statusFilter, 'createdAt', 'DESC', this.cursorId || undefined).subscribe({
      next: resp => {
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = (this.cursorStack.length + 1);
        this.pageSize = resp.pageSize;
        this.hasMore = !!resp.hasMore;
        this.nextCursor = (resp.nextCursor ?? null);
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
    if (!this.hasMore) return;
    // push current cursor to stack for back navigation
    this.cursorStack.push(this.cursorId);
    this.cursorId = this.nextCursor || null;
    this.customerService.searchCustomers(term, this.page, this.pageSize, this.statusFilter, 'createdAt', 'DESC', this.cursorId || undefined).subscribe({
      next: resp => {
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = (this.cursorStack.length + 1);
        this.pageSize = resp.pageSize;
        this.hasMore = !!resp.hasMore;
        this.nextCursor = (resp.nextCursor ?? null);
      },
      error: err => console.error('Pagination next failed', err)
    });
  }

  prevPage(): void {
    const term = (this.searchTerm || '').trim();
    if (this.cursorStack.length === 0) return;
    // pop previous cursor and fetch
    this.cursorId = this.cursorStack.pop() ?? null;
    this.customerService.searchCustomers(term, this.page, this.pageSize, this.statusFilter, 'createdAt', 'DESC', this.cursorId || undefined).subscribe({
      next: resp => {
        this.filteredCustomers = resp.data;
        this.total = resp.total;
        this.page = (this.cursorStack.length + 1);
        this.pageSize = resp.pageSize;
        this.hasMore = !!resp.hasMore;
        this.nextCursor = (resp.nextCursor ?? null);
      },
      error: err => console.error('Pagination prev failed', err)
    });
  }

  onPageSizeChange(): void {
    this.filterCustomers(true);
  }

  onStatusChange(): void {
    this.filterCustomers(true);
  }

  // Sorting disabled

  firstPage(): void {
    if (this.page === 1) return;
    this.cursorId = null;
    this.cursorStack = [];
    this.filterCustomers(true);
  }

  // Removed page number logic for keyset pagination

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
