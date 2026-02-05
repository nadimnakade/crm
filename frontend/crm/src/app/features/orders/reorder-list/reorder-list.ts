import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-reorder-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reorder-list.html'
})
export class ReorderListComponent implements OnInit {
  reorders: any[] = [];
  loading = false;
  today: Date = new Date();

  constructor(private orderService: OrderService) {}

  ngOnInit(): void {
    this.fetchReorders();
  }

  fetchReorders(): void {
    this.loading = true;
    this.orderService.getReorders().subscribe({
      next: (data) => {
        this.reorders = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to fetch reorders', err);
        this.loading = false;
      }
    });
  }
}
