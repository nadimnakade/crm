import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-upload-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload-orders.html'
})
export class UploadOrdersComponent {
  file: File | null = null;
  orderType: string = '';
  uploading = false;
  message = '';
  errors: any[] = [];
  inserted = 0;
  skipped = 0;

  constructor(private orderService: OrderService) {}

  onFileChange(event: any): void {
    const f = event.target.files && event.target.files[0];
    this.file = f || null;
  }

  upload(): void {
    if (!this.file) return;
    this.uploading = true;
    this.message = '';
    this.errors = [];
    this.inserted = 0;
    this.skipped = 0;
    this.orderService.uploadOrders(this.file, this.orderType || undefined).subscribe({
      next: (res) => {
        const inserted = typeof res?.inserted === 'number' ? res.inserted : 0;
        const errors = Array.isArray(res?.errors) ? res.errors : [];
        const skippedFromApi = typeof res?.skipped === 'number' ? res.skipped : undefined;

        this.inserted = inserted;
        this.errors = errors;
        this.skipped = skippedFromApi !== undefined ? skippedFromApi : errors.length;
        this.message = res?.message || 'Upload completed';
        this.uploading = false;
      },
      error: (err) => {
        this.message = err?.error?.message || 'Upload failed';
        this.uploading = false;
      }
    });
  }

  downloadTemplate(): void {
    this.orderService.downloadTemplate().subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Order_Upload_Template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }
}
