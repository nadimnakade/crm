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
      { path: 'orders/upload', loadComponent: () => import('./features/orders/upload-orders/upload-orders').then(m => m.UploadOrdersComponent), canActivate: [AuthGuard, AdminGuard] },
      { path: 'orders/reorder-list', loadComponent: () => import('./features/orders/reorder-list/reorder-list').then(m => m.ReorderListComponent) },
      { path: 'orders/uploaded', loadComponent: () => import('./features/orders/uploaded-orders/uploaded-orders').then(m => m.UploadedOrdersComponent) },
      { path: 'reports', loadComponent: () => import('./features/reports/reports-menu/reports-menu').then(m => m.ReportsMenuComponent), canActivate: [AuthGuard] },
      { path: 'reports/followups', loadComponent: () => import('./features/reports/followup-report/followup-report').then(m => m.FollowupReportComponent), canActivate: [AuthGuard] },
      { path: 'reports/order-status', loadComponent: () => import('./features/reports/order-status-report/order-status-report').then(m => m.OrderStatusReportComponent), canActivate: [AuthGuard] },
      { path: 'followups', loadComponent: () => import('./features/followups/followup-list/followup-list').then(m => m.FollowupListComponent), canActivate: [AuthGuard] },
      { path: 'followups/upload', loadComponent: () => import('./features/followups/followup-upload/followup-upload').then(m => m.FollowupUploadComponent), canActivate: [AuthGuard, AdminGuard] },
      { path: 'followups/uploaded', loadComponent: () => import('./features/followups/followup-uploaded-list/followup-uploaded-list').then(m => m.FollowupUploadedListComponent), canActivate: [AuthGuard] },
      { path: 'followups/important-calls', loadComponent: () => import('./features/followups/important-calls/important-calls').then(m => m.ImportantCallsComponent), canActivate: [AuthGuard] },
      { path: 'followups/important-calls/upload', loadComponent: () => import('./features/followups/important-calls-upload/important-calls-upload').then(m => m.ImportantCallsUploadComponent), canActivate: [AuthGuard, AdminGuard] },
      { path: 'followups/today', loadComponent: () => import('./features/followups/today-followups/today-followups').then(m => m.TodayFollowupsComponent), canActivate: [AuthGuard] },
      { path: 'followups/orders', loadComponent: () => import('./features/followups/order-followup-uploaded-list/order-followup-uploaded-list').then(m => m.OrderFollowupUploadedListComponent), canActivate: [AuthGuard] },
      { path: 'followups/history', loadComponent: () => import('./features/followups/followup-history/followup-history').then(m => m.FollowupHistoryComponent), canActivate: [AuthGuard] },
      { path: 'followups/counts-hierarchy', loadComponent: () => import('./features/reports/followup-counts-hierarchy').then(m => m.FollowupCountsHierarchyComponent), canActivate: [AuthGuard] },
      { path: 'followups/reorder-history', loadComponent: () => import('./features/followups/reorder-history/reorder-history').then(m => m.ReorderHistoryComponent), canActivate: [AuthGuard] },
      { path: 'customer-medicine-detail', loadComponent: () => import('./features/medicine/customer-medicine-detail/customer-medicine-detail').then(m => m.CustomerMedicineDetailComponent) },
      { path: 'my-base', loadComponent: () => import('./features/my-base/my-base').then(m => m.MyBaseComponent), canActivate: [AuthGuard] },
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

