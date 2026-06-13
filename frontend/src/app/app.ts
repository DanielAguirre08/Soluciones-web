import { CommonModule, CurrencyPipe } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type View = 'home' | 'catalog' | 'cart' | 'auth' | 'orders' | 'admin';
type AdminTab = 'overview' | 'products' | 'orders' | 'banners';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, CurrencyPipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private readonly api = 'http://localhost:8080/api';
  private bannerTimer?: number;
  readonly sizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Unica'];
  readonly colorOptions = ['Negro', 'Blanco', 'Rojo', 'Azul', 'Charcoal', 'Off-White', 'Gris'];

  products = signal<Product[]>([]);
  categories = signal<Category[]>([]);
  banners = signal<Banner[]>(fallbackBanners);
  adminBanners = signal<Banner[]>([]);
  cart = signal<CartItem[]>([]);
  orders = signal<Order[]>([]);
  dashboard = signal<Record<string, number>>({});
  currentUser = signal<AuthResponse | null>(this.loadUser());
  view = signal<View>('home');
  mode = signal<'login' | 'register'>('login');
  adminTab = signal<AdminTab>('overview');
  selectedCategory = signal('Todas');
  selectedSize = signal('Todas');
  selectedColor = signal('Todos');
  maxPrice = signal(500);
  stockOnly = signal(false);
  searchPanelOpen = signal(false);
  activeBanner = signal(0);

  search = '';
  message = '';
  auth = { nombres: '', apellidos: '', email: 'admin@caoxwear.com', password: '12345678' };
  productForm: ProductForm = this.emptyProductForm();
  bannerForm: BannerForm = this.emptyBannerForm();

  total = computed(() =>
    this.cart().reduce((sum, item) => sum + item.product.precio * item.quantity, 0)
  );
  totalSales = computed(() =>
    this.orders().reduce((sum, order) => sum + Number(order.total || 0), 0)
  );
  lowStockProducts = computed(() =>
    this.products().filter(product => product.stock <= 15)
  );

  visibleProducts = computed(() => {
    const selected = this.selectedCategory();
    const size = this.selectedSize();
    const color = this.selectedColor();
    const price = this.maxPrice();
    return this.products().filter(product => {
      const categoryMatches = selected === 'Todas' || product.categoria.nombre === selected;
      const sizeMatches = size === 'Todas' || product.tallas.includes(size);
      const colorMatches = color === 'Todos' || product.colores.includes(color);
      const priceMatches = !price || product.precio <= price;
      const stockMatches = !this.stockOnly() || product.stock > 0;
      return categoryMatches && sizeMatches && colorMatches && priceMatches && stockMatches;
    });
  });

  availableSizes = computed(() => this.uniqueValues(this.products().flatMap(product => product.tallas)));
  availableColors = computed(() => this.uniqueValues(this.products().flatMap(product => product.colores)));
  topCategories = computed(() => this.categories().slice(0, 6));

  featuredProducts = computed(() => this.products().slice(0, 4));

  activeBannerItem = computed(() => {
    const banners = this.banners().length ? this.banners() : fallbackBanners;
    return banners[this.activeBanner() % banners.length];
  });

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadCatalog();
    this.loadBanners();
    if (this.currentUser()?.rol === 'ADMINISTRADOR') {
      this.loadAdmin();
    }
  }

  ngOnDestroy() {
    if (this.bannerTimer) {
      window.clearInterval(this.bannerTimer);
    }
  }

  loadCatalog() {
    this.http.get<Page<Product>>(`${this.api}/products?size=80&search=${encodeURIComponent(this.search)}`)
      .subscribe({
        next: page => this.products.set(page.content),
        error: () => {
          this.message = 'Inicia el backend en http://localhost:8080 para cargar productos reales.';
          this.products.set(fallbackProducts);
        }
      });

    this.http.get<Category[]>(`${this.api}/categories`).subscribe({
      next: data => {
        this.categories.set(data);
        if (!this.productForm.categoriaId && data.length) {
          this.productForm.categoriaId = data[0].id;
        }
      },
      error: () => this.categories.set(fallbackCategories)
    });
  }

  loadBanners() {
    this.http.get<Banner[]>(`${this.api}/banners`).subscribe({
      next: data => {
        this.banners.set(data.length ? data : fallbackBanners);
        this.activeBanner.set(0);
        this.startBannerRotation();
      },
      error: () => {
        this.banners.set(fallbackBanners);
        this.startBannerRotation();
      }
    });
  }

  searchCatalog() {
    this.selectedCategory.set('Todas');
    this.searchPanelOpen.set(false);
    this.view.set('catalog');
    this.loadCatalog();
  }

  selectCategory(category: string) {
    this.selectedCategory.set(category);
    this.searchPanelOpen.set(false);
    this.view.set('catalog');
  }

  showCatalog() {
    this.searchPanelOpen.set(false);
    this.view.set('catalog');
    this.loadCatalog();
  }

  openSearchPanel() {
    this.searchPanelOpen.set(true);
  }

  closeSearchPanelSoon() {
    window.setTimeout(() => this.searchPanelOpen.set(false), 140);
  }

  productSuggestions() {
    const query = this.normalize(this.search);
    const products = this.products();
    const matches = query
      ? products.filter(product => this.matchesProduct(product, query))
      : products.slice(0, 8);
    return matches.slice(0, 8);
  }

  categorySuggestions() {
    const query = this.normalize(this.search);
    const categories = this.categories();
    const matches = query
      ? categories.filter(category => this.normalize(category.nombre).includes(query))
      : categories.slice(0, 8);
    return matches.slice(0, 8);
  }

  chooseProductSuggestion(product: Product) {
    this.search = product.nombre;
    this.selectedCategory.set(product.categoria.nombre);
    this.searchPanelOpen.set(false);
    this.view.set('catalog');
  }

  chooseCategorySuggestion(category: Category) {
    this.search = '';
    this.selectedCategory.set(category.nombre);
    this.searchPanelOpen.set(false);
    this.view.set('catalog');
  }

  selectSize(size: string) {
    this.selectedSize.set(size);
  }

  selectColor(color: string) {
    this.selectedColor.set(color);
  }

  setMaxPrice(event: Event) {
    this.maxPrice.set(Number((event.target as HTMLInputElement).value));
  }

  setStockOnly(event: Event) {
    this.stockOnly.set((event.target as HTMLInputElement).checked);
  }

  clearFilters() {
    this.selectedCategory.set('Todas');
    this.selectedSize.set('Todas');
    this.selectedColor.set('Todos');
    this.maxPrice.set(500);
    this.stockOnly.set(false);
  }

  addToCart(product: Product) {
    const existing = this.cart().find(item => item.product.id === product.id);
    if (existing) {
      existing.quantity += 1;
      this.cart.set([...this.cart()]);
    } else {
      this.cart.set([...this.cart(), { product, quantity: 1 }]);
    }
    this.message = `${product.nombre} agregado al carrito.`;
  }

  removeFromCart(productId: number) {
    this.cart.set(this.cart().filter(item => item.product.id !== productId));
  }

  login() {
    this.http.post<AuthResponse>(`${this.api}/auth/login`, {
      email: this.auth.email,
      password: this.auth.password
    }).subscribe({
      next: user => {
        this.saveUser(user);
        this.message = `Bienvenido, ${user.nombres}.`;
        this.view.set('home');
        if (user.rol === 'ADMINISTRADOR') {
          this.loadAdmin();
        }
      },
      error: () => this.message = 'No se pudo iniciar sesion. Revisa credenciales o backend.'
    });
  }

  register() {
    this.http.post<AuthResponse>(`${this.api}/auth/register`, this.auth).subscribe({
      next: user => {
        this.saveUser(user);
        this.message = 'Registro completado correctamente.';
        this.view.set('home');
      },
      error: () => this.message = 'No se pudo registrar el usuario.'
    });
  }

  checkout() {
    if (!this.currentUser()) {
      this.view.set('auth');
      this.message = 'Inicia sesion para finalizar tu pedido.';
      return;
    }
    const items = this.cart().map(item => ({ productId: item.product.id, cantidad: item.quantity }));
    this.http.post<Order>(`${this.api}/orders`, { items }, { headers: this.headers() }).subscribe({
      next: () => {
        this.cart.set([]);
        this.message = 'Pedido registrado correctamente.';
        this.loadOrders();
        this.view.set('orders');
      },
      error: () => this.message = 'No se pudo crear el pedido.'
    });
  }

  loadOrders() {
    if (!this.currentUser()) {
      this.view.set('auth');
      return;
    }
    this.http.get<Order[]>(`${this.api}/orders/mine`, { headers: this.headers() }).subscribe({
      next: data => this.orders.set(data),
      error: () => this.message = 'No se pudieron cargar los pedidos.'
    });
  }

  loadAdmin() {
    if (this.currentUser()?.rol !== 'ADMINISTRADOR') {
      this.view.set('auth');
      this.message = 'Ingresa con una cuenta administradora.';
      return;
    }

    this.http.get<Record<string, number>>(`${this.api}/admin/dashboard`, { headers: this.headers() }).subscribe({
      next: data => this.dashboard.set(data),
      error: () => this.message = 'Panel admin disponible solo para ADMINISTRADOR.'
    });

    this.http.get<Banner[]>(`${this.api}/banners/admin`, { headers: this.headers() }).subscribe({
      next: data => this.adminBanners.set(data),
      error: () => this.adminBanners.set([])
    });

    this.http.get<Order[]>(`${this.api}/admin/orders`, { headers: this.headers() }).subscribe({
      next: data => this.orders.set(data),
      error: () => this.orders.set([])
    });
  }

  saveProduct() {
    const categoryId = Number(this.productForm.categoriaId);
    if (!categoryId) {
      this.message = 'Selecciona una categoria para el producto.';
      return;
    }

    const description = [
      this.productForm.descripcion.trim(),
      this.productForm.detalles.trim()
    ].filter(Boolean).join(' | ');

    const product: ProductPayload = {
      sku: this.productForm.sku.trim() || undefined,
      nombre: this.productForm.nombre.trim(),
      descripcion: description,
      precio: Number(this.productForm.precio),
      stock: Number(this.productForm.stock),
      imagen: this.productForm.imagen || fallbackProducts[0].imagen,
      categoria: { id: categoryId },
      tallas: this.splitList(this.productForm.tallas),
      colores: this.splitList(this.productForm.colores)
    };

    this.http.post<Product>(`${this.api}/products`, product, { headers: this.headers() }).subscribe({
      next: saved => {
        this.message = `${saved.nombre} fue publicado en el catalogo.`;
        this.productForm = this.emptyProductForm(categoryId);
        this.loadCatalog();
        this.loadAdmin();
      },
      error: () => this.message = 'No se pudo guardar el producto. Verifica que estes como admin.'
    });
  }

  saveBanner() {
    const banner: BannerPayload = {
      titulo: this.bannerForm.titulo.trim(),
      subtitulo: this.bannerForm.subtitulo.trim(),
      textoBoton: this.bannerForm.textoBoton.trim(),
      enlace: this.bannerForm.enlace.trim() || 'catalog',
      imagen: this.bannerForm.imagen || fallbackBanners[0].imagen,
      activo: this.bannerForm.activo,
      orden: Number(this.bannerForm.orden)
    };

    this.http.post<Banner>(`${this.api}/banners`, banner, { headers: this.headers() }).subscribe({
      next: saved => {
        this.message = `Banner "${saved.titulo}" agregado al carrusel.`;
        this.bannerForm = this.emptyBannerForm();
        this.loadBanners();
        this.loadAdmin();
      },
      error: () => this.message = 'No se pudo guardar el banner.'
    });
  }

  toggleBanner(banner: Banner) {
    this.http.put<Banner>(`${this.api}/banners/${banner.id}`, {
      ...banner,
      activo: !banner.activo
    }, { headers: this.headers() }).subscribe({
      next: () => {
        this.loadBanners();
        this.loadAdmin();
      },
      error: () => this.message = 'No se pudo actualizar el banner.'
    });
  }

  deleteBanner(id: number) {
    this.http.delete<void>(`${this.api}/banners/${id}`, { headers: this.headers() }).subscribe({
      next: () => {
        this.message = 'Banner eliminado.';
        this.loadBanners();
        this.loadAdmin();
      },
      error: () => this.message = 'No se pudo eliminar el banner.'
    });
  }

  handleProductImage(event: Event) {
    this.readImage(event, image => this.productForm.imagen = image);
  }

  handleBannerImage(event: Event) {
    this.readImage(event, image => this.bannerForm.imagen = image);
  }

  toggleProductSize(size: string) {
    this.productForm.tallas = this.toggleCsvValue(this.productForm.tallas, size);
  }

  toggleProductColor(color: string) {
    this.productForm.colores = this.toggleCsvValue(this.productForm.colores, color);
  }

  isProductSizeSelected(size: string) {
    return this.splitList(this.productForm.tallas).includes(size);
  }

  isProductColorSelected(color: string) {
    return this.splitList(this.productForm.colores).includes(color);
  }

  logout() {
    localStorage.removeItem('caoxwear_user');
    this.currentUser.set(null);
    this.view.set('home');
  }

  selectView(view: View) {
    this.message = '';
    this.view.set(view);
    if (view === 'catalog') {
      this.loadCatalog();
    }
    if (view === 'orders') {
      this.loadOrders();
    }
    if (view === 'admin') {
      this.adminTab.set('overview');
      this.loadAdmin();
    }
  }

  selectAdminTab(tab: AdminTab) {
    this.adminTab.set(tab);
    this.loadAdmin();
  }

  setBanner(index: number) {
    this.activeBanner.set(index);
  }

  nextBanner() {
    const banners = this.banners();
    this.activeBanner.set((this.activeBanner() + 1) % Math.max(banners.length, 1));
  }

  previousBanner() {
    const banners = this.banners();
    this.activeBanner.set((this.activeBanner() - 1 + Math.max(banners.length, 1)) % Math.max(banners.length, 1));
  }

  bannerAction(banner: Banner) {
    if (banner.enlace?.startsWith('http')) {
      window.open(banner.enlace, '_blank');
      return;
    }
    this.selectView('catalog');
  }

  private startBannerRotation() {
    if (this.bannerTimer) {
      window.clearInterval(this.bannerTimer);
    }
    this.bannerTimer = window.setInterval(() => this.nextBanner(), 5500);
  }

  private readImage(event: Event, assign: (image: string) => void) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => assign(String(reader.result));
    reader.readAsDataURL(file);
  }

  private splitList(value: string) {
    return value.split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  private toggleCsvValue(value: string, option: string) {
    const values = new Set(this.splitList(value));
    if (values.has(option)) {
      values.delete(option);
    } else {
      values.add(option);
    }
    return Array.from(values).join(', ');
  }

  private uniqueValues(values: string[]) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  private normalize(value: string) {
    return value.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private matchesProduct(product: Product, query: string) {
    return [
      product.sku ?? '',
      product.nombre,
      product.descripcion,
      product.categoria.nombre,
      ...product.tallas,
      ...product.colores
    ].some(value => this.normalize(value).includes(query));
  }

  private emptyProductForm(categoryId = this.categories()[0]?.id ?? 0): ProductForm {
    return {
      sku: '',
      nombre: '',
      descripcion: '',
      detalles: '',
      precio: 0,
      stock: 1,
      imagen: '',
      categoriaId: categoryId,
      tallas: 'S, M, L',
      colores: 'Negro'
    };
  }

  private emptyBannerForm(): BannerForm {
    return {
      titulo: '',
      subtitulo: '',
      textoBoton: 'Comprar ahora',
      enlace: 'catalog',
      imagen: '',
      activo: true,
      orden: 1
    };
  }

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.currentUser()?.token ?? ''}` });
  }

  private saveUser(user: AuthResponse) {
    localStorage.setItem('caoxwear_user', JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUser(): AuthResponse | null {
    const raw = localStorage.getItem('caoxwear_user');
    return raw ? JSON.parse(raw) : null;
  }
}

interface Page<T> {
  content: T[];
}

interface Category {
  id: number;
  nombre: string;
  descripcion: string;
}

interface Product {
  id: number;
  sku?: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  imagen: string;
  categoria: Category;
  tallas: string[];
  colores: string[];
}

interface ProductPayload {
  sku?: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  imagen: string;
  categoria: { id: number };
  tallas: string[];
  colores: string[];
}

interface ProductForm {
  sku: string;
  nombre: string;
  descripcion: string;
  detalles: string;
  precio: number;
  stock: number;
  imagen: string;
  categoriaId: number;
  tallas: string;
  colores: string;
}

interface Banner {
  id: number;
  titulo: string;
  subtitulo: string;
  textoBoton: string;
  enlace: string;
  imagen: string;
  activo: boolean;
  orden: number;
}

type BannerPayload = Omit<Banner, 'id'>;

interface BannerForm {
  titulo: string;
  subtitulo: string;
  textoBoton: string;
  enlace: string;
  imagen: string;
  activo: boolean;
  orden: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface AuthResponse {
  token: string;
  id: number;
  nombres: string;
  email: string;
  rol: 'CLIENTE' | 'ADMINISTRADOR';
}

interface Order {
  id: number;
  fecha: string;
  total: number;
  estado: string;
  usuarioId?: number;
  cliente?: string;
  email?: string;
  detalles?: Array<{ cantidad: number; precio: number; producto: Product }>;
}

const fallbackBanners: Banner[] = [
  {
    id: 1,
    titulo: 'Freestyle is culture',
    subtitulo: 'Streetwear hecho en Lima, Peru.',
    textoBoton: 'Comprar ahora',
    enlace: 'catalog',
    imagen: '/caoxwear/banners/banner_home_desktop_1920x600.webp',
    activo: true,
    orden: 1
  },
  {
    id: 2,
    titulo: 'Nuevos lanzamientos',
    subtitulo: 'Hoodies, cargos, gorras y tees.',
    textoBoton: 'Explorar',
    enlace: 'catalog',
    imagen: '/caoxwear/banners/banner_strip_nuevos_1920x320.webp',
    activo: true,
    orden: 2
  },
  {
    id: 3,
    titulo: 'Casacas street',
    subtitulo: 'Bomber, denim y windbreaker.',
    textoBoton: 'Ver casacas',
    enlace: 'catalog',
    imagen: '/caoxwear/banners/banner_categoria_casacas_1600x500.webp',
    activo: true,
    orden: 3
  },
  {
    id: 4,
    titulo: 'Gorras y accesorios',
    subtitulo: 'Completa el fit urbano.',
    textoBoton: 'Ver productos',
    enlace: 'catalog',
    imagen: '/caoxwear/banners/banner_categoria_gorras_1600x500.webp',
    activo: true,
    orden: 4
  }
];

const fallbackCategories: Category[] = [
  { id: 1, nombre: 'Hoodies', descripcion: 'Poleras urbanas con graficas CaoxWear.' },
  { id: 2, nombre: 'Polos', descripcion: 'Tees y polos de uso diario.' },
  { id: 3, nombre: 'Casacas', descripcion: 'Capas exteriores para drops streetwear.' },
  { id: 4, nombre: 'Gorras', descripcion: 'Accesorios de cabeza con marca CW.' },
  { id: 5, nombre: 'Pantalones', descripcion: 'Joggers y cargos para outfits completos.' },
  { id: 6, nombre: 'Shorts', descripcion: 'Piezas ligeras para looks de verano.' },
  { id: 7, nombre: 'Accesorios', descripcion: 'Complementos para llevar essentials.' },
  { id: 8, nombre: 'Tie-Dye', descripcion: 'Prendas con energia freestyle y patron urbano.' }
];

const fallbackProducts: Product[] = [
  {
    id: 1,
    sku: 'CW-001',
    nombre: 'Hoodie CaoxWear Tag',
    descripcion: 'Hoodie negro con logo CW frontal, estilo streetwear para uso diario.',
    precio: 189,
    stock: 24,
    imagen: '/caoxwear/products/cw-001_hoodie_caoxwear_tag.png',
    categoria: fallbackCategories[0],
    tallas: ['S', 'M', 'L', 'XL'],
    colores: ['Negro', 'Blanco']
  },
  {
    id: 2,
    sku: 'CW-002',
    nombre: 'Tee Freestyle X',
    descripcion: 'Polo blanco oversize con arte freestyle y detalles en rojo.',
    precio: 89,
    stock: 38,
    imagen: '/caoxwear/products/cw-002_tee_freestyle_x.png',
    categoria: fallbackCategories[1],
    tallas: ['S', 'M', 'L', 'XL'],
    colores: ['Blanco', 'Negro']
  },
  {
    id: 3,
    sku: 'CW-003',
    nombre: 'Hoodie Urban Drip',
    descripcion: 'Hoodie rojo con grafico urbano, comodo y abrigador.',
    precio: 199,
    stock: 15,
    imagen: '/caoxwear/products/cw-003_hoodie_urban_drip.png',
    categoria: fallbackCategories[0],
    tallas: ['S', 'M', 'L'],
    colores: ['Rojo', 'Negro']
  },
  {
    id: 4,
    sku: 'CW-004',
    nombre: 'Tee CaoxWear Energy',
    descripcion: 'Polo negro con marca CW grande y detalles energeticos.',
    precio: 79,
    stock: 42,
    imagen: '/caoxwear/products/cw-004_tee_caoxwear_energy.png',
    categoria: fallbackCategories[1],
    tallas: ['S', 'M', 'L', 'XL'],
    colores: ['Negro']
  }
];
