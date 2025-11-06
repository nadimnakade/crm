import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../shared/auth/auth';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get the auth token from the service
    const authToken = this.authService.getToken();

    // Clone the request and add the authorization header if token exists
    const requestToSend = authToken ? req.clone({
      setHeaders: { Authorization: `Bearer ${authToken}` }
    }) : req;

    return next.handle(requestToSend).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Auto-logout on unauthorized to enforce session policy
          try { this.authService.logout(); } catch {}
          try { window.location.href = '/login'; } catch {}
        }
        return throwError(() => error);
      })
    );
  }
}