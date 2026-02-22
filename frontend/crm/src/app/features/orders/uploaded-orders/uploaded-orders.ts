import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-uploaded-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './uploaded-orders.html'
})
export class UploadedOrdersComponent implements OnInit {
  orders: any[] = [];
  loading = false;
  fromDate: string = '';
  toDate: string = '';
  page = 1;
  pageSize = 20;
  total = 0;
  
  // Modal state
  showModal = false;
  submitting = false;
  selectedOrder: any = null;
  
  // Form fields
  caseStatus: string = 'Open';
  subStatus: string = 'Ringing';
  followUpDate: string = '';
  closeReason: string = 'Order Created';

  constructor(private orderService: OrderService) {
    const today = new Date();
    const iso = today.toISOString().split('T')[0];
    this.fromDate = iso;
    this.toDate = iso;
  }

  ngOnInit(): void {
    this.fetchOrders();
  }

  fetchOrders(): void {
    this.loading = true;
    this.orderService.getUploadedOrders({ from: this.fromDate, to: this.toDate, page: this.page, pageSize: this.pageSize }).subscribe({
      next: (res) => {
        this.orders = res?.data || [];
        this.total = res?.total || 0;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to fetch uploaded orders', err);
        this.loading = false;
      }
    });
  }

  onDateChange(): void {
    this.page = 1;
    this.fetchOrders();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get pages(): number[] {
    const total = this.totalPages;
    const current = this.page;
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
    if (page < 1 || page > this.totalPages || page === this.page) return;
    this.page = page;
    this.fetchOrders();
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
        // Update local state
        this.selectedOrder.outcome = res.call.outcome;
        this.selectedOrder.notes = res.call.notes;
        this.selectedOrder.followUpDate = res.call.followUpDate;
        this.selectedOrder.followUpRequired = res.call.followUpRequired;
        
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
