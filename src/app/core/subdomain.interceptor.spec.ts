import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { subdomainInterceptor } from './subdomain.interceptor';

// Ningún servicio construye `?subdomain=`: lo añade este interceptor a toda petición pública.

describe('subdomainInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([subdomainInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('a una ruta pública le antepone la base del API y le añade el subdominio del tenant', () => {
    http.get('/api/v1/public/settings', { params: { keys: 'hero' } }).subscribe();

    const request = controller.expectOne((candidate) => candidate.url === `${environment.apiUrl}/api/v1/public/settings`);
    expect(request.request.params.get('subdomain')).toBe(environment.devSubdomain);
    expect(request.request.params.get('keys')).toBe('hero');
    request.flush({});
  });

  it('una ruta que no es pública sale intacta', () => {
    http.get('/assets/config.json').subscribe();

    const request = controller.expectOne('/assets/config.json');
    expect(request.request.params.has('subdomain')).toBe(false);
    request.flush({});
  });
});
