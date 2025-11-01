import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CustomerService } from '../../../shared/services/customer';
import { CallService } from '../../../shared/services/call';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-customer-history',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './customer-history.html',
  styleUrls: ['./customer-history.scss']
})
export class CustomerHistoryComponent implements OnInit {
  customerId!: number;
  customer: any;
  calls: any[] = [];
  historyForm!: FormGroup;
  isLoading = false;
  // Category/Sub Category options keyed by call type
  callTypeOptions = [
    { value: 'inbound', label: 'Inbound' },
    { value: 'outbound', label: 'Outbound' }
  ];

  categoryMap: Record<string, Array<{ value: string; label: string; subs: Array<{ value: string; label: string }> }>> = {
    inbound: [
      { value: 'existing-order', label: 'Existing Order', subs: [
        // { value: 'agent-comment', label: 'Agent Comment' },
        { value: 'refund-call-transfer', label: 'Call Transfer' },
        { value: 'refund-complaint', label: 'Call Complaint' },
        { value: 'refund-order-status', label: 'Order Status' },
        { value: 'refund-status', label: 'Refund Status' },
        { value: 'refund-generation', label: 'Refund Generation' }
      ]},
      { value: 'new-order-related', label: 'New Order Related', subs: [
        { value: 'discount-query', label: 'Discount Query' },
        { value: 'follow-up-scheduled', label: 'Follow-up Scheduled' },
        { value: 'lead', label: 'Lead' }
      ]},
       { value: 'lab-option', label: 'Lab', subs: [
        { value: 'lab-statusy', label: 'Status' },
        { value: 'lab-report', label: 'Report' },
        { value: 'lab-enquiry', label: 'Enquiry' }
      ]},
      { value: 'return-related', label: 'Return Related', subs: [
        { value: 'for-return', label: 'For Return' }
      ]}
    ],
    outbound: [
      { value: 'sales-call', label: 'Sales Call', subs: [
        { value: 'Yes', label: 'Lead' },
        { value: 'No', label: 'FollowUp' }
      ]},
      { value: 'previous-order-history', label: 'Previous Order History', subs: [
        { value: 'order-entry', label: 'Order Entry' },
        { value: 'other-details', label: 'Other Details' }
      ]}
    ]
  };

  currentCategories: Array<{ value: string; label: string }> = [];
  currentSubCategories: Array<{ value: string; label: string }> = [];

  // Refund Generation modal state
  showRefundModal = false;
  refundForm!: FormGroup;
  refundImageFile: File | null = null;

  // Order Details modal state
  showOrderModal = false;
  orderDetailsForm!: FormGroup;

  // Listing data captured via modals (UI-only for now)
  orderDetailsList: Array<{ customerName: string; customerMobileNo: string; mrp: string; pay: string; orderId: string; followupDate: string; alternate: 'Yes' | 'No' }> = [];
  refundDetailsList: Array<{ customerName: string; customerNumber: string; customerOrderId: string; medicineName: string; medicineQty: string; returnReason: string; accountHolderName: string; accountNumber: string; ifscCode: string; imageName?: string }> = [];

  // Expanded interaction details row state
  expandedId: number | null = null;

  // Attachments per call (loaded on demand)
  attachmentsByCall: Record<number, Array<{ name: string; url: string; type: string }>> = {};

  // Order modal mode: add new vs view existing
  orderModalMode: 'add' | 'view' = 'add';

  constructor(
    private route: ActivatedRoute,
    private customerService: CustomerService,
    private callService: CallService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.customerId = idParam ? parseInt(idParam, 10) : 0;
    this.initForm();
    this.initRefundForm();
    this.initOrderDetailsForm();
    this.loadCustomer();
    this.loadHistory();
  }

  initForm(): void {
    this.historyForm = this.fb.group({
      callType: ['inbound', Validators.required],
      category: ['', Validators.required],
      subCategory: ['', Validators.required],
      orderId: [''],
      date: [new Date().toISOString().slice(0, 16), Validators.required],
      notes: ['', [Validators.required, Validators.minLength(5)]]
    });

    // Initialize category/subcategory options
    this.updateCategoryOptions('inbound');
    // React to changes
    this.historyForm.get('callType')?.valueChanges.subscribe((val) => {
      this.updateCategoryOptions(val);
      this.historyForm.patchValue({ category: '', subCategory: '' });
    });
    this.historyForm.get('category')?.valueChanges.subscribe((val) => {
      this.updateSubCategoryOptions(this.historyForm.get('callType')?.value, val);
      this.historyForm.patchValue({ subCategory: '' });
    });
    this.historyForm.get('subCategory')?.valueChanges.subscribe((val) => {
      if (val === 'refund-generation') {
        this.showRefundModal = true;
      }
    });
  }

