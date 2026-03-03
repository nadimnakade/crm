import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReportService } from '../../core/services/report.service';

interface AgentCount {
  agentId: number;
  agentName: string;
  count: number;
}

interface ManagerHierarchy {
  managerId: number;
  managerName: string;
  agents: AgentCount[];
  totalCount: number;
}

@Component({
  selector: 'app-followup-counts-hierarchy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './followup-counts-hierarchy.html',
  styleUrls: ['./followup-counts-hierarchy.scss']
})
export class FollowupCountsHierarchyComponent implements OnInit {
  hierarchyData: ManagerHierarchy[] = [];
  loading = false;
  totalCount = 0;

  constructor(private reportService: ReportService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.reportService.getFollowupCountsHierarchy({}).subscribe({
      next: (data) => {
        this.hierarchyData = data;
        this.totalCount = this.hierarchyData.reduce((sum, item) => sum + item.totalCount, 0);
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load hierarchy data', err);
        this.loading = false;
      }
    });
  }
}
