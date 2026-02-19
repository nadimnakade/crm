
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-followup-status-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './followup-status-dialog.html',
  styleUrls: ['./followup-status-dialog.scss']
})
export class FollowupStatusDialogComponent {
  @Input() followup: any;
  @Output() save = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  status: string = '';
  reason: string = '';
  notes: string = '';
  followUpDate: string = '';
  
  statusOptions = [
    'Lead',
    'Re-Follow-up',
    'Order',
    'Order Already Placed',
    'Not Interested',
    'Not Required',
    'No Answer'
  ];

  constructor() {}

  ngOnInit() {
    if (this.followup) {
      // Initialize if needed, though usually we start fresh for a status update
      this.status = this.followup.outcome || '';
      if (this.followup.followUpDate) {
        const d = new Date(this.followup.followUpDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          this.followUpDate = `${y}-${m}-${day}`;
        }
      }
    }
  }

  onSave() {
    if (!this.status) {
      alert('Please select a status');
      return;
    }
    if (!this.reason) {
      alert('Reason is mandatory');
      return;
    }
    if (this.status === 'Re-Follow-up' && !this.followUpDate) {
      alert('Please select a follow-up date for Re-Follow-up');
      return;
    }

    this.save.emit({
      status: this.status,
      reason: this.reason,
      notes: this.notes,
      followUpDate: this.followUpDate || null
    });
  }

  onCancel() {
    this.cancel.emit();
  }
}
