import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { CallDetailComponent } from './call-detail/call-detail.component';
import { CallListComponent } from './call-list/call-list.component';

@NgModule({
  declarations: [
    CallDetailComponent,
    CallListComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule
  ],
  exports: [
    CallDetailComponent,
    CallListComponent
  ]
})
export class CallsModule { }