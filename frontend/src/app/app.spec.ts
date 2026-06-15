import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushCatalogRequests();

    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushCatalogRequests();

    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('img[alt="Bambeli Denim Kids"]')).toBeTruthy();
    expect(compiled.querySelector('.hero-media img')?.getAttribute('alt')).toContain('Hecho para jugar');
  });

  function flushCatalogRequests() {
    const products = http.expectOne('http://localhost:8080/api/products?size=80&search=');
    products.flush({ content: [] });

    const categories = http.expectOne('http://localhost:8080/api/categories');
    categories.flush([]);

    const banners = http.expectOne('http://localhost:8080/api/banners');
    banners.flush([]);
  }
});
