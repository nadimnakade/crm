import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PortfolioService } from '../../shared/services/portfolio';

@Component({
  selector: 'app-customer-portfolio',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './customer-portfolio.html',
  styleUrls: ['./customer-portfolio.scss']
})
export class CustomerPortfolioComponent implements OnInit {
  form!: FormGroup;
  searchMobile: string = '';
  selectedFiles: File[] = [];
  items: any[] = [];
  uploading = false;
  uploadMessage = '';

  constructor(private fb: FormBuilder, private portfolio: PortfolioService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern('^\\d{10}$')]],
      groupId: [''],
      name: [''],
      address: [''],
      pinCode: ['', [Validators.pattern('^\\d{6}$')]],
      skuName: ['']
    });
    this.loadItems();
  }

  onFileSelected(event: any): void {
    const files = Array.from(event.target.files || []) as File[];
    this.selectedFiles = files;
  }

  upload(): void {
    if (this.form.invalid || this.selectedFiles.length === 0) {
      Object.values(this.form.controls).forEach(c => c.markAsTouched());
      return;
    }
    this.uploading = true;
    this.uploadMessage = '';
    const data = this.form.value;
    this.portfolio.upload(data, this.selectedFiles).subscribe({
      next: () => {
        this.uploading = false;
        this.uploadMessage = 'Uploaded successfully';
        this.selectedFiles = [];
        this.loadItems(this.searchMobile || data.mobile);
      },
      error: err => {
        console.error('Upload failed', err);
        this.uploading = false;
        this.uploadMessage = 'Upload failed';
      }
    });
  }

  loadItems(mobile?: string): void {
    this.portfolio.list(mobile).subscribe({
      next: (res) => this.items = res.items || [],
      error: (err) => {
        console.error('Failed to load portfolio', err);
        this.items = [];
      }
    });
  }

  onSearch(): void {
    const mobile = (this.searchMobile || '').replace(/[^0-9]/g, '');
    this.searchMobile = mobile;
    this.loadItems(mobile);
  }
}