import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/auth/auth';
import { CallService } from '../../shared/services/call';
import { PortfolioService } from '../../shared/services/portfolio';
import { CustomerMedicineDetailService } from '../../shared/services/customer-medicine-detail';
import { ReportService } from '../../core/services/report.service';
import { OrderService } from '../../core/services/order.service';
import { Chart, registerables } from 'chart.js';
import { Title } from '@angular/platform-browser';

// Register all Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  Math = Math;
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
  
  // Due Follow-ups
  dueFollowUps: any[] = [];

  // New Report Data
  topAgentsByOrder: any[] = [];
  activeUserReport: any[] = [];

  // Customer Medicine Details recent list
  cmdItems: any[] = [];
  cmdSearch: string = '';
  cmdPageSize: number = 10;
  cmdCursor: number | null = null;
  cmdNextCursor: number | null = null;
  cmdBackStack: Array<number | null> = [];
  cmdHasMore: boolean = false;
  cmdLoading: boolean = false;
  // Detail modal state
  showCmdDetail: boolean = false;
  cmdDetailMobile: string = '';
  cmdDetailItems: any[] = [];
  cmdDetailPageSize: number = 10;
  cmdDetailCursor: number | null = null;
  cmdDetailNextCursor: number | null = null;
  cmdDetailBackStack: Array<number | null> = [];
  cmdDetailHasMore: boolean = false;
  cmdDetailLoading: boolean = false;
  // Portfolio search state
  portfolioMobile: string = '';
  portfolioItems: any[] = [];
  portfolioTotal: number = 0;
  
  // Chart objects
  agentChart!: Chart;
  typeChart!: Chart;
  weeklySalesChart!: Chart;
  private refreshInterval: any;

  // Orders today count
  ordersTodayCount: number = 0;
  reordersTodayCount: number = 0;
  // Section loaders
  loadingOrdersCount: boolean = false;
  loadingReordersCount: boolean = false;
  loadingTopAgents: boolean = false;
  loadingActiveUsers: boolean = false;
  loadingDueFollowups: boolean = false;

  constructor(
    private authService: AuthService,
    private callService: CallService,
    private portfolioService: PortfolioService,
    private cmdService: CustomerMedicineDetailService,
    private reportService: ReportService,
    private orderService: OrderService
  ) { }

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
      this.userName = user.firstName ? `${user.firstName} ${user.lastName || ''}` : 'User';
      this.isAdmin = user.role === 'Admin' || user.role === 'admin';
      this.isSuperAdmin = user.role === 'Super Admin' || user.role === 'superadmin';
    }

    // Mock stats
    this.totalCustomers = 1250;
    this.activeUsers = 42;
    this.todaysCalls = [];
    
    this.loadDashboardData();
    this.loadCmdUnique(); // Load Customer Medicine Detail unique list
    this.loadDueFollowUps();
  }

  loadDueFollowUps(): void {
    this.loadingDueFollowups = true;
    // Admins can see all due follow-ups if they want, but usually notification is for the user.
    // However, if the API supports an 'all' flag for admins, we can pass it if we want to show global due items.
    // For now, let's just show what the API returns (agent's own or filtered).
    // The API we implemented expects `all=true` for admin to see everyone's.
    // Let's assume on dashboard we show "My Due Follow-ups" primarily.
    // If admin wants to see all, we might need a toggle or just default to all.
    // Let's pass true for admins so they can oversee pending work.
    const showAll = this.isAdmin || this.isSuperAdmin;
    this.callService.getDueFollowUps(showAll, { skipLoader: true }).subscribe({
      next: (data: any[]) => {
        this.dueFollowUps = data;
        this.loadingDueFollowups = false;
      },
      error: (err: any) => { 
        console.error('Error loading due follow-ups', err);
        this.loadingDueFollowups = false;
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.loadWeeklyOrdersChart();
      this.loadCallOutcomesChart();
      // this.initWeeklySalesChart();
    }, 100);

    // Real-time updates: poll every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadDashboardData();
      this.loadWeeklyOrdersChart();
      this.loadCallOutcomesChart();
      this.loadDueFollowUps();
    }, 300000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.agentChart) {
      this.agentChart.destroy();
    }
    if (this.typeChart) {
      this.typeChart.destroy();
    }
  }

  private loadDashboardData(): void {
    // Orders count (today)
    this.loadOrdersTodayCount();
    // Reorders count (today)
    this.loadReordersTodayCount();
    // New Reports - Admin Only
    if (this.isAdmin || this.isSuperAdmin) {
      this.loadTopAgentsByOrder();
      this.loadActiveUserReport();
    }
  }

  loadTopAgentsByOrder() {
    this.loadingTopAgents = true;
    this.reportService.getTopAgents({ skipLoader: true }).subscribe({
      next: (data) => {
        this.topAgentsByOrder = data;
        this.loadingTopAgents = false;
      },
      error: (err) => { 
        console.error('Failed to load top agents by order', err);
        this.loadingTopAgents = false;
      }
    });
  }

  loadActiveUserReport() {
    this.loadingActiveUsers = true;
    this.reportService.getActiveUsers({ skipLoader: true }).subscribe({
      next: (data) => {
        this.activeUserReport = data;
        this.loadingActiveUsers = false;
      },
      error: (err) => { 
        console.error('Failed to load active user report', err);
        this.loadingActiveUsers = false;
      }
    });
  }

  private loadOrdersTodayCount(): void {
    this.loadingOrdersCount = true;
    this.callService.getRecentOrderCount(undefined, undefined, { skipLoader: true }).subscribe({
      next: (res) => { 
        this.ordersTodayCount = Number(res?.total || 0); 
        this.loadingOrdersCount = false;
      },
      error: () => { 
        this.ordersTodayCount = 0; 
        this.loadingOrdersCount = false;
      }
    });
  }

  private loadReordersTodayCount(): void {
    this.loadingReordersCount = true;
    this.orderService.getReordersCount(undefined, undefined, { skipLoader: true }).subscribe({
      next: (res) => { 
        this.reordersTodayCount = Number(res?.count || 0); 
        this.loadingReordersCount = false;
      },
      error: () => { 
        this.reordersTodayCount = 0; 
        this.loadingReordersCount = false;
      }
    });
  }

  loadWeeklyOrdersChart() {
    this.reportService.getWeeklyOrderStats({ skipLoader: true }).subscribe({
      next: (data) => {
        if (!this.callsByAgentChart) return;

        const labels = data.map(d => d.date);
        const counts = data.map(d => d.count);

        if (this.agentChart) {
          this.agentChart.data.labels = labels;
          this.agentChart.data.datasets[0].data = counts;
          this.agentChart.update();
          return;
        }

        const ctx = this.callsByAgentChart.nativeElement.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(111, 66, 193, 0.7)');
        gradient.addColorStop(1, 'rgba(111, 66, 193, 0.1)');

        this.agentChart = new Chart(this.callsByAgentChart.nativeElement, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Orders',
                data: counts,
                borderColor: '#6F42C1',
                backgroundColor: gradient,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6F42C1',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              title: {
                display: true,
                text: 'Weekly Orders Trend'
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
      },
      error: (err) => console.error('Failed to load weekly orders chart', err)
    });
  }

  loadCallOutcomesChart() {
    this.reportService.getCallOutcomeStats({ skipLoader: true }).subscribe({
      next: (data) => {
        if (!this.callTypeChart) return;

        const labels = data.map(d => d.outcome || 'No Outcome');
        const counts = data.map(d => d.count);
        // Generate colors dynamically or use a preset
        const colors = [
          '#4267B2', '#FF0000', '#C13584', '#00C9A7', '#FFC107', '#28A745', '#17A2B8', '#6610F2'
        ];

        if (this.typeChart) {
          this.typeChart.data.labels = labels;
          this.typeChart.data.datasets[0].data = counts;
          this.typeChart.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
          this.typeChart.update();
          return;
        }

        this.typeChart = new Chart(this.callTypeChart.nativeElement, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: counts,
              backgroundColor: colors.slice(0, labels.length),
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
                display: true,
                position: 'right',
                labels: {
                  color: '#fff'
                }
              },
              title: {
                display: true,
                text: "Today's Call Outcomes",
                color: '#fff'
              }
            }
          }
        });
      },
      error: (err) => console.error('Failed to load call outcomes chart', err)
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

  // --- Customer Medicine Detail unique list (dashboard) ---
  loadCmdUnique(): void {
    // Only search if there's a search term
    if (!this.cmdSearch || this.cmdSearch.trim() === '') {
      this.cmdItems = [];
      this.cmdCursor = null;
      this.cmdNextCursor = null;
      this.cmdBackStack = [];
      this.cmdHasMore = false;
      this.cmdLoading = false;
      return;
    }

    this.cmdLoading = true;
    const digits = this.cmdSearch.replace(/[^0-9]/g, '');
    // Enforce exactly 10-digit mobile search
    if (!digits || digits.length !== 10) {
      this.cmdItems = [];
      this.cmdHasMore = false;
      this.cmdNextCursor = null;
      this.cmdLoading = false;
      return;
    }

    const params: any = {
      pageSize: this.cmdPageSize,
      unique: true,
      cursorId: this.cmdCursor,
      mobile: digits
    };
    this.cmdService.list(params, { skipLoader: true }).subscribe({
      next: (res) => {
        this.cmdItems = res?.items || [];
        this.cmdHasMore = !!res?.hasMore;
        this.cmdNextCursor = res?.nextCursor ?? null;
        this.cmdLoading = false;
      },
      error: () => {
        this.cmdItems = [];
        this.cmdHasMore = false;
        this.cmdNextCursor = null;
        this.cmdLoading = false;
      }
    });
  }

  onCmdSearchInput(event: any): void {
    const val: string = event?.target?.value || '';
    const digits = val.replace(/\D/g, '').slice(0, 10);
    this.cmdSearch = digits;
  }

  isTenDigits(val: string): boolean {
    const digits = (val || '').replace(/\D/g, '');
    return digits.length === 10;
  }

  searchCmd(): void {
    this.cmdCursor = null;
    this.cmdBackStack = [];
    this.loadCmdUnique();
  }

  prevCmdPage(): void {
    if (this.cmdBackStack.length === 0) return;
    const prev = this.cmdBackStack.pop() ?? null;
    this.cmdCursor = prev;
    this.loadCmdUnique();
  }

  nextCmdPage(): void {
    if (!this.cmdHasMore) return;
    // push current cursor for back navigation
    this.cmdBackStack.push(this.cmdCursor);
    this.cmdCursor = this.cmdNextCursor ?? null;
    this.loadCmdUnique();
  }

  openCmdDetail(mobile: string): void {
    this.cmdDetailMobile = (mobile || '').replace(/[^0-9]/g, '');
    if (!this.cmdDetailMobile) return;
    this.cmdDetailCursor = null;
    this.cmdDetailBackStack = [];
    this.showCmdDetail = true;
    this.loadCmdDetail();
  }

  closeCmdDetail(): void {
    this.showCmdDetail = false;
    this.cmdDetailMobile = '';
    this.cmdDetailItems = [];
    this.cmdDetailHasMore = false;
    this.cmdDetailNextCursor = null;
    this.cmdDetailCursor = null;
    this.cmdDetailBackStack = [];
  }

  loadCmdDetail(): void {
    if (!this.cmdDetailMobile) return;
    this.cmdDetailLoading = true;
    this.cmdService.list({
      pageSize: this.cmdDetailPageSize,
      mobile: this.cmdDetailMobile,
      cursorId: this.cmdDetailCursor
    }, { skipLoader: true }).subscribe({
      next: (res) => {
        this.cmdDetailItems = res?.items || [];
        this.cmdDetailHasMore = !!res?.hasMore;
        this.cmdDetailNextCursor = res?.nextCursor ?? null;
        this.cmdDetailLoading = false;
      },
      error: () => {
        this.cmdDetailItems = [];
        this.cmdDetailHasMore = false;
        this.cmdDetailNextCursor = null;
        this.cmdDetailLoading = false;
      }
    });
  }

  prevCmdDetailPage(): void {
    if (this.cmdDetailBackStack.length === 0) return;
    const prev = this.cmdDetailBackStack.pop() ?? null;
    this.cmdDetailCursor = prev;
    this.loadCmdDetail();
  }

  nextCmdDetailPage(): void {
    if (!this.cmdDetailHasMore) return;
    this.cmdDetailBackStack.push(this.cmdDetailCursor);
    this.cmdDetailCursor = this.cmdDetailNextCursor ?? null;
    this.loadCmdDetail();
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

  // Portfolio search by mobile/name/address
  searchPortfolio(): void {
    const input = (this.portfolioMobile || '').trim();
    const mobileDigits = input.replace(/[^0-9]/g, '');
    const isFullMobile = /^[0-9]{10}$/.test(mobileDigits);
    const params = isFullMobile ? { mobile: mobileDigits } : { q: input };
    this.portfolioService.list(params as any).subscribe({
      next: (res) => this.portfolioItems = res.items || [],
      error: (err) => {
        console.error('Failed to fetch portfolio', err);
        this.portfolioItems = [];
      }
    });
  }
}