  updateCategoryOptions(callType: string): void {
    const defs = this.categoryMap[callType] || [];
    this.currentCategories = defs.map(d => ({ value: d.value, label: d.label }));
    // Reset subcategories based on first category
    if (defs.length > 0) {
      this.updateSubCategoryOptions(callType, defs[0].value);
    } else {
      this.currentSubCategories = [];
    }
  }

  updateSubCategoryOptions(callType: string, category: string): void {
    const defs = this.categoryMap[callType] || [];
    const match = defs.find(d => d.value === category);
    this.currentSubCategories = (match?.subs || []).map(s => ({ value: s.value, label: s.label }));
  }

  // Display mapping for Sub Category in table
  displaySubCategory(call: any): string {
    const outcome = (call?.outcome || '').toString();
    const callType = (call?.callType || '').toString().toLowerCase();
    const category = (call?.category || '').toString().toLowerCase();
    const isSalesOutbound = callType === 'outbound' && (category === 'sales' || category === 'sales-call');
    if (!outcome) return '—';
    if (isSalesOutbound) {
      if (outcome.toLowerCase() === 'yes' || outcome.toLowerCase() === 'positive') return 'Lead';
      if (outcome.toLowerCase() === 'no' || outcome.toLowerCase() === 'negative') return 'FollowUp';
    }
    return outcome;
  }

