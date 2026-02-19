import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CallService } from '../../../core/services/call.service';
import { FollowupStatusDialogComponent } from '../followup-status-dialog';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-followup-uploaded-list',
  standalone: true,
  imports: [CommonModule, FormsModule, FollowupStatusDialogComponent],
  templateUrl: './followup-uploaded-list.html'
})
export class FollowupUploadedListComponent implements OnInit {
  rows: any[] = [];
  isLoading = false;
  searchTerm: string = '';
  fromDate: string = '';
  toDate: string = '';
  selectedFollowup: any = null;

  currentPage = 1;
  pageSize = 20;
  total = 0;

  constructor(private callService: CallService, private router: Router) {}

  ngOnInit(): void {
    const today = new Date();
    const iso = this.localISODate(today);
    this.fromDate = iso;
    this.toDate = iso;
    this.load();
  }

  load(): void {
    this.isLoading = true;
    const params: any = {
      page: this.currentPage,
      pageSize: this.pageSize
    };
    const trimmed = (this.searchTerm || '').trim();
    if (trimmed) {
      params.search = trimmed;
    }
    if (this.fromDate) params.from = this.fromDate;
    if (this.toDate) params.to = this.toDate;

    this.callService.getUploadedFollowUps(params).subscribe({
      next: (res) => {
        this.rows = res?.data || [];
        this.total = res?.total || 0;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading uploaded followups', err);
        this.isLoading = false;
      }
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.load();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.currentPage = 1;
    this.load();
  }

  onDateChange(): void {
    this.currentPage = 1;
    this.load();
  }

  openStatusDialog(row: any): void {
    this.selectedFollowup = row;
  }

  onDialogSave(event: any): void {
    if (!this.selectedFollowup) return;
    this.callService.updateFollowUpStatus(this.selectedFollowup.id, event).subscribe({
      next: () => {
        Swal.fire('Success', 'Follow-up status updated', 'success');
        const wasOrder = event.status === 'Order';
        const customerId = this.selectedFollowup.customerId;
        this.selectedFollowup = null;
        this.load();
        if (wasOrder && customerId) {
          this.router.navigate(['/customers', customerId]);
        }
      },
      error: () => {
        Swal.fire('Error', 'Failed to update status', 'error');
      }
    });
  }

  onDialogCancel(): void {
    this.selectedFollowup = null;
  }

  private localISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get pages(): number[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const maxButtons = 7;
    const pages: number[] = [];
    let start = Math.max(1, current - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;
    if (end > total) {
      end = total;
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.load();
  }
}
