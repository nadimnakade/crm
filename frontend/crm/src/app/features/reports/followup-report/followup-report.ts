import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CallService } from '../../../shared/services/call';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../shared/auth/auth';

@Component({
  selector: 'app-followup-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './followup-report.html',
  styleUrls: []
})
export class FollowupReportComponent implements OnInit {
  loading = false;
  error: string | null = null;
  data: any[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  sortBy = 'followUpDate';
  sortOrder: 'ASC' | 'DESC' = 'ASC';

  fromDate: string = '';
  toDate: string = '';

  isManagerOrAdmin = false;
  requestedAgentId?: number;
  isAgentRole = false;

  Math = Math;

  exporting = false;

  constructor(private callSvc: CallService, private auth: AuthService, private reportSvc: ReportService) {}

  private localISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  ngOnInit(): void {
    const user = this.auth.getUser();
    const role = (user?.role || '').toLowerCase();
    // Allow manager, admin, superadmin, and vieworder to see full controls
    this.isManagerOrAdmin = ['manager','admin','superadmin','vieworder'].includes(role);
    this.isAgentRole = role === 'agent';
    const today = new Date();
    const todayStr = this.localISODate(today);
    // Elevated roles: default to no date filter (show all)
     this.fromDate = todayStr;
      this.toDate = todayStr;
    this.load();
  }

  load(): void {
    this.setLoading(true);
    this.error = null;
    this.callSvc.getFollowupReport({ page: this.page, pageSize: this.pageSize, sortBy: this.sortBy, sortOrder: this.sortOrder, agentId: this.requestedAgentId, from: this.fromDate, to: this.toDate })
      .subscribe({
        next: (res: any) => {
          this.data = res.data || [];
          this.total = res.total || 0;
          this.setLoading(false);
        },
        error: (err) => {
          console.error('Followup report load failed', err);
          this.error = 'Failed to load followup report';
          this.setLoading(false);
        }
      });
  }

  setPage(dir: number): void {
    const last = Math.max(1, Math.ceil(this.total / this.pageSize));
    const next = dir < 0 ? Math.max(1, this.page - 1) : Math.min(last, this.page + 1);
    if (next !== this.page) {
      this.page = next;
      this.load();
    }
  }

  gotoPage(p: number): void {
    const last = Math.max(1, Math.ceil(this.total / this.pageSize));
    const clamped = Math.max(1, Math.min(last, p));
    if (clamped !== this.page) {
      this.page = clamped;
      this.load();
    }
  }

  get pageNumbers(): number[] {
    const last = Math.max(1, Math.ceil(this.total / this.pageSize));
    const windowSize = 5;
    let start = Math.max(1, this.page - 2);
    let end = Math.min(last, start + windowSize - 1);
    // Adjust start if we are at the end
    start = Math.max(1, end - windowSize + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    // If total pages small, show all
    if (last <= windowSize) {
      return Array.from({ length: last }, (_, i) => i + 1);
    }
    return pages;
  }

  setQuickRange(range: 'today'|'7days'|'1month'): void {
    const base = new Date();
    const from = new Date(base);
    let to = new Date(base);
    if (range === 'today') {
      // Same day
      this.fromDate = this.localISODate(from);
      this.toDate = this.localISODate(from);
    } else if (range === '7days') {
      to.setDate(base.getDate() + 7);
      this.fromDate = this.localISODate(from);
      this.toDate = this.localISODate(to);
    } else if (range === '1month') {
      to.setMonth(base.getMonth() + 1);
      this.fromDate = this.localISODate(from);
      this.toDate = this.localISODate(to);
    }
    this.page = 1;
    this.load();
  }

  setSort(field: string): void {
    if (this.sortBy === field) {
      this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortBy = field;
      this.sortOrder = 'ASC';
    }
    this.load();
  }

  async export(): Promise<void> {
    if (this.exporting) return;
    this.exporting = true;
    try {
      const from = this.fromDate || undefined;
      const to = this.toDate || undefined;

      const blob = await (await import('rxjs')).firstValueFrom(
        this.reportSvc.exportFollowups({ from, to, limit: 10000, format: 'xlsx' })
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'followups.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Followups export failed', err);
      alert('Export failed or not authorized. Please ensure admin access.');
    } finally {
      this.exporting = false;
    }
  }

  private setLoading(state: boolean): void {
    this.loading = state;
  }

  displayPhone(phone: string | undefined | null): string {
    const raw = (phone || '').replace(/[^0-9]/g, '');
    if (!raw) return '';
    if (!this.isAgentRole) return raw;
    if (raw.length <= 4) return '****';
    return `${raw.slice(0, 2)}${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-2)}`;
  }
}
