import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../auth/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss']
})
export class LayoutComponent implements OnInit {
  isDarkTheme = true;
  userName = '';
  isSidebarCollapsed = false;
  userRole: string | null = null;
  canManageUsersAndRoles: boolean = false;
  isOrdersOnlyRole: boolean = false;
  reportsOpen: boolean = false;
  ordersOpen: boolean = false;
  uploadsOpen: boolean = false;
  customersOpen: boolean = false;
  followupsOpen: boolean = false;
  searchOpen: boolean = false;
  canUpload: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.isDarkTheme = savedTheme === 'dark';
    } else {
      localStorage.setItem('theme', 'dark');
      this.isDarkTheme = true;
    }
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
    document.body.classList.toggle('light-theme', !this.isDarkTheme);

    const user = this.authService.getUser();
    const fullName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
    this.userName = fullName || user?.email || 'User';

    // Determine role-based visibility for admin/superadmin and orders-only role
    this.userRole = user?.role || null;
    const role = (this.userRole || '').toLowerCase();
    this.canManageUsersAndRoles = role === 'admin' || role === 'superadmin';
    this.canUpload = this.canManageUsersAndRoles; // Only admins can upload
    // Orders-only role is explicitly named 'vieworder'
    this.isOrdersOnlyRole = role === 'vieworder';
    // Ensure Uploads section is visible by default for admins
    if (this.canUpload) {
      this.uploadsOpen = true;
    }
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('theme', this.isDarkTheme ? 'dark' : 'light');
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
    document.body.classList.toggle('light-theme', !this.isDarkTheme);
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  toggleReports(): void {
    this.reportsOpen = !this.reportsOpen;
  }
  toggleOrders(): void {
    this.ordersOpen = !this.ordersOpen;
  }
  toggleUploads(): void {
    this.uploadsOpen = !this.uploadsOpen;
  }
  toggleCustomers(): void {
    this.customersOpen = !this.customersOpen;
  }
  toggleFollowups(): void {
    this.followupsOpen = !this.followupsOpen;
  }
  toggleSearch(): void {
    this.searchOpen = !this.searchOpen;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
