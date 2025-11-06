import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CallService } from '../../../shared/services/call';
import { UserService } from '../../../shared/services/user';

@Component({
  selector: 'app-orders-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './orders-search.html',
  styleUrls: [],
})
export class OrdersSearchComponent implements OnInit {
  form!: FormGroup;
  results: any[] = [];
  total = 0;
  isLoading = false;
  selectedCall: any | null = null;
  currentPage = 1;
  pageSize = 10;
  users: any[] = [];
  hasSearched = false;

  constructor(private fb: FormBuilder, private callService: CallService, private userService: UserService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      orderId: [''],
      mobileNo: [''],
      startDate: [''],
      endDate: [''],
      agentId: ['']
    });
    this.loadUsers();
    // Do NOT auto-search; require explicit input
  }

  loadUsers(): void {
    this.userService.getUsers().subscribe({
      next: (data) => {
        this.users = Array.isArray(data) ? data : [];
      },
      error: (err) => {
        console.error('Failed to load users for agent filter', err);
      }
    });
  }

  search(): void {
    const { orderId, mobileNo, startDate, endDate, agentId } = this.form.value;
    const mobileDigits = (mobileNo || '').replace(/[^0-9]/g, '');
    const hasOrderId = !!(orderId && orderId.trim());
    const hasMobile = /^[0-9]{10}$/.test(mobileDigits);

    // Require either OrderId or 10-digit mobile to search
    if (!hasOrderId && !hasMobile) {
      this.hasSearched = true;
      this.results = [];
      this.total = 0;
      return; // do not hit API
    }

    this.isLoading = true;
    this.hasSearched = true;

    const params: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      hasOrderDetails: true,
      startDate: startDate || '',
      endDate: endDate || '',
      agentId: agentId ? Number(agentId) : undefined,
      sortBy: 'date',
      sortOrder: 'DESC'
    };

    if (hasOrderId) params.orderId = orderId.trim();
    if (hasMobile) params.searchTerm = mobileDigits; // backend matches on customer phone digits

    this.callService.getCalls(params).subscribe({
      next: (res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        // Normalize NVARCHAR JSON fields coming from MSSQL
        this.results = data.map((r: any) => ({
          ...r,
          orderDetails: typeof r.orderDetails === 'string' ? this.parseJSON(r.orderDetails) : r.orderDetails
        }));
        this.total = res.total || 0;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Order search failed', err);
        this.isLoading = false;
      }
    });
  }

  view(call: any): void {
    this.selectedCall = call;
  }

  closeModal(): void {
    this.selectedCall = null;
  }

  totalPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  setPage(page: number): void {
    const max = this.totalPages();
    this.currentPage = Math.min(Math.max(1, page), max);
    this.search();
  }
  changePageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.search();
  }

  customerName(call: any): string {
    const c = call?.Customer || call?.customer; // handle casing
    if (!c) return '';
    return `${c.firstName || ''} ${c.lastName || ''}`.trim();
  }

  customerAddress(call: any): string {
    const c = call?.Customer || call?.customer;
    return c?.address || '';
  }

  customerPhone(call: any): string {
    const c = call?.Customer || call?.customer;
    return c?.phone || '';
  }

  private parseJSON(value: any): any {
    if (!value) return undefined;
    if (typeof value !== 'string') return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}