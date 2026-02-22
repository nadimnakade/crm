import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../shared/auth/auth';

@Component({
  selector: 'app-reorder-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reorder-history.html'
})
export class ReorderHistoryComponent implements OnInit {
  fromDate: string = '';
  toDate: string = '';
  loading = false;
  error: string | null = null;
  data: any[] = [];

  isAllowedRole = false;

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
    if (!this.isAllowedRole) {
      this.error = 'Not authorized to view reorder history.';
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
    this.reportSvc.getReorderStatusUpdates({
      from: this.fromDate,
      to: this.toDate,
      limit: 1000
    }).subscribe({
      next: (res) => {
        this.data = res.data || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Reorder history load failed', err);
        this.error = 'Failed to load reorder history.';
        this.loading = false;
      }
    });
  }
}