  initRefundForm(): void {
    this.refundForm = this.fb.group({
      customerName: ['', Validators.required],
      customerNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      customerOrderId: ['', Validators.required],
      medicineName: ['', Validators.required],
      medicineQty: ['', [Validators.required, Validators.pattern(/^[0-9]+$/)]],
      returnReason: ['', Validators.required],
      accountHolderName: ['', Validators.required],
      accountNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{9,18}$/)]],
      ifscCode: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/)]]
    });
  }

  initOrderDetailsForm(): void {
    this.orderDetailsForm = this.fb.group({
      customerName: ['', Validators.required],
      customerMobileNo: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      mrp: ['', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]],
      pay: ['', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]],
      orderId: ['', Validators.required],
      followupDate: [''], // conditional
      alternate: ['No', Validators.required]
    });

    // React to interaction context to toggle followup validator
    const applyFollowupRequirement = () => {
      const ct = (this.historyForm.get('callType')?.value || '').toString().toLowerCase();
      const cat = (this.historyForm.get('category')?.value || '').toString().toLowerCase();
      const sub = (this.historyForm.get('subCategory')?.value || '').toString().toLowerCase();
      const isOutboundFollowUp = ct === 'outbound' && cat === 'sales-call' && sub === 'no';
      const isInboundScheduled = ct === 'inbound' && cat === 'new-order-related' && sub === 'follow-up-scheduled';
      const ctrl = this.orderDetailsForm.get('followupDate');
      if (!ctrl) return;
      if (isOutboundFollowUp || isInboundScheduled) {
        ctrl.setValidators([Validators.required]);
      } else {
        ctrl.clearValidators();
      }
      ctrl.updateValueAndValidity({ emitEvent: false });
    };

    applyFollowupRequirement();
    this.historyForm.get('callType')?.valueChanges.subscribe(() => applyFollowupRequirement());
    this.historyForm.get('category')?.valueChanges.subscribe(() => applyFollowupRequirement());
    this.historyForm.get('subCategory')?.valueChanges.subscribe(() => applyFollowupRequirement());
  }

  // Sanitize mobile input to digits-only and clamp to 10
  onOrderMobileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value || '';
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 10);
    if (input.value !== digits) {
      input.value = digits;
    }
    const ctrl = this.orderDetailsForm.get('customerMobileNo');
    ctrl?.setValue(digits);
    ctrl?.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }

  toggleDetails(id: number): void {
    this.expandedId = this.expandedId === id ? null : id;
    if (this.expandedId) {
      this.loadAttachments(this.expandedId);
    }
  }

  onRefundImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.refundImageFile = files.length > 0 ? files[0] : null;
  }

  cancelRefundModal(): void {
    this.showRefundModal = false;
    this.refundImageFile = null;
  }

  submitRefundModal(): void {
    if (this.refundForm.invalid) {
      this.refundForm.markAllAsTouched();
      Swal.fire({ icon: 'warning', title: 'Incomplete details', text: 'Please fill all required fields.' });
      return;
    }
    // Map orderId from modal into interaction form
    const orderId = this.refundForm.value.customerOrderId;
    this.historyForm.patchValue({ orderId });
    // Append refund details into notes for persistence
    const v = this.refundForm.value;
    const summary = `Refund Details: Customer Name=${v.customerName}, Number=${v.customerNumber}, OrderId=${v.customerOrderId}, Medicine=${v.medicineName}, Qty=${v.medicineQty}, Reason=${v.returnReason}, Account Holder=${v.accountHolderName}, Account No=${v.accountNumber}, IFSC=${v.ifscCode}`;
    const existingNotes = this.historyForm.value.notes || '';
    const combinedNotes = existingNotes ? `${existingNotes}\n${summary}` : summary;
    this.historyForm.patchValue({ notes: combinedNotes });

    // Track for UI listing
    this.refundDetailsList.push({
      customerName: v.customerName,
      customerNumber: v.customerNumber,
      customerOrderId: v.customerOrderId,
      medicineName: v.medicineName,
      medicineQty: v.medicineQty,
      returnReason: v.returnReason,
      accountHolderName: v.accountHolderName,
      accountNumber: v.accountNumber,
      ifscCode: v.ifscCode,
      imageName: this.refundImageFile?.name
    });
    this.showRefundModal = false;
    // Proceed with main submission
    this.submitHistory();
  }

  get isFollowupRequired(): boolean {
    const ct = (this.historyForm.get('callType')?.value || '').toString().toLowerCase();
    const cat = (this.historyForm.get('category')?.value || '').toString().toLowerCase();
    const sub = (this.historyForm.get('subCategory')?.value || '').toString().toLowerCase();
    return (ct === 'outbound' && cat === 'sales-call' && sub === 'no') ||
           (ct === 'inbound' && cat === 'new-order-related' && sub === 'follow-up-scheduled');
  }

  openOrderModal(): void {
    this.orderModalMode = 'add';
    this.showOrderModal = true;
  }

  cancelOrderModal(): void {
    this.showOrderModal = false;
    this.orderModalMode = 'add';
  }

  submitOrderModal(): void {
    if (this.orderDetailsForm.invalid) {
      this.orderDetailsForm.markAllAsTouched();
      Swal.fire({ icon: 'warning', title: 'Incomplete details', text: 'Please fill all required fields.' });
      return;
    }
    if (this.orderModalMode === 'view') {
      // View-only mode: no submission, just close
      this.showOrderModal = false;
      this.orderModalMode = 'add';
      return;
    }
    const v = this.orderDetailsForm.value;
    // Patch main interaction form with OrderId from modal
    this.historyForm.patchValue({ orderId: v.orderId });
    // Track in UI list
    this.orderDetailsList.push({
      customerName: v.customerName,
      customerMobileNo: v.customerMobileNo,
      mrp: v.mrp,
      pay: v.pay,
      orderId: v.orderId,
      followupDate: v.followupDate,
      alternate: v.alternate
    });
    this.showOrderModal = false;
  }

  // Open order details modal for an existing call (view-only)
  openOrderModalForCall(call: any): void {
    const od = typeof call.orderDetails === 'string' ? this.parseJSON(call.orderDetails) : call.orderDetails;
    if (!od) {
      Swal.fire({ icon: 'info', title: 'No order details', text: 'This interaction has no order details.' });
      return;
    }
    this.orderDetailsForm.patchValue({
      customerName: od.customerName || '',
      customerMobileNo: od.customerMobileNo || '',
      mrp: od.mrp || '',
      pay: od.pay || '',
      orderId: od.orderId || '',
      followupDate: od.followupDate || '',
      alternate: od.alternate || 'No'
    });
    this.orderModalMode = 'view';
    this.showOrderModal = true;
  }

  // Load attachments for a specific call
  loadAttachments(callId: number): void {
    if (!callId) return;
    this.callService.getCallFiles(callId).subscribe({
      next: (files) => {
        this.attachmentsByCall[callId] = Array.isArray(files) ? files : [];
      },
      error: (err) => {
        console.error('Failed to load attachments', err);
        this.attachmentsByCall[callId] = [];
      }
    });
  }

  loadCustomer(): void {
    if (!this.customerId) return;
    this.customerService.getCustomer(this.customerId).subscribe({
      next: (data) => this.customer = data,
      error: (err) => console.error('Failed to load customer', err)
    });
  }

  loadHistory(): void {
    if (!this.customerId) return;
    this.isLoading = true;
    this.callService.getCalls({ customerId: this.customerId, pageSize: 100, sortBy: 'date', sortOrder: 'DESC' }).subscribe({
      next: (resp) => {
        const data = Array.isArray(resp.data) ? resp.data : [];
        // Normalize NVARCHAR JSON fields for order/refund details
        const normalized = data.map((c: any) => ({
          ...c,
          orderDetails: typeof c.orderDetails === 'string' ? this.parseJSON(c.orderDetails) : c.orderDetails,
          refundDetails: typeof c.refundDetails === 'string' ? this.parseJSON(c.refundDetails) : c.refundDetails
        }));
        this.calls = normalized;
        // Populate the bottom Order Details section from persisted history
        this.orderDetailsList = normalized
          .filter((c: any) => !!c.orderDetails)
          .map((c: any) => ({
            customerName: c.orderDetails.customerName || '',
            customerMobileNo: c.orderDetails.customerMobileNo || '',
            mrp: c.orderDetails.mrp || '',
            pay: c.orderDetails.pay || '',
            orderId: c.orderDetails.orderId || '',
            followupDate: c.orderDetails.followupDate || '',
            alternate: c.orderDetails.alternate || 'No'
          }));
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load history', err);
        this.isLoading = false;
      }
    });
  }

  private parseJSON(value: any): any {
    if (!value) return undefined;
    if (typeof value !== 'string') return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  submitHistory(): void {
    if (this.historyForm.invalid) {
      Swal.fire({ icon: 'warning', title: 'Invalid form', text: 'Please fill all required fields.' });
      return;
    }
    if (this.historyForm.value.subCategory === 'refund-generation' && this.showRefundModal) {
      // Await modal completion
      Swal.fire({ icon: 'info', title: 'Refund details required', text: 'Please complete the refund form.' });
      return;
    }
    const { callType, category, subCategory, orderId, date, notes } = this.historyForm.value;
    // Prepare structured details for backend persistence (latest entries)
    const lastOrder = this.orderDetailsList.length > 0 ? this.orderDetailsList[this.orderDetailsList.length - 1] : null;
    const lastRefund = this.refundDetailsList.length > 0 ? this.refundDetailsList[this.refundDetailsList.length - 1] : null;
    const payload = {
      customerId: this.customerId,
      callType,
      category,
      orderId: orderId || null,
      date: new Date(date),
      notes,
      outcome: subCategory,
      orderDetails: lastOrder ? {
        customerName: lastOrder.customerName,
        customerMobileNo: lastOrder.customerMobileNo,
        mrp: lastOrder.mrp,
        pay: lastOrder.pay,
        orderId: lastOrder.orderId,
        followupDate: lastOrder.followupDate,
        alternate: lastOrder.alternate
      } : undefined,
      followUpDate: lastOrder && lastOrder.followupDate ? new Date(lastOrder.followupDate) : undefined,
      refundDetails: lastRefund ? {
        customerName: lastRefund.customerName,
        customerNumber: lastRefund.customerNumber,
        customerOrderId: lastRefund.customerOrderId,
        medicineName: lastRefund.medicineName,
        medicineQty: lastRefund.medicineQty,
        returnReason: lastRefund.returnReason,
        accountHolderName: lastRefund.accountHolderName,
        accountNumber: lastRefund.accountNumber,
        ifscCode: lastRefund.ifscCode,
        imageName: lastRefund.imageName
      } : undefined
    };

    this.callService.createCall(payload).subscribe({
      next: (created) => {
        // Upload refund image to customer attachments if provided
        if (this.refundImageFile) {
          this.customerService.uploadCustomerFiles(this.customerId, [this.refundImageFile], 'image').subscribe({
            next: () => {},
            error: (err) => console.error('Failed to upload refund image', err)
          });
          this.refundImageFile = null;
        }
        Swal.fire({ icon: 'success', title: 'Logged', text: 'Interaction logged successfully.' });
        this.historyForm.reset();
        this.loadHistory();
      },
      error: (err) => {
        console.error('Failed to create call', err);
        const msg = err?.error?.message || 'Failed to log interaction';
        Swal.fire({ icon: 'error', title: 'Error', text: msg });
      }
    });
  }
}