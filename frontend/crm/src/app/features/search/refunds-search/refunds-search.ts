import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CallService } from '../../../shared/services/call';
import { UserService } from '../../../shared/services/user';

@Component({
  selector: 'app-refunds-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './refunds-search.html',
  styleUrls: [],
})
export class RefundsSearchComponent implements OnInit {
  form!: FormGroup;
  results: any[] = [];
  total = 0;
  isLoading = false;
  selectedCall: any | null = null;
  currentPage = 1;
  pageSize = 10;
  users: any[] = [];
  // Upload state
  selectedUploadFile: File | null = null;
  uploadInProgress = false;
  uploadMessage = '';
  uploadedDocumentUrl: string | null = null;

  statuses = [
    { value: '', label: 'All' },
    { value: 'refund-generation', label: 'Refund Generation' },
    { value: 'refund-status', label: 'Refund Status' }
  ];

  constructor(private fb: FormBuilder, private callService: CallService, private userService: UserService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      status: [''],
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
    const { status, startDate, endDate, agentId } = this.form.value;
    this.isLoading = true;
    this.callService.getCalls({
      page: this.currentPage,
      pageSize: this.pageSize,
      status: status || '',
      hasRefundDetails: true,
      startDate: startDate || '',
      endDate: endDate || '',
      agentId: agentId ? Number(agentId) : undefined,
      sortBy: 'date',
      sortOrder: 'DESC'
    }).subscribe({
      next: (res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        // Normalize JSON-like fields coming from MSSQL as NVARCHAR
        this.results = data.map((r: any) => ({
          ...r,
          orderDetails: typeof r.orderDetails === 'string' ? this.parseJSON(r.orderDetails) : r.orderDetails,
          refundDetails: typeof r.refundDetails === 'string' ? this.parseJSON(r.refundDetails) : r.refundDetails
        }));
        this.total = res.total || 0;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Refund search failed', err);
        this.isLoading = false;
      }
    });
  }

  view(call: any): void {
    this.selectedCall = call;
    this.selectedUploadFile = null;
    this.uploadInProgress = false;
    this.uploadMessage = '';
    this.uploadedDocumentUrl = null;
  }

  closeModal(): void {
    this.selectedCall = null;
    this.selectedUploadFile = null;
    this.uploadInProgress = false;
    this.uploadMessage = '';
    this.uploadedDocumentUrl = null;
  }

  totalPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  setPage(page: number): void {
    const max = this.totalPages();
    this.currentPage = Math.min(Math.max(1, page), max);
    this.search();
  }

  onRefundDocSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files && input.files.length ? input.files[0] : null;
    this.selectedUploadFile = file;
  }

  uploadRefundDoc(): void {
    if (!this.selectedCall || !this.selectedUploadFile) return;
    const id = this.getCallId(this.selectedCall);
    if (!id) return;
    this.uploadInProgress = true;
    this.uploadMessage = '';
    this.callService.uploadDocument(id, this.selectedUploadFile).subscribe({
      next: (res) => {
        this.uploadInProgress = false;
        this.uploadMessage = 'Document uploaded successfully';
        const filePath = res?.filePath || '';
        this.uploadedDocumentUrl = filePath || null;
        // Optionally refresh attachments list later via getCallFiles
      },
      error: (err) => {
        console.error('Upload failed', err);
        this.uploadInProgress = false;
        this.uploadMessage = 'Error uploading document';
        this.uploadedDocumentUrl = null;
      }
    });
  }

  private getCallId(call: any): number | null {
    const id = call?.id ?? call?.Id ?? call?.ID;
    return typeof id === 'number' ? id : (id ? Number(id) : null);
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

  formatValue(value: any): string {
    if (value === null || value === undefined) return '—';
    if (Array.isArray(value)) return value.map(v => this.formatValue(v)).join(', ');
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  }
}