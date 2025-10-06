import { Routes } from '@angular/router';
import { LoginComponent } from './shared/auth/login/login';
import { RegisterComponent } from './shared/auth/register/register';
import { DashboardComponent } from './features/dashboard/dashboard';
import { AuthGuard } from './shared/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'dashboard', component: DashboardComponent },
  // Authenticated app routes under shared layout
  {
    path: '',
    loadComponent: () => import('./shared/layout/layout').then(m => m.LayoutComponent),
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: '/customers', pathMatch: 'full' },
      // Customers (standalone components)
      { path: 'customers', loadComponent: () => import('./features/customers/customer-list/customer-list').then(m => m.CustomerListComponent) },
      { path: 'customers/new', loadComponent: () => import('./features/customers/customer-detail/customer-detail').then(m => m.CustomerDetailComponent) },
      { path: 'customers/:id', loadComponent: () => import('./features/customers/customer-detail/customer-detail').then(m => m.CustomerDetailComponent) },
      // Calls (standalone components)
      { path: 'calls', loadComponent: () => import('./features/calls/call-list/call-list').then(m => m.CallListComponent) },
      { path: 'calls/:id', loadComponent: () => import('./features/calls/call-detail/call-detail').then(m => m.CallDetailComponent) },
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
