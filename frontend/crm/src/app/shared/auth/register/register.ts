import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth';

@Component({
  selector: 'app-register',
  templateUrl: './register.html',
  styleUrls: ['./register.scss'],
  standalone:false
})
export class RegisterComponent {
  registerData = {
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    roleId: 2 // Default to regular user role
  };
  confirmPassword = '';
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  onSubmit(): void {
    this.errorMessage = '';
    if (this.registerData.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }
    this.authService.register(this.registerData)
      .subscribe({
        next: () => {
          this.router.navigate(['/login'], { queryParams: { registered: 'true' } });
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Registration failed. Please try again.';
        }
      });
  }
}
