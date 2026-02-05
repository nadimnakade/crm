import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { CallService } from '../../../shared/services/call';
import { UserService } from '../../../shared/services/user';
import { AuthService } from '../../../shared/auth/auth';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-orders-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './orders-search.html',
  styleUrls: [],
})
export class OrdersSearchComponent implements OnInit {
  form!: FormGroup;
  results: any[] = [];
  total = 0;
  isLoading = false;
  selectedCall: any | null = null;
  currentPage = 1;
  pageSize = 10;
  users: any[] = [];
  hasSearched = false;
  isAgentRole = false;

  constructor(
    private fb: FormBuilder,
    private callService: CallService,
    private userService: UserService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      orderId: [''],
      mobileNo: [''],
      startDate: [''],
      endDate: [''],
      agentId: ['']
    });
    this.loadUsers();
    // Role-based phone masking
    const role = (this.auth.getUser()?.role || '').toLowerCase();
    this.isAgentRole = role === 'agent';

    // Accept query params for deep-linking to order details
    const qp = this.route.snapshot.queryParamMap;
    const mobile = (qp.get('mobile') || '').replace(/[^0-9]/g, '');
    const orderId = (qp.get('orderId') || '').trim();
    const auto = qp.get('auto');
    const ps = qp.get('pageSize');
    if (ps) {
      const n = parseInt(ps, 10);
      if (!isNaN(n) && n > 0) this.pageSize = n;
    }
    if (mobile && mobile.length === 10) this.form.patchValue({ mobileNo: mobile });
    if (orderId) this.form.patchValue({ orderId });
    if (auto || mobile || orderId) {
      // Auto-run search and open detail if single match
      this.search(true);
    }
  }

  downloadTemplate(): void {
    this.orderService.downloadTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Order_Upload_Template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Template download failed', err);
        alert('Failed to download template');
      }
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      if (!confirm(`Upload ${file.name}?`)) return;
      
      this.isLoading = true;
      this.orderService.uploadOrders(file).subscribe({
        next: (res) => {
          this.isLoading = false;
          let msg = `Upload processed.\nInserted: ${res.inserted}\nSkipped: ${res.skipped}`;
          if (res.errors && res.errors.length > 0) {
            msg += `\n\n${res.errors.length} errors occurred. First error: ${res.errors[0].message}`;
            console.warn('Upload errors:', res.errors);
          }
          alert(msg);
          // Reset file input
          event.target.value = '';
        },
        error: (err) => {
          this.isLoading = false;
          console.error('Upload failed', err);
          alert('Upload failed: ' + (err.error?.message || err.message));
          event.target.value = '';
        }
      });
    }
  }

  loadUsers(): void {
    this.userService.getUsers().subscribe({
      next: (data) => {
        this.users = Array.isArray(data) ? data : [];
      },
      error: (err) => {
        console.error('Failed to load users for agent filter', err);
      }
    });
  }

  search(autoOpenIfSingle: boolean = false): void {
    const { orderId, mobileNo, startDate, endDate, agentId } = this.form.value;
    const mobileDigits = (mobileNo || '').replace(/[^0-9]/g, '');
    const hasOrderId = !!(orderId && orderId.trim());
    const hasMobile = /^[0-9]{10}$/.test(mobileDigits);

    // Require either OrderId or 10-digit mobile to search
    if (!hasOrderId && !hasMobile) {
      this.hasSearched = true;
      this.results = [];
      this.total = 0;
      return; // do not hit API
    }

    this.isLoading = true;
    this.hasSearched = true;

    const params: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      hasOrderDetails: true,
      startDate: startDate || '',
      endDate: endDate || '',
      agentId: agentId ? Number(agentId) : undefined,
      sortBy: 'date',
      sortOrder: 'DESC'
    };

    if (hasOrderId) params.orderId = orderId.trim();
    if (hasMobile) params.searchTerm = mobileDigits; // backend matches on customer phone digits

    this.callService.getCalls(params).subscribe({
      next: (res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        // Normalize NVARCHAR JSON fields coming from MSSQL
        this.results = data.map((r: any) => ({
          ...r,
          orderDetails: typeof r.orderDetails === 'string' ? this.parseJSON(r.orderDetails) : r.orderDetails
        }));
        this.total = res.total || 0;
        this.isLoading = false;
        if (autoOpenIfSingle && this.results.length === 1) {
          this.view(this.results[0]);
        }
      },
      error: (err) => {
        console.error('Order search failed', err);
        this.isLoading = false;
      }
    });
  }

  view(call: any): void {
    this.selectedCall = call;
  }

  closeModal(): void {
    this.selectedCall = null;
  }

  totalPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  setPage(page: number): void {
    const max = this.totalPages();
    this.currentPage = Math.min(Math.max(1, page), max);
    this.search();
  }
  changePageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.search();
  }

  customerName(call: any): string {
    const c = call?.Customer || call?.customer; // handle casing
    if (!c) return '';
    return `${c.firstName || ''} ${c.lastName || ''}`.trim();
  }

  customerAddress(call: any): string {
    const c = call?.Customer || call?.customer;
    return c?.address || '';
  }

  customerPhone(call: any): string {
    const c = call?.Customer || call?.customer;
    return c?.phone || '';
  }

  displayPhone(phone: string | undefined | null): string {
    const raw = (phone || '').replace(/[^0-9]/g, '');
    if (!raw) return '';
    if (!this.isAgentRole) return raw; // show full for non-agent roles
    if (raw.length <= 4) return '****';
    // Mask middle digits: keep first 2 and last 2
    return `${raw.slice(0, 2)}${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-2)}`;
  }

  private parseJSON(value: any): any {
    if (!value) return undefined;
    if (typeof value !== 'string') return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}
