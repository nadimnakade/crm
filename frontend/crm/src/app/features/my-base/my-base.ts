import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentBaseService, AgentBase } from '../../core/services/agent-base.service';
import { AuthService } from '../../shared/auth/auth';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

@Component({
  selector: 'app-my-base',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './my-base.html',
  styleUrls: ['./my-base.scss']
})
export class MyBaseComponent implements OnInit {
  displayedColumns: string[] = ['customerName', 'customerPhone', 'lastOrderDate', 'followUpDate', 'orderCount', 'orderId', 'payableAmount', 'agentName', 'team'];
  dataSource: AgentBase[] = [];
  totalCount = 0;
  pageSize = 20;
  pageIndex = 0;
  isLoading = false;
  searchQuery = '';
  private searchSubject = new Subject<string>();
  
  isAdmin = false;
  uploading = false;

  constructor(
    private agentBaseService: AgentBaseService,
    private authService: AuthService
  ) {
    this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(query => {
      this.searchQuery = query;
      this.pageIndex = 0;
      this.loadData();
    });
  }

  ngOnInit(): void {
    const user = this.authService.getUser();
    const role = (user?.role || '').toLowerCase();
    console.log('Current user role:', role);
    // Allow Admins and Managers to upload
    this.isAdmin = ['admin', 'super admin', 'superadmin', 'manager', 'team leader'].includes(role);
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.agentBaseService.getAgentBase({
      page: this.pageIndex + 1,
      pageSize: this.pageSize,
      search: this.searchQuery
    }).subscribe({
      next: (resp) => {
        this.dataSource = resp.rows;
        this.totalCount = resp.count;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load data', err);
        this.isLoading = false;
      }
    });
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchSubject.next(input.value);
  }

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (file) {
      this.uploading = true;
      this.agentBaseService.uploadAgentBase(file).subscribe({
        next: () => {
          this.uploading = false;
          alert('Upload successful');
          this.loadData();
        },
        error: (err: any) => {
          this.uploading = false;
          alert('Upload failed: ' + (err.error?.message || err.message));
        }
      });
    }
  }

  triggerUpload(): void {
    document.getElementById('fileInput')?.click();
  }

  exportData(): void {
    this.agentBaseService.exportAgentBase({
      search: this.searchQuery
    }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'MyBase.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Export failed', err);
        alert('Export failed');
      }
    });
  }

  // Pagination helpers
  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  nextPage(): void {
    if (this.pageIndex < this.totalPages - 1) {
      this.pageIndex++;
      this.loadData();
    }
  }

  prevPage(): void {
    if (this.pageIndex > 0) {
      this.pageIndex--;
      this.loadData();
    }
  }
}
