import { Routes } from '@angular/router';
import { LoginComponent } from './shared/auth/login/login';
import { RegisterComponent } from './shared/auth/register/register';
import { DashboardComponent } from './features/dashboard/dashboard';
import { AuthGuard } from './shared/guards/auth.guard';
import { AdminGuard } from './shared/guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  // Authenticated app routes under shared layout
  {
    path: '',
    loadComponent: () => import('./shared/layout/layout').then(m => m.LayoutComponent),
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      // Customers (standalone components)
      { path: 'customers', loadComponent: () => import('./features/customers/customer-list/customer-list').then(m => m.CustomerListComponent) },
      { path: 'customers/new', loadComponent: () => import('./features/customers/customer-detail/customer-detail').then(m => m.CustomerDetailComponent) },
      { path: 'customers/:id/edit', loadComponent: () => import('./features/customers/customer-detail/customer-detail').then(m => m.CustomerDetailComponent), data: { editMode: true } },
      { path: 'customers/:id', loadComponent: () => import('./features/customers/customer-detail/customer-detail').then(m => m.CustomerDetailComponent) },
      { path: 'customers/:id/history', loadComponent: () => import('./features/customers/customer-history/customer-history').then(m => m.CustomerHistoryComponent) },
      { path: 'portfolio', loadComponent: () => import('./features/portfolio/customer-portfolio/customer-portfolio').then(m => m.CustomerPortfolioComponent) },
      // Calls (standalone components)
      { path: 'calls', loadComponent: () => import('./features/calls/call-list/call-list').then(m => m.CallListComponent) },
      { path: 'calls/:id', loadComponent: () => import('./features/calls/call-detail/call-detail').then(m => m.CallDetailComponent) },
      // Search pages
      { path: 'search/orders', loadComponent: () => import('./features/search/orders-search/orders-search').then(m => m.OrdersSearchComponent) },
      { path: 'search/refunds', loadComponent: () => import('./features/search/refunds-search/refunds-search').then(m => m.RefundsSearchComponent) },
      { path: 'orders/recent', loadComponent: () => import('./features/orders/recent-orders/recent-orders').then(m => m.RecentOrdersComponent) },
      { path: 'reports', loadComponent: () => import('./features/reports/reports-menu/reports-menu').then(m => m.ReportsMenuComponent), canActivate: [AuthGuard] },
      { path: 'reports/followups', loadComponent: () => import('./features/reports/followup-report/followup-report').then(m => m.FollowupReportComponent), canActivate: [AuthGuard] },
      { path: 'followups', loadComponent: () => import('./features/followups/followup-list/followup-list').then(m => m.FollowupListComponent), canActivate: [AuthGuard] },
      { path: 'customer-medicine-detail', loadComponent: () => import('./features/medicine/customer-medicine-detail/customer-medicine-detail').then(m => m.CustomerMedicineDetailComponent) },
      // Placeholder routes
      { path: 'messages', loadComponent: () => import('./shared/ui/not-implemented').then(m => m.NotImplementedComponent) },
      { path: 'settings', loadComponent: () => import('./shared/ui/not-implemented').then(m => m.NotImplementedComponent) },
      { path: 'profile', loadComponent: () => import('./shared/ui/not-implemented').then(m => m.NotImplementedComponent) },
      // Lazy-load feature modules that declare their own routes
      { path: '', loadChildren: () => import('./features/users/users-module').then(m => m.UsersModule) },
      { path: '', loadChildren: () => import('./features/roles/roles-routing.module').then(m => m.RolesRoutingModule) }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
