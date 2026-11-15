import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { EMPTY, catchError, throwError } from 'rxjs';
import { routes } from './app.routes';
import { AuthService } from './services/auth.service';

const productionApiUrl = 'https://ros-tob-production-ad3d.up.railway.app/api';

const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = localStorage.getItem('ros-tob-token');
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const apiUrl = !isLocal && request.url.startsWith('/api') ? `${productionApiUrl}${request.url.slice('/api'.length)}` : request.url;
  const updatedRequest = request.clone({
    url: apiUrl,
    ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {}),
  });
  return next(updatedRequest).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401 && token && request.url.startsWith('/api/')) {
      auth.logout();
      return EMPTY;
    }
    return throwError(() => error);
  }));
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
