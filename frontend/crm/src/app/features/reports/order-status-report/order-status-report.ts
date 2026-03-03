import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../shared/auth/auth';

@Component({
  selector: 'app-order-status-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './order-status-report.html'
})
export class OrderStatusReportComponent implements OnInit {
  fromDate: string = '';
  toDate: string = '';
  status: string = '';
  loading = false;
  error: string | null = null;
  data: any[] = [];

  search: string = '';
  page = 1;
  pageSize = 20;
  total = 0;

  isAllowedRole = false;
   canExport = false;

  statuses: string[] = ['Ringing', 'Follow-up', 'Order Created', 'Reorder', 'Not Interested'];

  Math = Math;

  constructor(
    private reportSvc: ReportService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.auth.getUser();
    const role = (user?.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'superadmin';
    const isManager = role === 'manager';
    const isOrdersViewer = role === 'orders viewer' || role === 'vieworder';
    const isAgent = role === 'agent';

    this.isAllowedRole = isAdmin || isManager || isOrdersViewer || isAgent;
    this.canExport = isAdmin || isManager || isOrdersViewer;
    if (!this.isAllowedRole) {
      this.error = 'Not authorized to view order status report.';
      this.router.navigate(['/dashboard']);
      return;
    }

    const today = new Date();
    const todayStr = this.localISODate(today);
    this.fromDate = todayStr;
    this.toDate = todayStr;
    this.load();
  }

  private localISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  setRange(days: number): void {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - days + 1);
    this.fromDate = this.localISODate(from);
    this.toDate = this.localISODate(now);
    this.load();
  }

  load(): void {
    if (!this.isAllowedRole) return;
    if (!this.fromDate || !this.toDate) return;
    this.loading = true;
    this.error = null;
    this.reportSvc.getOrderStatusUpdates({
      from: this.fromDate,
      to: this.toDate,
      status: this.status || undefined,
      limit: 1000
    }).subscribe({
      next: (res) => {
        this.data = res.data || [];
        this.total = res.total || this.data.length;
        this.page = 1;
        this.loading = false;
      },
      error: (err) => {
        console.error('Order status report load failed', err);
        this.error = 'Failed to load order status report.';
        this.loading = false;
      }
    });
  }

  get filteredRows(): any[] {
    const term = (this.search || '').trim().toLowerCase();
    if (!term) {
      return this.data;
    }
    return this.data.filter(r => {
      const values = [
        r.ChangedAt,
        r.AgentName,
        r.ChangedBy,
        r.PreviousStatus,
        r.NewStatus,
        r.OrderId,
        r.CustomerName,
        r.CustomerMobileNo
      ];
      return values
        .filter(v => v !== undefined && v !== null)
        .some(v => String(v).toLowerCase().includes(term));
    });
  }

  get pagedRows(): any[] {
    const rows = this.filteredRows;
    const start = (this.page - 1) * this.pageSize;
    return rows.slice(start, start + this.pageSize);
  }

  pageChanged(page: number): void {
    if (page < 1) return;
    const maxPage = Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
    if (page > maxPage) return;
    this.page = page;
  }

  exportExcel(): void {
    if (!this.fromDate || !this.toDate) return;
    this.loading = true;
    this.reportSvc.exportOrderStatusUpdates({
      from: this.fromDate,
      to: this.toDate,
      status: this.status || undefined,
      limit: 10000,
      format: 'xlsx'
    }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'order-status-updates.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        this.loading = false;
      },
      error: (err) => {
        console.error('Order status report export failed', err);
        this.error = 'Failed to export order status report.';
        this.loading = false;
      }
    });
  }
}
