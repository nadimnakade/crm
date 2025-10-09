import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PortfolioService } from '../../../shared/services/portfolio';

@Component({
  selector: 'app-customer-portfolio',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './customer-portfolio.html',
  styleUrls: ['./customer-portfolio.scss']
})
export class CustomerPortfolioComponent implements OnInit {
  Math = Math;
  form!: FormGroup;
  // Parent unique list
  items: any[] = [];
  total = 0;
  page = 1;
  pageSize = 10;
  // Upload modal
  showUpload = false;
  uploadMode: 'bulk' | 'single' = 'bulk';
  // Search list (by mobile/name/address)
  searchText: string = '';
  searchItems: any[] = [];
  searchTotal = 0;
  searchPage = 1;
  searchPageSize = 10;
  // Filters
  filterGroupId: string = '';
  filterPinCode: string = '';
  filterFrom: string = ''; // yyyy-MM-dd
  filterTo: string = '';
  // Detail modal state
  showDetail = false;
  detailMobile: string = '';
  detailItems: any[] = [];
  detailTotal = 0;
  detailPage = 1;
  detailPageSize = 10;
  // Upload state
  selectedFiles: File[] = [];
  uploading = false;
  uploadMessage = '';

  constructor(private fb: FormBuilder, private portfolio: PortfolioService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      groupId: [''],
      name: [''],
      address: [''],
      pinCode: ['', [Validators.pattern(/^[0-9]{6}$/)]],
      skuName: ['']
    });
    // Load initial unique list
    this.loadUnique();
  }

  onFilesSelected(ev: any): void {
    const files: FileList = ev.target?.files || [];
    this.selectedFiles = Array.from(files);
  }

  openUpload(): void {
    this.showUpload = true;
    this.setUploadMode('bulk');
  }
  closeUpload(): void { this.showUpload = false; }

  setUploadMode(mode: 'bulk' | 'single'): void {
    this.uploadMode = mode;
    const mobileCtrl = this.form?.controls['mobile'];
    if (!mobileCtrl) return;
    if (mode === 'bulk') {
      mobileCtrl.clearValidators();
    } else {
      mobileCtrl.setValidators([Validators.required, Validators.pattern(/^[0-9]{10}$/)]);
    }
    mobileCtrl.updateValueAndValidity();
    this.selectedFiles = [];
    this.uploadMessage = '';
  }

  upload(): void {
    // Validate based on mode
    const first = this.selectedFiles[0];
    const ext = (first?.name || '').split('.')?.pop()?.toLowerCase() || '';
    const isExcel = ['xls', 'xlsx', 'csv'].includes(ext);
    if (this.uploadMode === 'bulk' && !isExcel) {
      this.uploadMessage = 'Please select an Excel/CSV file for bulk upload.';
      return;
    }
    if (this.uploadMode === 'single') {
      if (this.form.controls['mobile'].invalid || this.selectedFiles.length === 0) {
        this.form.markAllAsTouched();
        return;
      }
    } else {
      if (this.selectedFiles.length === 0) {
        this.uploadMessage = 'Please select an Excel/CSV file to upload.';
        return;
      }
    }
    const val = this.form.value;
    this.uploading = true;
    this.uploadMessage = '';
    const fileType = isExcel ? 'excel' : 'screenshot';
    this.portfolio.upload({
      mobile: val.mobile,
      groupId: val.groupId,
      name: val.name,
      address: val.address,
      pinCode: val.pinCode,
      skuName: val.skuName,
      files: this.selectedFiles,
      fileType
    }).subscribe({
      next: (res) => {
        this.uploading = false;
        this.selectedFiles = [];
        this.uploadMessage = 'Uploaded successfully';
        this.closeUpload();
        // Refresh detail for current mobile if modal open; otherwise refresh unique list
        if (this.showDetail && this.detailMobile === val.mobile) {
          this.loadDetail(this.detailMobile, 1);
        } else {
          this.loadUnique(this.page);
        }
      },
      error: (err) => {
        console.error('Upload failed', err);
        this.uploading = false;
        const msg = err?.error?.message || 'Upload failed';
        this.uploadMessage = msg;
      }
    });
  }

  // Load unique parent list
  loadUnique(page = 1): void {
    this.page = page;
    this.portfolio.list({
      page: this.page,
      pageSize: this.pageSize,
      unique: true,
      groupId: (this.filterGroupId || '').trim() || undefined,
      pinCode: (this.filterPinCode || '').trim() || undefined,
      from: (this.filterFrom || '').trim() || undefined,
      to: (this.filterTo || '').trim() || undefined
    }).subscribe({
      next: (res) => {
        this.items = res.items || [];
        this.total = res.total || 0;
        this.page = res.page || this.page;
        this.pageSize = res.pageSize || this.pageSize;
      },
      error: (err) => {
        console.error('Failed to load portfolio (unique)', err);
        this.items = [];
        this.total = 0;
      }
    });
  }

  // Open detail modal and load records for a mobile
  openDetail(mobile: string): void {
    const clean = (mobile || '').replace(/[^0-9]/g, '');
    if (!/^[0-9]{10}$/.test(clean)) {
      this.form.controls['mobile']?.markAsTouched();
      return;
    }
    this.detailMobile = clean;
    this.detailPage = 1;
    this.showDetail = true;
    this.loadDetail(clean, 1);
  }

  loadDetail(mobile: string, page = 1): void {
    this.detailPage = page;
    this.portfolio.list({
      mobile,
      page: this.detailPage,
      pageSize: this.detailPageSize,
      groupId: (this.filterGroupId || '').trim() || undefined,
      pinCode: (this.filterPinCode || '').trim() || undefined,
      from: (this.filterFrom || '').trim() || undefined,
      to: (this.filterTo || '').trim() || undefined
    }).subscribe({
      next: (res) => {
        this.detailItems = res.items || [];
        this.detailTotal = res.total || 0;
        this.detailPage = res.page || this.detailPage;
        this.detailPageSize = res.pageSize || this.detailPageSize;
      },
      error: (err) => {
        console.error('Failed to load portfolio (detail)', err);
        this.detailItems = [];
        this.detailTotal = 0;
      }
    });
  }

  closeDetail(): void { this.showDetail = false; }

  // General search by mobile/name/address
  searchAny(page = 1): void {
    this.searchPage = page;
    const q = (this.searchText || '').trim();
    if (!q) {
      this.searchItems = [];
      this.searchTotal = 0;
      return;
    }
    this.portfolio.list({
      q,
      page: this.searchPage,
      pageSize: this.searchPageSize,
      groupId: (this.filterGroupId || '').trim() || undefined,
      pinCode: (this.filterPinCode || '').trim() || undefined,
      from: (this.filterFrom || '').trim() || undefined,
      to: (this.filterTo || '').trim() || undefined
    }).subscribe({
      next: (res) => {
        this.searchItems = res.items || [];
        this.searchTotal = res.total || 0;
        this.searchPage = res.page || this.searchPage;
        this.searchPageSize = res.pageSize || this.searchPageSize;
      },
      error: (err) => {
        console.error('Search failed', err);
        this.searchItems = [];
        this.searchTotal = 0;
      }
    });
  }

  // Apply filters and reload current listing view
  applyFilters(): void {
    // Reset pages when filters change
    this.page = 1;
    this.detailPage = 1;
    this.searchPage = 1;
    if ((this.searchText || '').trim()) {
      this.searchAny(1);
    } else if (this.showDetail && this.detailMobile) {
      this.loadDetail(this.detailMobile, 1);
    } else {
      this.loadUnique(1);
    }
  }
}