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

  constructor(private fb: FormBuilder, private callService: CallService, private userService: UserService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      orderId: [''],
      startDate: [''],
      endDate: [''],
      agentId: ['']
    });
    this.loadUsers();
    this.search();
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
    const { orderId, startDate, endDate, agentId } = this.form.value;
    this.isLoading = true;
    this.callService.getCalls({
      page: this.currentPage,
      pageSize: this.pageSize,
      orderId: orderId || '',
      hasOrderDetails: true,
      startDate: startDate || '',
      endDate: endDate || '',
      agentId: agentId ? Number(agentId) : undefined,
      sortBy: 'date',
      sortOrder: 'DESC'
    }).subscribe({
      next: (res) => {
        this.results = res.data || [];
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
}