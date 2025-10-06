import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleListComponent } from './role-list/role-list';
import { RoleDetailComponent } from './role-detail/role-detail';
import { AuthGuard } from '../../shared/guards/auth.guard';


const routes: Routes = [
  { path: 'roles', component: RoleListComponent, canActivate: [AuthGuard] },
  { path: 'roles/new', component: RoleDetailComponent, canActivate: [AuthGuard] },
  { path: 'roles/:id', component: RoleDetailComponent, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RolesRoutingModule { }
