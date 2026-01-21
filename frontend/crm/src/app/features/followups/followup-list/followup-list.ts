
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CallService } from '../../../core/services/call.service';
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
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  total = 0;

  constructor(
    private callService: CallService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFollowups();
  }

  loadFollowups(): void {
    this.isLoading = true;
    this.callService.getFollowUps({ page: this.currentPage, pageSize: this.pageSize }).subscribe({
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

  openStatusDialog(followup: any): void {
    this.selectedFollowup = followup;
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

