import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private activeRequests = 0;
  private readonly _loading$ = new BehaviorSubject<boolean>(false);

  readonly loading$ = this._loading$.asObservable();

  start(): void {
    this.activeRequests++;
    if (!this._loading$.value) {
      this._loading$.next(true);
    }
  }

  stop(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0 && this._loading$.value) {
      this._loading$.next(false);
    }
  }
}