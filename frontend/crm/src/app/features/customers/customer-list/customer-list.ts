import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../shared/services/customer';
import { ActivatedRoute } from '@angular/router';
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
  
  constructor(
    private customerService: CustomerService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // Do not auto-load customers; require mobile digit search
    this.filteredCustomers = [];
    this.customers = [];
    this.total = 0;
    this.hasMore = false;
    this.cursorId = null;
    this.nextCursor = null;
    this.cursorStack = [];

    // Deep-link support: /customers?mobile=XXXXXXXXXX or /customers?q=XXXXXXXXXX
    const qp = this.route.snapshot.queryParamMap;
    const mobile = (qp.get('mobile') || qp.get('q') || '').trim();
    const digits = mobile.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 10) {
      this.searchTerm = digits;
      this.filterCustomers(true);
    }
  }

  loadCustomers(): void {
    // Intentionally left blank per requirement: no default listing
    this.filteredCustomers = [];
    this.total = 0;
    this.hasMore = false;
    this.nextCursor = null;
    this.computeStatusOptions([]);
  }

  filterCustomers(resetPage: boolean = false): void {
    const raw = (this.searchTerm || '').trim();
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    if (resetPage) {
      this.page = 1;
      this.cursorId = null;
      this.cursorStack = [];
    }
    // Enforce exactly 10-digit mobile search
    if (digits.length !== 10) {
      this.filteredCustomers = [];
      this.total = 0;
      this.hasMore = false;
      this.nextCursor = null;
      this.computeStatusOptions([]);
      this.searchTerm = digits; // reflect sanitized input
      return;
    }
    this.searchTerm = digits;
    this.customerService.searchCustomers(digits, this.page, this.pageSize, this.statusFilter, 'createdAt', 'DESC', this.cursorId || undefined).subscribe({
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
        const lower = digits.toLowerCase();
        this.filteredCustomers = this.customers.filter(customer => {
          return (customer.phone || '').toLowerCase().includes(lower);
        });
        this.total = this.filteredCustomers.length;
      }
    });
  }

  nextPage(): void {
    const digits = (this.searchTerm || '').trim().replace(/\D/g, '').slice(0, 10);
    if (digits.length !== 10) return;
    if (!this.hasMore) return;
    // push current cursor to stack for back navigation
    this.cursorStack.push(this.cursorId);
    this.cursorId = this.nextCursor || null;
    this.customerService.searchCustomers(digits, this.page, this.pageSize, this.statusFilter, 'createdAt', 'DESC', this.cursorId || undefined).subscribe({
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
    const digits = (this.searchTerm || '').trim().replace(/\D/g, '').slice(0, 10);
    if (digits.length !== 10) return;
    if (this.cursorStack.length === 0) return;
    // pop previous cursor and fetch
    this.cursorId = this.cursorStack.pop() ?? null;
    this.customerService.searchCustomers(digits, this.page, this.pageSize, this.statusFilter, 'createdAt', 'DESC', this.cursorId || undefined).subscribe({
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
    const term = (this.searchTerm || '').trim().replace(/\D/g, '');
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
