import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { AsyncPipe, NgIf } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, AsyncPipe, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('crm');
  isDarkTheme = false;
  loading$ = inject(LoadingService).loading$;
  suppressGlobalLoader = false;
  private router = inject(Router);
  
  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('darkTheme', this.isDarkTheme.toString());
  }
  
  ngOnInit() {
    const savedTheme = localStorage.getItem('darkTheme');
    if (savedTheme) {
      this.isDarkTheme = savedTheme === 'true';
    }
    this.router.events.subscribe(ev => {
      if (ev instanceof NavigationEnd) {
        const url = ev.urlAfterRedirects || ev.url;
        this.suppressGlobalLoader = url.startsWith('/dashboard');
      }
    });
  }
}
