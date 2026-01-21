
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

    this.save.emit({
      status: this.status,
      reason: this.reason,
      notes: this.notes
    });
  }

  onCancel() {
    this.cancel.emit();
  }
}
