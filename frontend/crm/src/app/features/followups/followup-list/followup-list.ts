
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CallService } from '../../../core/services/call.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../shared/services/user';
import { FollowupStatusDialogComponent } from '../followup-status-dialog';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-followup-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, FollowupStatusDialogComponent],
  templateUrl: './followup-list.html',
  styleUrls: ['./followup-list.scss']
})
export class FollowupListComponent implements OnInit {
  followups: any[] = [];
  isLoading = false;
  selectedFollowup: any = null;
  searchTerm: string = '';
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  total = 0;

  isAdmin = false;
  showTransferModal = false;
  selectedFollowupForTransfer: any = null;
  agents: any[] = [];
  selectedAgentId: string = '';

  constructor(
    private callService: CallService,
    private router: Router,
    private authService: AuthService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.loadFollowups();
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

  loadFollowups(): void {
    this.isLoading = true;
    const params: any = {
      page: this.currentPage,
      pageSize: this.pageSize
    };
    const trimmed = (this.searchTerm || '').trim();
    if (trimmed) {
      params.search = trimmed;
    }

    this.callService.getFollowUps(params).subscribe({
      next: (res) => {
        this.followups = res.data;
        this.total = res.total;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading followups', err);
        this.isLoading = false;
        Swal.fire('Error', 'Failed to load follow-ups', 'error');
      }
    });
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadFollowups();
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadFollowups();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadFollowups();
  }

  openStatusDialog(followup: any): void {
    this.selectedFollowup = followup;
  }

  openTransferModal(followup: any): void {
    if (!this.isAdmin) return;
    this.selectedFollowupForTransfer = followup;
    this.selectedAgentId = '';
    this.showTransferModal = true;
  }

  closeTransferModal(): void {
    this.showTransferModal = false;
    this.selectedFollowupForTransfer = null;
    this.selectedAgentId = '';
  }

  transferFollowup(): void {
    if (!this.selectedFollowupForTransfer || !this.selectedAgentId) return;
    this.callService.transferFollowup(String(this.selectedFollowupForTransfer.id), { newAgentId: this.selectedAgentId }).subscribe({
      next: () => {
        Swal.fire('Success', 'Follow-up transferred successfully', 'success');
        this.closeTransferModal();
        this.loadFollowups();
      },
      error: (err) => {
        console.error('Error transferring follow-up', err);
        Swal.fire('Error', 'Failed to transfer follow-up', 'error');
      }
    });
  }

  onDialogSave(event: any): void {
    if (!this.selectedFollowup) return;

    this.callService.updateFollowUpStatus(this.selectedFollowup.id, event).subscribe({
      next: (res) => {
        Swal.fire('Success', 'Follow-up status updated', 'success');
        
        const wasOrder = event.status === 'Order';
        const customerId = this.selectedFollowup.customerId;

        this.selectedFollowup = null;
        this.loadFollowups(); // Refresh list
        
        // Handle Order redirection
        if (wasOrder && customerId) {
          // Redirect to customer detail page where order creation likely happens
          this.router.navigate(['/customers', customerId]);
        }
      },
      error: (err) => {
        console.error('Error updating status', err);
        Swal.fire('Error', 'Failed to update status', 'error');
      }
    });
  }

  onDialogCancel(): void {
    this.selectedFollowup = null;
  }
  
  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize);
  }
  
  get pages(): number[] {
    const p: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) p.push(i);
    return p;
  }
}

