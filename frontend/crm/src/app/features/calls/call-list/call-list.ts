import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CallService } from '../../../shared/services/call';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-call-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './call-list.html',
  styleUrls: ['./call-list.scss']
})
export class CallListComponent implements OnInit {
  calls: any[] = [];
  filteredCalls: any[] = [];
  searchTerm: string = '';
  selectedStatus: string = '';
  selectedType: string = '';
  startDate: string = '';
  endDate: string = '';
  currentPage: number = 1;
  pageSize: number = 10;
  total: number = 0;
  sortBy: string = 'createdAt';
  sortOrder: 'ASC' | 'DESC' = 'DESC';
  private searchInput$ = new Subject<string>();

  constructor(private callService: CallService) { }

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.loadCalls();
      });
    this.loadCalls();
  }

  loadCalls(): void {
    this.callService.getCalls({
      page: this.currentPage,
      pageSize: this.pageSize,
      searchTerm: this.searchTerm,
      status: this.selectedStatus,
      type: this.selectedType,
      startDate: this.startDate,
      endDate: this.endDate,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder
    }).subscribe({
      next: (res) => {
        this.calls = res.data;
        this.filteredCalls = [...this.calls];
        this.total = res.total;
      },
      error: (error) => {
        console.error('Error loading calls', error);
      }
    });
  }

  filterCalls(): void {
    // Server-side filtering: reload calls with current filters and reset to page 1
    this.currentPage = 1;
    this.loadCalls();
  }

  onSearchInput(value: string): void {
    this.searchTerm = value || '';
    this.searchInput$.next(this.searchTerm);
  }

  setSort(field: string): void {
    if (this.sortBy === field) {
      this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortBy = field;
      this.sortOrder = 'DESC';
    }
    this.currentPage = 1;
    this.loadCalls();
  }

  deleteCall(id: number): void {
    if (confirm('Are you sure you want to delete this call?')) {
      this.callService.deleteCall(id).subscribe({
        next: () => {
          // Reload from server to reflect deletion and total count
          this.loadCalls();
        },
        error: (error) => {
          console.error('Error deleting call', error);
        }
      });
    }
  }

  getStatusClass(status: string): string {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'new': return 'chip chip-info';
      case 'in-progress': return 'chip chip-warning';
      case 'completed': return 'chip chip-success';
      case 'scheduled': return 'chip chip-primary';
      case 'missed': return 'chip chip-danger';
      case 'cancelled': return 'chip chip-secondary';
      case 'resolved': return 'chip chip-success';
      case 'positive': return 'chip chip-success';
      default: return 'chip chip-default';
    }
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  pagedCalls(): any[] {
    // Server returns already paginated rows for the current page
    return this.calls;
  }

  setPage(page: number): void {
    const max = this.totalPages();
    this.currentPage = Math.min(Math.max(1, page), max);
    this.loadCalls();
  }

  nextPage(): void { this.setPage(this.currentPage + 1); }
  prevPage(): void { this.setPage(this.currentPage - 1); }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.loadCalls();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = '';
    this.selectedType = '';
    this.startDate = '';
    this.endDate = '';
    this.filterCalls();
  }

  resultsStartIndex(): number {
    if (this.total === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  resultsEndIndex(): number {
    return Math.min(this.total, this.currentPage * this.pageSize);
  }

  totalResults(): number {
    return this.total;
  }
}
