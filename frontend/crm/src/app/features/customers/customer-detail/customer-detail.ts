import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CustomerService } from '../../../shared/services/customer';
import Swal from 'sweetalert2';
import fa from '@angular/common/locales/fa';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule],
  templateUrl: './customer-detail.html',
  styleUrls: ['./customer-detail.scss']
})
export class CustomerDetailComponent implements OnInit {
  customer: any;
  customerForm!: FormGroup;
  isEditMode = false;
  isNewMode = false;
  attachments: { filename: string; url: string }[] = [];
  selectedFiles: File[] = [];
  uploadType: string = 'document';

  constructor(
    private customerService: CustomerService,
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder
  ) { }

  ngOnInit(): void {
    this.initForm();
    debugger
    const id = this.route.snapshot.paramMap.get('id');
    this.isNewMode = id == null ? true :false ;
    
    if (this.isNewMode) {
      this.customer = {};
    } else if (id) {
      this.loadCustomer(+id);
      this.loadAttachments(+id);
    }
  }

  initForm(): void {
    this.customerForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[+()\-\s\d]{7,20}$/)]],
      company: [''],
      address: [''] 
    });

    if (this.isNewMode) {
      this.isEditMode = true;
    }
  }

  loadCustomer(id: number): void {
    this.customerService.getCustomer(id).subscribe({
      next: (data) => {
        this.customer = data;
        this.customerForm.patchValue({
          name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          email: data.email,
          phone: data.phone || '',
          company: data.company || '',
          address: data.address || ''
        });
      },
      error: (error) => {
        console.error('Error loading customer', error);
      }
    });
  }

  loadAttachments(id: number): void {
    this.customerService.getCustomerFiles(id).subscribe({
      next: resp => { this.attachments = resp.files || []; },
      error: err => { console.error('Error loading attachments', err); }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.selectedFiles = files;
  }

  uploadFiles(): void {
    if (!this.customer?.id) return;
    if (this.selectedFiles.length === 0) return;
    this.customerService.uploadCustomerFiles(this.customer.id, this.selectedFiles, this.uploadType).subscribe({
      next: resp => {
        this.selectedFiles = [];
        this.loadAttachments(this.customer.id);
        Swal.fire({ icon: 'success', title: 'Files uploaded', timer: 1200, showConfirmButton: false });
      },
      error: err => {
        console.error('Upload failed', err);
        Swal.fire({ icon: 'error', title: 'Upload failed', text: 'Please try again.' });
      }
    });
  }

  deleteAttachment(file: { filename: string }): void {
    if (!this.customer?.id) return;
    if (!file?.filename) return;
    this.customerService.deleteCustomerFile(this.customer.id, file.filename).subscribe({
      next: () => {
        this.loadAttachments(this.customer.id);
        Swal.fire({ icon: 'success', title: 'File deleted', timer: 1000, showConfirmButton: false });
      },
      error: err => {
        console.error('Delete failed', err);
        Swal.fire({ icon: 'error', title: 'Delete failed', text: 'Please try again.' });
      }
    });
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
  }

  onSubmit(): void {
    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      Swal.fire({ icon: 'warning', title: 'Invalid form', text: 'Please fix the highlighted fields.' });
      return;
    }

    const formValue = this.customerForm.value;
    const trimmedName = (formValue.name || '').trim();
    const parts = trimmedName.split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    const normalizePhone = (p: string) => (p || '').replace(/[\s\-()]/g, '');
    const customerData = {
      ...this.customer,
      email: formValue.email,
      phone: formValue.phone,
      company: formValue.company,
      address: formValue.address,
      firstName,
      lastName
    };
    // Uniqueness check for email and phone against existing customers
    this.customerService.getCustomers().subscribe({
      next: (customers) => {
        const emailLower = (customerData.email || '').toLowerCase();
        const phoneNorm = normalizePhone(customerData.phone || '');
        const conflict = customers.some((c: any) => {
          const sameEmail = (c.email || '').toLowerCase() === emailLower;
          const samePhone = normalizePhone(c.phone || '') === phoneNorm;
          const sameId = this.customer && c.id === this.customer.id;
          return !sameId && (sameEmail || samePhone);
        });

        if (conflict) {
          Swal.fire({ icon: 'error', title: 'Duplicate found', text: 'Email or phone already exists for another customer.' });
          return;
        }

        if (this.isNewMode) {
          this.customerService.createCustomer(customerData).subscribe({
            next: () => {
              Swal.fire({ icon: 'success', title: 'Customer created', timer: 1500, showConfirmButton: false })
                .then(() => this.router.navigate(['/customers']));
            },
            error: (error) => {
              console.error('Error creating customer', error);
              Swal.fire({ icon: 'error', title: 'Create failed', text: 'Unable to create customer. Please try again.' });
            }
          });
        } else {
          this.customerService.updateCustomer(this.customer.id, customerData).subscribe({
            next: () => {
              this.isEditMode = false;
              this.customer = customerData;
              Swal.fire({ icon: 'success', title: 'Customer updated', timer: 1500, showConfirmButton: false });
            },
            error: (error) => {
              console.error('Error updating customer', error);
              Swal.fire({ icon: 'error', title: 'Update failed', text: 'Unable to update customer. Please try again.' });
            }
          });
        }
      },
      error: (error) => {
        console.error('Error validating uniqueness', error);
        // Fallback: proceed with submit and rely on backend validation if present
        if (this.isNewMode) {
          this.customerService.createCustomer(customerData).subscribe({
            next: () => {
              Swal.fire({ icon: 'success', title: 'Customer created', timer: 1500, showConfirmButton: false })
                .then(() => this.router.navigate(['/customers']));
            },
            error: (err) => {
              console.error('Error creating customer', err);
              Swal.fire({ icon: 'error', title: 'Create failed', text: 'Unable to create customer. Please try again.' });
            }
          });
        } else {
          this.customerService.updateCustomer(this.customer.id, customerData).subscribe({
            next: () => {
              this.isEditMode = false;
              this.customer = customerData;
              Swal.fire({ icon: 'success', title: 'Customer updated', timer: 1500, showConfirmButton: false });
            },
            error: (err) => {
              console.error('Error updating customer', err);
              Swal.fire({ icon: 'error', title: 'Update failed', text: 'Unable to update customer. Please try again.' });
            }
          });
        }
      }
    });
  }

  cancel(): void {
    if (this.isNewMode) {
      this.router.navigate(['/customers']);
    } else {
      this.isEditMode = false;
      this.customerForm.patchValue({
        name: `${this.customer.firstName || ''} ${this.customer.lastName || ''}`.trim(),
        email: this.customer.email,
        phone: this.customer.phone || '',
        company: this.customer.company || '',
        address: this.customer.address || ''
      });
    }
  }
}
