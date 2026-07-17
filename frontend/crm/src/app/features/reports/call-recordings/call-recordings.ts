import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CallService } from '../../../core/services/call.service';

type RecordingRow = {
  id: string;
  callId: string | null;
  uuid: string | null;
  callDateTime: string;
  agentName: string;
  agentNumber: string;
  customerNumber: string;
  duration: number;
  status: string;
  callType: string;
  recordingUrl: string;
  reason: string;
};

type AgentOption = {
  id: number;
  name: string;
};

@Component({
  selector: 'app-call-recordings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './call-recordings.html'
})
export class CallRecordingsComponent implements OnInit {
  rows: RecordingRow[] = [];
  agentOptions: AgentOption[] = [];

  isLoading = false;
  hasLoaded = false;
  errorMessage = '';

  searchTerm = '';
  fromDate = '';
  toDate = '';
  selectedAgentId = '';
  callerNumber = '';
  callType = '';
  callStatus = '';
  sortBy = 'callDateTime';
  sortOrder: 'asc' | 'desc' = 'desc';

  currentPage = 1;
  pageSize = 20;
  total = 0;

  selectedRecording: RecordingRow | null = null;

  readonly pageSizeOptions = [10, 20, 50, 100];
  readonly callTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'inbound', label: 'Inbound' },
    { value: 'outbound', label: 'Outbound' }
  ];
  readonly statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'answered', label: 'Answered' },
    { value: 'missed', label: 'Missed' },
    { value: 'failed', label: 'Failed' },
    { value: 'busy', label: 'Busy' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  constructor(private callService: CallService) {}

  ngOnInit(): void {
    const today = this.localISODate(new Date());
    this.fromDate = today;
    this.toDate = today;
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.errorMessage = '';

    const params: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
      fromDate: this.fromDate,
      toDate: this.toDate
    };

    const trimmedSearch = (this.searchTerm || '').trim();
    if (trimmedSearch) params.search = trimmedSearch;
    if (this.selectedAgentId) params.agentId = this.selectedAgentId;
    if ((this.callerNumber || '').trim()) params.callerNumber = this.callerNumber.trim();
    if (this.callType) params.callType = this.callType;
    if (this.callStatus) params.callStatus = this.callStatus;

    this.callService.getCallRecordings(params).subscribe({
      next: (res) => {
        this.rows = res?.data || [];
        this.total = Number(res?.total || 0);
        this.agentOptions = res?.filters?.agents || [];
        this.hasLoaded = true;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load call recordings', err);
        this.rows = [];
        this.total = 0;
        this.agentOptions = err?.error?.filters?.agents || this.agentOptions;
        this.errorMessage = err?.error?.message || 'Failed to load call recordings.';
        this.hasLoaded = true;
        this.isLoading = false;
      }
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.load();
  }

  clearFilters(): void {
    const today = this.localISODate(new Date());
    this.searchTerm = '';
    this.fromDate = today;
    this.toDate = today;
    this.selectedAgentId = '';
    this.callerNumber = '';
    this.callType = '';
    this.callStatus = '';
    this.sortBy = 'callDateTime';
    this.sortOrder = 'desc';
    this.currentPage = 1;
    this.load();
  }

  onSort(field: string): void {
    if (this.sortBy === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortOrder = field === 'callDateTime' ? 'desc' : 'asc';
    }

    this.currentPage = 1;
    this.load();
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.load();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.load();
  }

  openRecording(row: RecordingRow): void {
    if (!row.recordingUrl) return;
    this.selectedRecording = row;
  }

  closeRecording(): void {
    this.selectedRecording = null;
  }

  downloadRecording(row: RecordingRow): void {
    if (!row.recordingUrl) return;
    const anchor = document.createElement('a');
    anchor.href = row.recordingUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.download = `${row.callId || row.id || 'recording'}.mp3`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  formatDuration(seconds: number): string {
    const totalSeconds = Number(seconds || 0);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get pages(): number[] {
    const totalPages = this.totalPages;
    const current = this.currentPage;
    const maxButtons = 7;
    const pages: number[] = [];

    let start = Math.max(1, current - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }

  getSortIcon(field: string): string {
    if (this.sortBy !== field) return 'fa-solid fa-sort text-muted';
    return this.sortOrder === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  private localISODate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
