import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CallService } from '../../../shared/services/call';
import { CustomerService } from '../../../shared/services/customer';

@Component({
  selector: 'app-call-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './call-detail.html',
  styleUrls: ['./call-detail.scss']
})
export class CallDetailComponent implements OnInit {
  call: any;
  callForm!: FormGroup;
  isEditMode = false;
  isNewMode = false;
  customers: any[] = [];

  constructor(
    private callService: CallService,
    private customerService: CustomerService,
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder
  ) { }

  ngOnInit(): void {
    this.loadCustomers();
    this.initForm();
    
    const id = this.route.snapshot.paramMap.get('id');
    this.isNewMode = id === 'new';
    
    if (this.isNewMode) {
      this.call = {};
      this.isEditMode = true;
    } else if (id) {
      this.loadCall(+id);
    }
  }

  initForm(): void {
    this.callForm = this.fb.group({
      customerId: ['', Validators.required],
      type: ['', Validators.required],
      status: ['Open', Validators.required],
      date: [this.formatDateForInput(new Date()), Validators.required],
      notes: ['']
    });
  }

  loadCustomers(): void {
    this.customerService.getCustomers().subscribe({
      next: (data) => {
        this.customers = data;
      },
      error: (error) => {
        console.error('Error loading customers', error);
      }
    });
  }

  loadCall(id: number): void {
    this.callService.getCall(id).subscribe({
      next: (data) => {
        this.call = data;
        this.callForm.patchValue({
          customerId: data.customerId,
          type: data.callType,
          status: data.outcome,
          date: this.formatDateForInput(new Date(data.date)),
          notes: data.notes || ''
        });
      },
      error: (error) => {
        console.error('Error loading call', error);
      }
    });
  }

  formatDateForInput(date: Date): string {
    return date.toISOString().slice(0, 16);
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
  }

  onSubmit(): void {
    if (this.callForm.invalid) {
      return;
    }
    // Map form fields to backend model keys
    const callData = {
      customerId: this.callForm.value.customerId,
      callType: this.callForm.value.type,
      outcome: this.callForm.value.status,
      date: new Date(this.callForm.value.date).toISOString(),
      notes: this.callForm.value.notes || ''
    };

    if (this.isNewMode) {
      this.callService.createCall(callData).subscribe({
        next: () => {
          this.router.navigate(['/calls']);
        },
        error: (error) => {
          console.error('Error creating call', error);
        }
      });
    } else {
      this.callService.updateCall(this.call.id, callData).subscribe({
        next: () => {
          this.isEditMode = false;
          this.call = { ...this.call, ...callData };
        },
        error: (error) => {
          console.error('Error updating call', error);
        }
      });
    }
  }

  cancel(): void {
    if (this.isNewMode) {
      this.router.navigate(['/calls']);
    } else {
      this.isEditMode = false;
      this.callForm.patchValue({
        customerId: this.call.customerId,
        type: this.call.callType,
        status: this.call.outcome,
        date: this.formatDateForInput(new Date(this.call.date)),
        notes: this.call.notes || ''
      });
    }
  }
}
