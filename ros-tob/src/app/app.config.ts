import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

const productionApiUrl = 'https://ros-tob-production-ad3d.up.railway.app/api';

const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = localStorage.getItem('ros-tob-token');
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const apiUrl = !isLocal && request.url.startsWith('/api') ? `${productionApiUrl}${request.url.slice('/api'.length)}` : request.url;
  const updatedRequest = request.clone({
    url: apiUrl,
    ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {}),
  });
  return next(updatedRequest);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
