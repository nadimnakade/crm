import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../services/loading.service';

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  constructor(private readonly loading: LoadingService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Optionally skip loader for static assets
    const isAsset = req.url.includes('/assets/') || req.headers.has('X-Skip-Loading');
    if (!isAsset) {
      this.loading.start();
    }
    return next.handle(req).pipe(finalize(() => {
      if (!isAsset) this.loading.stop();
    }));
  }
}