import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CallService } from '../../../shared/services/call';
import { AuthService } from '../../../shared/auth/auth';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

@Component({
  selector: 'app-today-followups',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './today-followups.html'
})
export class TodayFollowupsComponent implements OnInit {
  loading = false;
  error: string | null = null;
  data: any[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  searchQuery = '';
  private searchSubject = new Subject<string>();

  isManagerOrAdmin = false;
  exporting = false;

  Math = Math;

  constructor(
    private callSvc: CallService,
    private auth: AuthService
  ) {
    this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(query => {
      this.searchQuery = query;
      this.page = 1;
      this.load();
    });
  }

  private localISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  ngOnInit(): void {
    const user = this.auth.getUser();
    const role = (user?.role || '').toLowerCase();
    this.isManagerOrAdmin = ['manager','admin','superadmin'].includes(role);
    if (!this.isManagerOrAdmin) {
      this.error = 'Not authorized to view today\'s follow-ups summary.';
      return;
    }
    this.load();
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchSubject.next(input.value);
  }

  load(): void {
    if (!this.isManagerOrAdmin) return;
    this.loading = true;
    this.error = null;

    const today = new Date();
    const todayStr = this.localISODate(today);

    this.callSvc.getFollowupReport({
      page: this.page,
      pageSize: this.pageSize,
      sortBy: 'followUpDate',
      sortOrder: 'ASC',
      from: todayStr,
      to: todayStr,
      search: this.searchQuery
    }).subscribe({
      next: (res: any) => {
        this.data = res.data || [];
        this.total = res.total || 0;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load today\'s follow-ups.';
        this.loading = false;
      }
    });
  }

  exportToday(): void {
    const today = new Date();
    const todayStr = this.localISODate(today);
    this.exporting = true;
    
    this.callSvc.getFollowupReport({
      from: todayStr,
      to: todayStr,
      export: 'true',
      search: this.searchQuery
    }).subscribe({
      next: (blob: any) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Followups-${todayStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.exporting = false;
      },
      error: (err) => {
        console.error('Export failed', err);
        this.exporting = false;
        alert('Failed to export data');
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
    start = Math.max(1, end - windowSize + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    if (last <= windowSize) {
      return Array.from({ length: last }, (_, i) => i + 1);
    }
    return pages;
  }
}
