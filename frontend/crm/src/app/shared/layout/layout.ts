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
    this.isOrdersOnlyRole = role === 'orders viewer' || role === 'orders_viewer' || role === 'ordersviewer';
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

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}