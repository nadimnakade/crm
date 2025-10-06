import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleListComponent } from './role-list/role-list';
import { RoleDetailComponent } from './role-detail/role-detail';
import { AuthGuard } from '../../shared/guards/auth.guard';
import { AdminGuard } from '../../shared/guards/admin.guard';

const routes: Routes = [
  {
    path: '',
    component: RoleListComponent,
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'new',
    component: RoleDetailComponent,
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: ':id',
    component: RoleDetailComponent,
    canActivate: [AuthGuard, AdminGuard]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RolesRoutingModule { }