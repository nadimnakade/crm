import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
  standalone: false
})
export class LoginComponent implements OnInit {
  loginData = {
    email: '',
    password: ''
  };
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit(): void {
    // Apply dark theme by default
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.authService.login(this.loginData.email, this.loginData.password)
      .subscribe({
        
        next: () => {
          
          this.router.navigate(['/dashboard']);
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Login failed. Please check your credentials.';
        }
      });
  }
}
