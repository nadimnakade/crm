import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CallService } from '../../../core/services/call.service';
import { CustomerService } from '../../../core/services/customer.service';

@Component({
  selector: 'app-call-detail',
  templateUrl: './call-detail.component.html',
  styleUrls: ['./call-detail.component.scss'],
  standalone:false
})

export class CallDetailComponent implements OnInit {
  callId: string | null = null;
  callForm: FormGroup;
  isNewCall = false;
  customers: any[] = [];
  isLoading = false;
  currentCall: any = null;
  attachments: any[] = [];
  statusHistory: any[] = [];

  // File upload properties
  medicineListFile: File | null = null;
  prescriptionFile: File | null = null;
  additionalFile: File | null = null;
  uploadSuccess = {
    medicineList: false,
    prescription: false,
    additional: false
  };
  uploadMessages = {
    medicineList: '',
    prescription: '',
    additional: ''
  };

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private callService: CallService,
    private customerService: CustomerService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadCustomers();

    this.callId = this.route.snapshot.paramMap.get('id');
    if (this.callId && this.callId !== 'new') {
      this.loadCallDetails();
    } else {
      this.isNewCall = true;
    }
  }

  initForm(): void {
    this.callForm = this.fb.group({
      customerId: ['', Validators.required],
      orderId: [''],
      address: [''],
      mobileNo: [''],
      callType: ['inbound', Validators.required],
      startTime: [new Date(), Validators.required],
      endTime: [null],
      duration: [null],
      notes: [''],
      status: ['new', Validators.required],
      followUpRequired: [false],
      followUpDate: [null]
    });
  }

  loadCustomers(): void {
    this.customerService.getCustomers().subscribe(
      data => {
        this.customers = data;
      },
      error => {
        console.error('Error loading customers', error);
      }
    );
  }

  loadCallDetails(): void {
    if (!this.callId) {
      console.error('Call ID is required for loading call details');
      return;
    }
    
    this.isLoading = true;
    this.callService.getCallById(this.callId).subscribe(
      call => {
        // Convert date strings to Date objects
        if (call.startTime) call.startTime = new Date(call.startTime);
        if (call.endTime) call.endTime = new Date(call.endTime);
        if (call.followUpDate) call.followUpDate = new Date(call.followUpDate);

        this.callForm.patchValue(call);
        this.currentCall = call;
        this.isLoading = false;

        // Load attachments and status history
        if (this.callId) {
          this.callService.getCallFiles(this.callId).subscribe(
            files => { this.attachments = files || []; },
            err => { console.error('Error loading files', err); this.attachments = []; }
          );
          this.callService.getCallHistory(this.callId).subscribe(
            history => { this.statusHistory = history || []; },
            err => { console.error('Error loading status history', err); this.statusHistory = []; }
          );
        }

        // If navigated with fragment, scroll to attachments section
        setTimeout(() => {
          const frag = this.route.snapshot.fragment;
          if (frag === 'attachments') {
            const el = document.getElementById('attachments');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (frag === 'history') {
            const el = document.getElementById('history');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 0);
      },
      error => {
        console.error('Error loading call details', error);
        this.isLoading = false;
      }
    );
  }

  onSubmit(): void {
    if (this.callForm.invalid) {
      return;
    }

    const callData = this.callForm.value;

    if (this.isNewCall) {
      this.callService.createCall(callData).subscribe(
        response => {
          this.router.navigate(['/calls', response.id]);
        },
        error => {
          console.error('Error creating call', error);
        }
      );
    } else {
      if (!this.callId) {
        console.error('Call ID is required for updating');
        return;
      }
      this.callService.updateCall(this.callId, callData).subscribe(
        () => {
          // Stay on the same page after update
          this.loadCallDetails();
        },
        error => {
          console.error('Error updating call', error);
        }
      );
    }
  }

  // File upload methods
  onMedicineListSelected(event: any): void {
    if (event.target.files.length > 0) {
      this.medicineListFile = event.target.files[0];
    }
  }

  onPrescriptionSelected(event: any): void {
    if (event.target.files.length > 0) {
      this.prescriptionFile = event.target.files[0];
    }
  }

  onAdditionalFileSelected(event: any): void {
    if (event.target.files.length > 0) {
      this.additionalFile = event.target.files[0];
    }
  }

  uploadMedicineList(): void {
    if (!this.medicineListFile || !this.callId || this.callId === 'new') {
      return;
    }

    this.callService.uploadMedicineList(this.callId, this.medicineListFile).subscribe(
      response => {
        this.uploadSuccess.medicineList = true;
        this.uploadMessages.medicineList = 'Medicine list uploaded successfully';
        // Refresh attachments list
        if (this.callId) this.callService.getCallFiles(this.callId).subscribe(files => this.attachments = files || []);
      },
      error => {
        this.uploadSuccess.medicineList = false;
        this.uploadMessages.medicineList = 'Error uploading medicine list';
        console.error('Error uploading medicine list', error);
      }
    );
  }

  uploadPrescription(): void {
    if (!this.prescriptionFile || !this.callId || this.callId === 'new') {
      return;
    }

    this.callService.uploadPrescription(this.callId, this.prescriptionFile).subscribe(
      response => {
        this.uploadSuccess.prescription = true;
        this.uploadMessages.prescription = 'Prescription uploaded successfully';
        // Refresh attachments list
        if (this.callId) this.callService.getCallFiles(this.callId).subscribe(files => this.attachments = files || []);
      },
      error => {
        this.uploadSuccess.prescription = false;
        this.uploadMessages.prescription = 'Error uploading prescription';
        console.error('Error uploading prescription', error);
      }
    );
  }

  uploadAdditionalFile(): void {
    if (!this.additionalFile || !this.callId || this.callId === 'new') {
      return;
    }

    this.callService.uploadDocument(this.callId, this.additionalFile).subscribe(
      response => {
        this.uploadSuccess.additional = true;
        this.uploadMessages.additional = 'Document uploaded successfully';
        // Refresh attachments list
        if (this.callId) this.callService.getCallFiles(this.callId).subscribe(files => this.attachments = files || []);
      },
      error => {
        this.uploadSuccess.additional = false;
        this.uploadMessages.additional = 'Error uploading document';
        console.error('Error uploading document', error);
      }
    );
  }
}
