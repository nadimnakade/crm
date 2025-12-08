import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CustomerMedicineDetailService } from '../../../shared/services/customer-medicine-detail';
import { CallService } from '../../../shared/services/call';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../shared/auth/auth';

@Component({
  selector: 'app-reports-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reports-menu.html',
  styleUrls: []
})
export class ReportsMenuComponent implements OnInit {
  isOrdersOnly = false;
  // Customer Medicine Orders date range (mandatory)
  cmdFrom: string = '';
  cmdTo: string = '';
  exportingCmd = false;

  // Order Detail date range (mandatory)
  orderFrom: string = '';
  orderTo: string = '';
  exportingOrders = false;

  // Customer Interactions export
  interFrom: string = '';
  interTo: string = '';
  exportingInteractions = false;

  constructor(
    private cmdSvc: CustomerMedicineDetailService,
    private callSvc: CallService,
    private reportSvc: ReportService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const user = this.authService.getUser();
    const role = (user?.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'superadmin';
    const isManager = role === 'manager';
    const isOrdersViewer = role === 'orders viewer' || role === 'vieworder';
    // Allow access for admin, superadmin, manager, and orders viewer
    if (!isAdmin && !isManager && !isOrdersViewer) {
      this.router.navigate(['/dashboard']);
      return;
    }
    // Orders Viewer should see all reports like admin; do not hide interactions
    this.isOrdersOnly = false;
  }

  // Quick range helpers
  setCmdRangeMonths(months: number): void {
    const now = new Date();
    const from = new Date(now);
    from.setMonth(now.getMonth() - months);
    this.cmdFrom = from.toISOString().slice(0, 10);
    this.cmdTo = now.toISOString().slice(0, 10);
  }

  setOrderRangeMonths(months: number): void {
    const now = new Date();
    const from = new Date(now);
    from.setMonth(now.getMonth() - months);
    this.orderFrom = from.toISOString().slice(0, 10);
    this.orderTo = now.toISOString().slice(0, 10);
  }

  setInterRangeMonths(months: number): void {
    const now = new Date();
    const from = new Date(now);
    from.setMonth(now.getMonth() - months);
    this.interFrom = from.toISOString().slice(0, 10);
    this.interTo = now.toISOString().slice(0, 10);
  }

  async exportCmd(): Promise<void> {
    if (!this.cmdFrom || !this.cmdTo) {
      alert('Please select a From and To date for Customer Medicine Orders.');
      return;
    }
    if (this.exportingCmd) return;
    this.exportingCmd = true;
    try {
      const blob = await firstValueFrom(this.cmdSvc.export({ from: this.cmdFrom, to: this.cmdTo, unique: false, limit: 10000 }));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'customer-medicine-orders.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Customer Medicine Orders export failed', err);
      alert('Export failed or not authorized. Please ensure admin access.');
    } finally {
      this.exportingCmd = false;
    }
  }

  async exportOrders(): Promise<void> {
    if (!this.orderFrom || !this.orderTo) {
      alert('Please select a From and To date for Order Detail.');
      return;
    }
    if (this.exportingOrders) return;
    this.exportingOrders = true;
    try {
      const blob = await firstValueFrom(
        this.reportSvc.exportOrders({ from: this.orderFrom, to: this.orderTo, limit: 10000, format: 'xlsx' })
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orders-detail.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Orders export failed', err);
      alert('Export failed. Please ensure admin access or try narrower date range.');
    } finally {
      this.exportingOrders = false;
    }
  }

  async exportInteractions(): Promise<void> {
    if (!this.interFrom || !this.interTo) {
      alert('Please select a From and To date for Customer Interactions.');
      return;
    }
    if (this.exportingInteractions) return;
    this.exportingInteractions = true;
    try {
      const blob = await firstValueFrom(
        this.reportSvc.exportInteractions({ from: this.interFrom, to: this.interTo, limit: 10000, format: 'xlsx' })
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'customer-interactions.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Customer Interactions export failed', err);
      alert('Export failed or not authorized. Please ensure admin access.');
    } finally {
      this.exportingInteractions = false;
    }
  }

  private safeParse(s: string): any {
    try { return JSON.parse(s); } catch { return {}; }
  }

  private toCsv(rows: any[][]): string {
    return rows.map(r => r.map(v => {
      const s = (v ?? '').toString();
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')).join('\n');
  }
}
