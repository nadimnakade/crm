import { Component, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../shared/auth/auth';
import { CallService } from '../../shared/services/call';
import { Chart, registerables } from 'chart.js';

// Register all Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('callsByAgentChart') callsByAgentChart!: ElementRef;
  @ViewChild('callTypeChart') callTypeChart!: ElementRef;
  
  userEmail: string = '';
  userName: string = '';
  isAdmin: boolean = false;
  isSuperAdmin: boolean = false;
  isDarkTheme: boolean = true; // Default to dark theme for modern UI
  totalCustomers: number = 0;
  activeUsers: number = 0;
  todaysCalls: any[] = [];
  recentCalls: any[] = [];
  topCallersDaily: any[] = [];
  topCallersWeekly: any[] = [];
  
  // Chart objects
  agentChart!: Chart;
  typeChart!: Chart;
  weeklySalesChart!: Chart;

  constructor(private authService: AuthService, private callService: CallService) { }

  ngOnInit(): void {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.isDarkTheme = savedTheme === 'dark';
    } else {
      // Default to dark theme and save preference
      localStorage.setItem('theme', 'dark');
    }
    // Apply initial theme class to body
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
    document.body.classList.toggle('light-theme', !this.isDarkTheme);
    
    const user = this.authService.getUser();
    if (user) {
      this.userEmail = user.email || 'user@example.com';
      this.isAdmin = user.role === 'admin'; // Admin role
      this.isSuperAdmin = user.role === 'superadmin'; // SuperAdmin role
    }
    
    // Mock data for demonstration
    this.totalCustomers = 150;
    this.activeUsers = 20;
    
    // Today's calls data with additional fields for modern UI
    this.todaysCalls = [
      { 
        id: '001',
        customerName: 'Acme Corp',
        timestamp: new Date(),
        agentName: 'Sarah Smith',
        notes: 'Discussed new product requirements',
        type: 'outbound',
        callCount: 8,
        amount: 54.00,
        status: 'shipped'
      },
      { 
        id: '002',
        customerName: 'Adam.com',
        timestamp: new Date(),
        agentName: 'Mike Johnson',
        notes: 'Follow-up on previous inquiry',
        type: 'outbound',
        callCount: 5,
        amount: 88.00,
        status: 'delivered'
      },
      { 
        id: '003',
        customerName: 'Charles Tao',
        timestamp: new Date(),
        agentName: 'John Manager',
        notes: 'Customer support call',
        type: 'inbound',
        callCount: 4,
        amount: 4.00,
        status: 'paid'
      }
    ];

    // Load dashboard data
    this.loadDashboardData();
  }
  
  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initCallsByAgentChart();
      this.initCallTypeChart();
      this.initWeeklySalesChart();
    }, 100);
  }

  private loadDashboardData(): void {
    // Recent calls (role-based on backend)
    this.callService.getRecentCalls(10).subscribe({
      next: (calls) => this.recentCalls = calls || [],
      error: () => this.recentCalls = []
    });

    // Daily top callers
    const today = new Date();
    const dateStr = today.toISOString();
    this.callService.getTopCallersDaily(dateStr, 10).subscribe({
      next: (rows) => this.topCallersDaily = rows || [],
      error: () => this.topCallersDaily = []
    });

    // Weekly top callers (last 7 days)
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    this.callService.getTopCallersWeekly(startStr, endStr, 10).subscribe({
      next: (rows) => this.topCallersWeekly = rows || [],
      error: () => this.topCallersWeekly = []
    });
  }
  
  initCallsByAgentChart(): void {
    if (!this.callsByAgentChart) return;
    
    // Modern line chart for sales data
    const ctx = this.callsByAgentChart.nativeElement.getContext('2d');
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(111, 66, 193, 0.7)');
    gradient.addColorStop(1, 'rgba(111, 66, 193, 0.1)');
    
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = [65, 59, 80, 81, 56, 55, 72, 60, 67, 80, 90, 100];
    
    this.agentChart = new Chart(this.callsByAgentChart.nativeElement, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Sales',
            data: data,
            borderColor: '#6F42C1',
            backgroundColor: gradient,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#6F42C1',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Projected',
            data: [60, 55, 70, 75, 50, 50, 65, 55, 60, 70, 75, 85],
            borderColor: 'rgba(76, 201, 240, 0.7)',
            borderDash: [5, 5],
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            }
          }
        }
      }
    });
  }
  
  initCallTypeChart(): void {
    if (!this.callTypeChart) return;
    
    // Modern pie chart for distribution
    this.typeChart = new Chart(this.callTypeChart.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Facebook', 'Youtube', 'Instagram', 'Website'],
        datasets: [{
          data: [30, 25, 20, 25],
          backgroundColor: [
            '#4267B2', // Facebook blue
            '#FF0000', // YouTube red
            '#C13584', // Instagram purple
            '#00C9A7'  // Website teal
          ],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }
  
  initWeeklySalesChart(): void {
    const canvas = document.getElementById('weeklySalesChart') as HTMLCanvasElement;
    if (!canvas) return;
    
    // Weekly sales bar chart
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Weekly Sales',
          data: [12, 19, 15, 8, 22, 14, 10],
          backgroundColor: [
            '#FF6B6B', // Monday
            '#FF9E7A', // Tuesday
            '#FFD166', // Wednesday
            '#06D6A0', // Thursday
            '#118AB2', // Friday
            '#073B4C', // Saturday
            '#7209B7'  // Sunday
          ],
          borderRadius: 5,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            }
          }
        }
      }
    });
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('theme', this.isDarkTheme ? 'dark' : 'light');
    
    // Update chart colors if charts are initialized
    if (this.agentChart && this.agentChart.options?.scales) {
      if (this.agentChart.options.scales['y']?.grid) {
        this.agentChart.options.scales['y'].grid.color = this.isDarkTheme ? 
          'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.1)';
      }
      if (this.agentChart.options.scales['x']?.grid) {
        this.agentChart.options.scales['x'].grid.color = this.isDarkTheme ? 
          'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.1)';
      }
      this.agentChart.update();
    }
    
    if (this.typeChart) {
      this.typeChart.update();
    }
    
    // Apply theme class to body
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
    document.body.classList.toggle('light-theme', !this.isDarkTheme);
  }

  logout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }
}
