import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { UsersRoutingModule } from './users-routing-module';
import { UserListComponent } from './user-list/user-list';
import { UserDetailComponent } from './user-detail/user-detail';

@NgModule({
  declarations: [
    UserListComponent,
    UserDetailComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    UsersRoutingModule
  ],
  exports: [
    UserListComponent,
    UserDetailComponent
  ]
})
export class UsersModule { }
