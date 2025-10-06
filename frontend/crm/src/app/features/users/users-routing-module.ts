import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserListComponent } from './user-list/user-list';
import { UserDetailComponent } from './user-detail/user-detail';
import { AuthGuard } from '../../shared/guards/auth.guard';
import { AdminGuard } from '../../shared/guards/admin.guard';

const routes: Routes = [
  { path: 'users', component: UserListComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'users/new', component: UserDetailComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'users/:id', component: UserDetailComponent, canActivate: [AuthGuard, AdminGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UsersRoutingModule { }
