import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerMedicineDetailService } from '../../../shared/services/customer-medicine-detail';
import { AuthService } from '../../../shared/auth/auth';

@Component({
  selector: 'app-customer-medicine-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-medicine-detail.html',
  styleUrls: ['./customer-micine-detail.scss']
})
export class CustomerMedicineDetailComponent implements OnInit {
  Math = Math;
  // List state
  items: Array<{ name: string; mobile: string; address: string }> = [];
  pageSize = 10;
  cursor: number | null = null;
  nextCursor: number | null = null;
  backStack: Array<number | null> = [];
  hasMore: boolean = false;
  sortBy: 'name' | 'mobile' | 'address' = 'name';
  sortOrder: 'asc' | 'desc' = 'asc';
  searchText = '';
  canUpload = false;

  // Modal state
  showUpload = false;
  selectedFile: File | null = null;
  uploading = false;
  uploadMessage = '';

  // Detail modal state
  showDetail = false;
  detailMobile: string = '';
  detailItems: any[] = [];
  detailPageSize = 10;
  detailCursor: number | null = null;
  detailNextCursor: number | null = null;
  detailBackStack: Array<number | null> = [];
  detailHasMore: boolean = false;


  constructor(private svc: CustomerMedicineDetailService, private authService: AuthService) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    const role = (user?.role || '').toLowerCase();
    this.canUpload = role === 'admin' || role === 'superadmin';
  }

  loadList(): void {
    const digits = (this.searchText || '').replace(/[^0-9]/g, '');
    // Enforce exactly 10-digit mobile search
    if (!digits || digits.length !== 10) {
      this.items = [];
      this.hasMore = false;
      this.nextCursor = null;
      return;
    }
    const params: any = {
      pageSize: this.pageSize,
      cursorId: this.cursor,
      mobile: digits,
      unique: true,
      uniqueBy: 'name,mobile,address'
    };

    this.svc
      .list(params)
      .subscribe({
        next: (res: any) => {
          this.items = (res?.items || []).map((r: any) => ({
            name: r.Name || r.name || '',
            mobile: r.Mobile || r.mobile || '',
            address: r.Address || r.address || ''
          }));
          this.hasMore = !!res?.hasMore;
          this.nextCursor = res?.nextCursor ?? null;
        },
        error: () => {
          // Keep it silent but reset items
          this.items = [];
          this.hasMore = false;
          this.nextCursor = null;
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
    // Reset cursor stack on sort change
    this.cursor = null;
    this.backStack = [];
    this.loadList();
  }

  onSearchTextInput(event: any): void {
    const val: string = event?.target?.value || '';
    const digits = val.replace(/\D/g, '').slice(0, 10);
    this.searchText = digits;
  }

  isTenDigits(val: string): boolean {
    const digits = (val || '').replace(/\D/g, '');
    return digits.length === 10;
  }

  search(): void {
    this.cursor = null;
    this.backStack = [];
    this.loadList();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size) || 10;
    this.cursor = null;
    this.backStack = [];
    this.loadList();
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
        // Refresh list from the beginning after successful upload
        this.cursor = null;
        this.backStack = [];
        this.loadList();
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
    this.detailCursor = null;
    this.detailBackStack = [];
    this.loadDetail(mobile);
  }

  closeDetail(): void {
    this.showDetail = false;
    this.detailItems = [];
    this.detailHasMore = false;
    this.detailNextCursor = null;
    this.detailCursor = null;
    this.detailBackStack = [];
  }

  loadDetail(mobile: string): void {
    this.svc
      .list({
        pageSize: this.detailPageSize,
        mobile,
        cursorId: this.detailCursor
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
          this.detailHasMore = !!res?.hasMore;
          this.detailNextCursor = res?.nextCursor ?? null;
        },
        error: () => {
          this.detailItems = [];
          this.detailHasMore = false;
          this.detailNextCursor = null;
        }
      });
  }

  prevPage(): void {
    if (this.backStack.length === 0) return;
    const prev = this.backStack.pop() ?? null;
    this.cursor = prev;
    this.loadList();
  }

  nextPage(): void {
    if (!this.hasMore) return;
    this.backStack.push(this.cursor);
    this.cursor = this.nextCursor ?? null;
    this.loadList();
  }

  prevDetailPage(): void {
    if (this.detailBackStack.length === 0) return;
    const prev = this.detailBackStack.pop() ?? null;
    this.detailCursor = prev;
    this.loadDetail(this.detailMobile);
  }

  nextDetailPage(): void {
    if (!this.detailHasMore) return;
    this.detailBackStack.push(this.detailCursor);
    this.detailCursor = this.detailNextCursor ?? null;
    this.loadDetail(this.detailMobile);
  }




}