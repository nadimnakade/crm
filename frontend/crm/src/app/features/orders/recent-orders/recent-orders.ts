import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CallService } from '../../../shared/services/call';
import { AuthService } from '../../../shared/auth/auth';

@Component({
  selector: 'app-recent-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './recent-orders.html',
  styleUrls: []
})
export class RecentOrdersComponent implements OnInit {
  Math = Math;
  isElevated = false; // admin/superadmin/orders viewer
  isAgentRole = false; // agents get masked phones
  page = 1;
  pageSize = 10;
  total = 0;
  sortBy: string = 'createdAt';
  sortOrder: 'ASC' | 'DESC' = 'DESC';
  search: string = '';
  agentId: number | null = null;
  date: string = ''; // YYYY-MM-DD; empty means today

  rows: Array<any> = [];
  users: Array<any> = [];

  constructor(private calls: CallService, private auth: AuthService) {}

  ngOnInit(): void {
    const user = this.auth.getUser();
    const role = (user?.role || '').toLowerCase();
    // Elevated roles can search/filter by agent: admin, superadmin, manager, vieworder
    this.isElevated = ['admin','superadmin','manager','vieworder'].includes(role);
    this.isAgentRole = role === 'agent';
    this.load();
  }

  load(): void {
    const params: any = { page: this.page, pageSize: this.pageSize, sortBy: this.sortBy, sortOrder: this.sortOrder };
    if (this.search) params.search = this.search;
    if (this.isElevated && this.agentId) params.agentId = this.agentId;
    if (this.date) params.date = this.date; // filter by selected date
    this.calls.getRecentOrderDetails(params).subscribe({
      next: (res) => {
        this.rows = res.data || [];
        this.total = res.total || 0;
      },
      error: (err) => {
        console.error('Failed to load recent orders', err);
        this.rows = [];
        this.total = 0;
      }
    });
  }

  setPageSize(size: string): void { this.pageSize = Number(size) || 10; this.page = 1; this.load(); }
  setPage(delta: number): void { const max = Math.max(1, Math.ceil(this.total / this.pageSize)); this.page = Math.min(Math.max(1, this.page + delta), max); this.load(); }
  changeSort(by: string): void { if (this.sortBy === by) this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC'; else { this.sortBy = by; this.sortOrder = 'DESC'; } this.page = 1; this.load(); }
  onSearchInput(event: any): void { this.search = (event?.target?.value || '').trim(); this.page = 1; this.load(); }
  onDateChange(event: any): void { this.date = (event?.target?.value || '').trim(); this.page = 1; this.load(); }

  displayPhone(phone: string | undefined | null): string {
    const raw = (phone || '').replace(/[^0-9]/g, '');
    if (!raw) return '';
    if (!this.isAgentRole) return raw; // show full for non-agent roles
    if (raw.length <= 4) return '****';
    // Mask middle digits: keep first 2 and last 2
    return `${raw.slice(0, 2)}${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-2)}`;
  }
}
