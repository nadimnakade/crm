import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-reorder-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reorder-list.html'
})export class ReorderListComponent implements OnInit {
  reorders: any[] = [];
  loading = false;
  today: Date = new Date();
  page = 1;
  pageSize = 100;
  totalReorders = 0;

  get totalPages(): number {
    return Math.ceil(this.totalReorders / this.pageSize);
  }

  // Modal state
  showModal = false;
  submitting = false;
  selectedOrder: any = null;
  
  // Form fields
  caseStatus: string = 'Open';
  subStatus: string = 'Ringing';
  followUpDate: string = '';
  closeReason: string = 'Order Created';

  constructor(private orderService: OrderService) {}

  ngOnInit(): void {
    this.fetchReorders();
  }

  fetchReorders(): void {
    this.loading = true;
    this.orderService.getReorders(this.page, this.pageSize).subscribe({
      next: (data: any) => {
        let rows: any[] = [];
        if (data && data.rows) {
          rows = data.rows;
          this.totalReorders = data.count;
        } else {
          rows = Array.isArray(data) ? data : [];
          this.totalReorders = rows.length;
        }

        this.reorders = rows.map((order: any) => {
          if (typeof order.orderDetails === 'string') {
            try {
              order.orderDetails = JSON.parse(order.orderDetails);
            } catch (e) {
              console.error('Failed to parse orderDetails', e);
            }
          }
          return order;
        });
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to fetch reorders', err);
        this.loading = false;
      }
    });
  }

  onPageChange(newPage: number): void {
    if (newPage < 1 || newPage > Math.ceil(this.totalReorders / this.pageSize)) return;
    this.page = newPage;
    this.fetchReorders();
  }

  openStatusModal(order: any): void {
    this.selectedOrder = order;
    this.showModal = true;
    // Reset form
    this.caseStatus = 'Open';
    this.subStatus = 'Ringing';
    this.followUpDate = '';
    this.closeReason = 'Order Created';
  }

  closeStatusModal(): void {
    this.showModal = false;
    this.selectedOrder = null;
  }

  saveStatus(): void {
    if (!this.selectedOrder) return;

    if (this.caseStatus === 'Open' && this.subStatus === 'Follow-up' && !this.followUpDate) {
      alert('Please select a follow-up date.');
      return;
    }

    this.submitting = true;
    const payload = {
      caseStatus: this.caseStatus,
      subStatus: this.subStatus,
      followUpDate: this.followUpDate,
      closeReason: this.closeReason
    };

    this.orderService.updateOrderStatus(this.selectedOrder.id, payload).subscribe({
      next: (res) => {
        // Remove the updated order from the list
        this.reorders = this.reorders.filter(o => o.id !== this.selectedOrder.id);
        this.totalReorders--;
        
        // If current page becomes empty and we have more pages, try to load next page or adjust
        if (this.reorders.length === 0 && this.totalReorders > 0) {
            // Option: Fetch next page automatically? 
            // Or just let user navigate. 
            // Given "first record removed... next record shown", 
            // if page becomes empty, user might need to click next page.
            // But if totalReorders > 0, page count might change.
            if (this.page > this.totalPages) {
                this.page = Math.max(1, this.totalPages);
                this.fetchReorders();
            } else {
                this.fetchReorders(); // Refresh current page to fill it up
            }
        }

        this.submitting = false;
        this.closeStatusModal();
      },
      error: (err) => {
        console.error('Failed to update status', err);
        alert('Failed to update status. Please try again.');
        this.submitting = false;
      }
    });
  }
}
