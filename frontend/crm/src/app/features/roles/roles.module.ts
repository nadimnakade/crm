import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { RoleListComponent } from './role-list/role-list';
import { RoleDetailComponent } from './role-detail/role-detail';
import { RolesRoutingModule } from '../roles/roles-routing.module';


@NgModule({
  declarations: [
    RoleListComponent,
    RoleDetailComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    RolesRoutingModule
  ],
  exports: [
    RoleListComponent,
    RoleDetailComponent
  ]
})
export class RolesModule { }
