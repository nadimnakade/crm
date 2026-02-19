import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CallService } from '../../../core/services/call.service';

@Component({
  selector: 'app-followup-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './followup-upload.html'
})
export class FollowupUploadComponent {
  selectedFile: File | null = null;
  uploading = false;
  result: { inserted: number; skipped: number; errors: any[] } | null = null;

  constructor(private callService: CallService) {}

  onFileChange(event: any): void {
    const file = event.target.files && event.target.files[0];
    this.selectedFile = file || null;
  }

  upload(): void {
    if (!this.selectedFile) return;
    this.uploading = true;
    this.result = null;
    this.callService.uploadFollowUps(this.selectedFile).subscribe({
      next: (res) => {
        this.result = res;
        this.uploading = false;
      },
      error: (err) => {
        console.error('Upload failed', err);
        this.result = { inserted: 0, skipped: 0, errors: [{ message: err?.error?.message || 'Upload failed' }] };
        this.uploading = false;
      }
    });
  }
}

