import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CallService } from '../../../core/services/call.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../shared/services/user';
import { FollowupStatusDialogComponent } from '../followup-status-dialog';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-important-calls',
  standalone: true,
  imports: [CommonModule, FormsModule, FollowupStatusDialogComponent],
  templateUrl: './important-calls.html'
})
export class ImportantCallsComponent implements OnInit {
  rows: any[] = [];
  isLoading = false;
  exporting = false;
  searchTerm = '';
  fromDate = '';
  toDate = '';
  selectedFollowup: any = null;

  currentPage = 1;
  pageSize = 20;
  total = 0;

  isAdmin = false;
  showTransferModal = false;
  selectedFollowupForTransfer: any = null;
  agents: any[] = [];
  selectedAgentId = '';
  callingIds = new Set<number>();
  deletingIds = new Set<number>();

  constructor(
    private callService: CallService,
    private router: Router,
    private authService: AuthService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    const today = new Date();
    const iso = this.localISODate(today);
    this.fromDate = iso;
    this.toDate = iso;
    this.load();
    this.initRoleAndAgents();
  }

  private initRoleAndAgents(): void {
    const role = this.authService.getUser()?.role?.toLowerCase();
    this.isAdmin = role === 'admin' || role === 'super admin' || role === 'superadmin';
    if (this.isAdmin) {
      this.userService.getUsers().subscribe({
        next: (data) => {
          this.agents = data || [];
        },
        error: (err) => {
          console.error('Failed to load agents', err);
        }
      });
    }
  }

  load(): void {
    this.isLoading = true;
    const params: any = {
      page: this.currentPage,
      pageSize: this.pageSize
    };
    const trimmed = (this.searchTerm || '').trim();
    if (trimmed) params.search = trimmed;
    if (this.fromDate) params.from = this.fromDate;
    if (this.toDate) params.to = this.toDate;

    this.callService.getImportantCalls(params).subscribe({
      next: (res) => {
        this.rows = res?.data || [];
        this.total = res?.total || 0;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading important calls', err);
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

  deleteRow(row: any): void {
    if (!this.isAdmin || !row?.id || this.deletingIds.has(row.id)) return;
    Swal.fire({
      title: 'Delete uploaded row?',
      text: 'This removes the uploaded important call record permanently.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete'
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.deletingIds.add(row.id);
      this.callService.deleteCall(String(row.id)).subscribe({
        next: () => {
          this.deletingIds.delete(row.id);
          Swal.fire('Deleted', 'Uploaded record deleted successfully', 'success');
          this.load();
        },
        error: (err) => {
          console.error('Delete failed', err);
          this.deletingIds.delete(row.id);
          Swal.fire('Error', 'Failed to delete uploaded record', 'error');
        }
      });
    });
  }

  export(): void {
    if (this.exporting) return;
    const params: any = {};
    const trimmed = (this.searchTerm || '').trim();
    if (trimmed) params.search = trimmed;
    if (this.fromDate) params.from = this.fromDate;
    if (this.toDate) params.to = this.toDate;

    this.exporting = true;
    this.callService.exportImportantCalls(params).subscribe({
      next: (blob: Blob) => {
        blob.arrayBuffer().then((ab) => {
          const bytes = new Uint8Array(ab.slice(0, 2));
          const magic = String.fromCharCode(bytes[0] || 0, bytes[1] || 0);
          if (magic !== 'PK') {
            const text = new TextDecoder().decode(ab);
            Swal.fire('Error', text || 'Export failed (invalid file response)', 'error');
            this.exporting = false;
            return;
          }

          const fileBlob = new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = window.URL.createObjectURL(fileBlob);
          const a = document.createElement('a');
          const suffix = `${this.fromDate || ''}${this.toDate ? `-${this.toDate}` : ''}`.replace(/^-|-$/g, '');
          a.href = url;
          a.download = `ImportantCalls${suffix ? `-${suffix}` : ''}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.exporting = false;
        }).catch((e) => {
          console.error('Export blob parse failed', e);
          this.exporting = false;
          Swal.fire('Error', 'Failed to export important calls', 'error');
        });
      },
      error: (err) => {
        console.error('Export failed', err);
        this.exporting = false;
        Swal.fire('Error', 'Failed to export important calls', 'error');
      }
    });
  }

  openStatusDialog(row: any): void {
    this.selectedFollowup = row;
  }

  openTransferModal(row: any): void {
    if (!this.isAdmin) return;
    this.selectedFollowupForTransfer = row;
    this.selectedAgentId = '';
    this.showTransferModal = true;
  }

  closeTransferModal(): void {
    this.showTransferModal = false;
    this.selectedFollowupForTransfer = null;
    this.selectedAgentId = '';
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

  transferFollowup(): void {
    if (!this.selectedFollowupForTransfer || !this.selectedAgentId) return;
    this.callService.transferFollowup(String(this.selectedFollowupForTransfer.id), { newAgentId: this.selectedAgentId }).subscribe({
      next: () => {
        Swal.fire('Success', 'Follow-up transferred successfully', 'success');
        this.closeTransferModal();
        this.load();
      },
      error: (err) => {
        console.error('Error transferring follow-up', err);
        Swal.fire('Error', 'Failed to transfer follow-up', 'error');
      }
    });
  }

  callCustomer(row: any): void {
    const customerPhone = '91' + row.number;
    if (!customerPhone) {
      Swal.fire('Error', 'Customer phone number not available', 'error');
      return;
    }

    const user = this.authService.getUser();
    const agentPhone = user?.phone;
    if (!agentPhone) {
      Swal.fire('Error', 'Your (Agent) phone number is not configured in your profile. Please contact admin.', 'error');
      return;
    }

    this.callingIds.add(row.id);
    this.callService.initiateSmartfloCall(agentPhone, customerPhone).subscribe({
      next: () => {
        this.callingIds.delete(row.id);
        Swal.fire('Success', 'Call initiated successfully. Please pick up your phone.', 'success');
      },
      error: (err) => {
        this.callingIds.delete(row.id);
        const msg = err.error?.message || 'Failed to initiate call';
        Swal.fire('Error', msg, 'error');
      }
    });
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
