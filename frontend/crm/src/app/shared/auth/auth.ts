import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export interface LoginResponse {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  token: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiBase}/auth`;
  private tokenKey = 'auth_token';
  private userKey = 'user_data';
  private lastActivityKey = 'last_activity';
  
  // BehaviorSubject to track authentication state
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasValidToken());
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  // Idle timeout configuration (30 minutes)
  private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private idleTimer: any = null;

  constructor(private http: HttpClient) { 
    // Check token validity on service initialization
    this.checkTokenValidity();
    // Schedule auto-logout at token expiry if present
    this.scheduleAutoLogout();
    // Initialize idle timeout tracking
    this.initializeIdleTimeout();
  }

  login(email: string, password: string): Observable<LoginResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { email, password }, { headers })
      .pipe(
        tap((response: LoginResponse) => {
          this.setToken(response.token);
          this.setUser({
            id: response.id,
            username: response.username,
            email: response.email,
            firstName: response.firstName,
            lastName: response.lastName,
            role: response.role
          });
          this.isAuthenticatedSubject.next(true);
          // Reset idle timeout on successful login
          this.resetIdleTimeout();
        }),
        catchError((error) => {
          console.error('Login error:', error);
          return throwError(() => error);
        })
      );
  }

  register(userData: any): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post(`${this.apiUrl}/register`, userData, { headers })
      .pipe(
        catchError((error) => {
          console.error('Registration error:', error);
          return throwError(() => error);
        })
      );
  }

  logout(): void {
    // Call backend logout endpoint to invalidate session
    const token = this.getToken();
    if (token) {
      this.http.post(`${this.apiUrl}/logout`, {}, { headers: this.getAuthHeaders() })
        .subscribe({
          next: () => console.log('Session invalidated on server'),
          error: (error) => console.error('Logout error:', error)
        });
    }
    
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.lastActivityKey);
    this.clearIdleTimeout();
    this.isAuthenticatedSubject.next(false);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
    this.scheduleAutoLogout();
    this.resetIdleTimeout();
  }

  getUser(): User | null {
    const userData = localStorage.getItem(this.userKey);
    return userData ? JSON.parse(userData) : null;
  }

  setUser(user: User): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  isLoggedIn(): boolean {
    return this.hasValidToken();
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn();
  }

  private hasValidToken(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      // Basic JWT token validation (check if it's not expired)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  private checkTokenValidity(): void {
    if (!this.hasValidToken()) {
      this.logout();
    }
  }

  private logoutTimer: any = null;
  private scheduleAutoLogout(): void {
    const token = this.getToken();
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentMs = Date.now();
      const expMs = (payload.exp || 0) * 1000;
      const delay = expMs - currentMs;
      // Clear previous timer
      if (this.logoutTimer) {
        clearTimeout(this.logoutTimer);
        this.logoutTimer = null;
      }
      if (delay > 0) {
        this.logoutTimer = setTimeout(() => {
          this.logout();
          // Optionally trigger a redirect via location to login
          try { window.location.href = '/login'; } catch {}
        }, delay);
      }
    } catch (e) {
      // If token can't be parsed, ensure user is logged out
      this.logout();
    }
  }

  // Get authorization headers for API requests
  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  // Idle timeout management
  private initializeIdleTimeout(): void {
    if (!this.isLoggedIn()) return;
    
    // Set up activity listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, () => this.resetIdleTimeout(), true);
    });

    this.resetIdleTimeout();
  }

  private resetIdleTimeout(): void {
    if (!this.isLoggedIn()) return;

    // Clear existing timer
    this.clearIdleTimeout();
    
    // Update last activity timestamp
    localStorage.setItem(this.lastActivityKey, Date.now().toString());
    
    // Set new idle timer
    this.idleTimer = setTimeout(() => {
      this.handleIdleTimeout();
    }, this.IDLE_TIMEOUT_MS);
  }

  private clearIdleTimeout(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private handleIdleTimeout(): void {
    console.log('Session expired due to inactivity');
    this.logout();
    // Redirect to login page
    try { 
      window.location.href = '/login'; 
    } catch (e) {
      console.error('Failed to redirect to login:', e);
    }
  }

  // Public method to manually reset idle timeout (for API calls)
  public recordActivity(): void {
    this.resetIdleTimeout();
  }
}
