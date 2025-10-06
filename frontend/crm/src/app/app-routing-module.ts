import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './shared/guards/auth.guard';
import { CustomerListComponent } from './features/customers/customer-list/customer-list';
import { CustomerDetailComponent } from './features/customers/customer-detail/customer-detail';
import { CallListComponent } from './features/calls/call-list/call-list';
import { CallDetailComponent } from './features/calls/call-detail/call-detail';
import { UserListComponent } from './features/users/user-list/user-list';
import { UserDetailComponent } from './features/users/user-detail/user-detail';
import { RoleListComponent } from './features/roles/role-list/role-list';
import { RoleDetailComponent } from './features/roles/role-detail/role-detail';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent), canActivate: [AuthGuard] },
  { path: 'customers', component: CustomerListComponent, canActivate: [AuthGuard] },
  { path: 'customers/new', component: CustomerDetailComponent, canActivate: [AuthGuard] },
  { path: 'customers/:id', component: CustomerDetailComponent, canActivate: [AuthGuard] },
  { path: 'calls', component: CallListComponent, canActivate: [AuthGuard] },
  { path: 'calls/:id', component: CallDetailComponent, canActivate: [AuthGuard] },
  { path: 'users', component: UserListComponent, canActivate: [AuthGuard] },
  { path: 'users/new', component: UserDetailComponent, canActivate: [AuthGuard] },
  { path: 'users/:id', component: UserDetailComponent, canActivate: [AuthGuard] },
  { path: 'roles', component: RoleListComponent, canActivate: [AuthGuard] },
  { path: 'roles/new', component: RoleDetailComponent, canActivate: [AuthGuard] },
  { path: 'roles/:id', component: RoleDetailComponent, canActivate: [AuthGuard] },
  { path: 'login', loadComponent: () => import('./shared/auth/login/login').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./shared/auth/register/register').then(m => m.RegisterComponent) },
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
