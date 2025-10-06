import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-not-implemented',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px">
      <h2>Coming Soon</h2>
      <p>This section is not implemented yet.</p>
    </div>
  `,
})
export class NotImplementedComponent {}