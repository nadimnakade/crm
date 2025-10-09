import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerMedicineDetailService } from '../../../shared/services/customer-medicine-detail';
 
@Component({
  selector: 'app-customer-medicine-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-medicine-detail.html',
  styleUrls: ['./customer-micine-detail.scss']
})
export class CustomerMedicineDetailComponent {
  Math = Math;
  // List state
  items: Array<{ name: string; mobile: string; address: string }> = [];
  page = 1;
  pageSize = 10;
  total = 0;
  sortBy: 'name' | 'mobile' | 'address' = 'name';
  sortOrder: 'asc' | 'desc' = 'asc';
  searchText = '';

  // Modal state
  showUpload = false;
  selectedFile: File | null = null;
  uploading = false;
  uploadMessage = '';

  // Detail modal state
  showDetail = false;
  detailMobile: string = '';
  detailItems: any[] = [];
  detailPage = 1;
  detailPageSize = 10;
  detailTotal = 0;

  constructor(private svc: CustomerMedicineDetailService) {
    this.loadList(1);
  }

  loadList(page = 1): void {
    this.page = Math.max(1, page);
    this.svc
      .list({
        page: this.page,
        pageSize: this.pageSize,
        sortBy: this.sortBy,
        sortOrder: this.sortOrder,
        q: (this.searchText || '').trim() || undefined
      })
      .subscribe({
        next: (res: any) => {
          this.items = (res?.items || []).map((r: any) => ({
            name: r.Name || r.name || '',
            mobile: r.Mobile || r.mobile || '',
            address: r.Address || r.address || ''
          }));
          this.total = Number(res?.total || 0);
        },
        error: () => {
          // Keep it silent but reset items
          this.items = [];
          this.total = 0;
        }
      });
  }

  changeSort(col: 'name' | 'mobile' | 'address'): void {
    if (this.sortBy === col) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = col;
      this.sortOrder = 'asc';
    }
    this.loadList(1);
  }

  search(): void {
    this.page = 1;
    this.loadList(1);
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size) || 10;
    this.page = 1;
    this.loadList(1);
  }

  openUpload(): void {
    this.showUpload = true;
    this.selectedFile = null;
    this.uploadMessage = '';
  }
  closeUpload(): void {
    this.showUpload = false;
    this.selectedFile = null;
    this.uploading = false;
    this.uploadMessage = '';
  }

  onFileChosen(event: any): void {
    const file: File | null = event?.target?.files?.[0] || null;
    if (!file) { this.selectedFile = null; return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['xls', 'xlsx', 'csv'];
    if (!ext || !allowed.includes(ext)) {
      this.uploadMessage = 'Invalid file type. Please upload .xls, .xlsx, or .csv.';
      this.selectedFile = null;
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.uploadMessage = 'File too large. Maximum allowed size is 10MB.';
      this.selectedFile = null;
      return;
    }
    this.uploadMessage = '';
    this.selectedFile = file;
  }

  upload(): void {
    if (!this.selectedFile) {
      this.uploadMessage = 'Please choose an Excel/CSV file to upload.';
      return;
    }
    this.uploading = true;
    const fd = new FormData();
    fd.append('file', this.selectedFile);
    this.svc.upload(fd).subscribe({
      next: (res: any) => {
        const inserted = Number(res?.inserted || 0);
        const skipped = Number(res?.skipped || 0);
        this.uploadMessage = `Upload complete. Inserted: ${inserted}, Skipped: ${skipped}.`;
        this.uploading = false;
        this.loadList(1);
        // Close after short delay to show message
        setTimeout(() => this.closeUpload(), 800);
      },
      error: (err) => {
        this.uploading = false;
        const errors = (err?.error?.errors || []) as Array<{ row: number; message: string }>;
        if (Array.isArray(errors) && errors.length) {
          const msg = errors.slice(0, 5).map(e => `Row ${e.row}: ${e.message}`).join(' | ');
          this.uploadMessage = `Some rows failed: ${msg}${errors.length > 5 ? ' …' : ''}`;
        } else {
          const text = err?.error?.message || 'Upload failed. Ensure headers and data are valid.';
          this.uploadMessage = text;
        }
      }
    });
  }

  // Open detail modal for a mobile
  openDetail(mobile: string): void {
    if (!mobile) return;
    this.detailMobile = mobile;
    this.showDetail = true;
    this.loadDetail(mobile, 1);
  }

  closeDetail(): void {
    this.showDetail = false;
    this.detailItems = [];
    this.detailTotal = 0;
    this.detailPage = 1;
  }

  loadDetail(mobile: string, page = 1): void {
    this.detailPage = Math.max(1, page);
    this.svc
      .list({
        page: this.detailPage,
        pageSize: this.detailPageSize,
        sortBy: 'uploadedAt',
        sortOrder: 'desc',
        mobile
      })
      .subscribe({
        next: (res: any) => {
          const items = res?.items || [];
          this.detailItems = items.map((r: any) => ({
            GroupId: r.GroupId,
            Name: r.Name,
            Address: r.Address,
            PinCode: r.PinCode,
            SkuName: r.SkuName,
            FileName: r.FileName,
            FilePath: r.FilePath,
            UploadedAt: r.UploadedAt
          }));
          this.detailTotal = Number(res?.total || this.detailItems.length || 0);
        },
        error: () => {
          this.detailItems = [];
          this.detailTotal = 0;
        }
      });
  }
}