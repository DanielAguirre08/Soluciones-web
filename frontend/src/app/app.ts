import { CommonModule, CurrencyPipe } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type View = 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'confirmation' | 'auth' | 'orders' | 'admin';
type AdminTab = 'overview' | 'products' | 'orders' | 'banners';
type DetailTab = 'description' | 'sizes' | 'shipping';

const USER_KEY = 'bambeli_user';
const FAVORITES_KEY = 'bambeli_favorites';
const CHECKOUT_KEY = 'bambeli_checkout_form';
const NEWSLETTER_KEY = 'bambeli_newsletter_email';
const ORDER_STATUSES: OrderStatus[] = ['PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, CurrencyPipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private readonly api = 'http://localhost:8080/api';
  private bannerTimer?: number;

  readonly navItems = ['Niña', 'Niño', 'Casacas', 'Pantalones', 'Shorts', 'Faldas'];
  readonly sizeOptions = catalogSizes;
  readonly colorOptions = catalogColors;

  products = signal<Product[]>(fallbackProducts);
  categories = signal<Category[]>(fallbackCategories);
  banners = signal<Banner[]>(fallbackBanners);
  adminBanners = signal<Banner[]>([]);
  cart = signal<CartItem[]>([]);
  orders = signal<Order[]>([]);
  currentUser = signal<AuthResponse | null>(this.loadUser());
  favorites = signal<string[]>(this.loadFavorites());
  dashboard = signal<DashboardData>({});
  view = signal<View>('home');
  mode = signal<'login' | 'register'>('login');
  adminTab = signal<AdminTab>('overview');
  accountTab = signal<'summary' | 'orders' | 'favorites'>('summary');
  selectedCategory = signal('Todas');
  selectedSize = signal('Todas');
  selectedColor = signal('Todos');
  maxPrice = signal(0);
  stockOnly = signal(false);
  newOnly = signal(false);
  discountPercent = signal(0);
  searchPanelOpen = signal(false);
  activeBanner = signal(0);
  selectedProduct = signal<Product | null>(fallbackProducts[0]);
  detailQuantity = signal(1);
  detailSize = signal('8');
  detailColor = signal('Azul');
  checkoutStep = signal(1);
  confirmationNumber = signal('#BAM-24127');
  confirmationTotal = signal(0);
  selectedOrderId = signal<number | null>(null);
  selectedAdminOrderId = signal<number | null>(null);
  editProductId = signal<number | null>(null);
  sortMode = signal<'relevant' | 'price-asc' | 'new'>('relevant');
  detailTab = signal<DetailTab>('description');

  search = '';
  message = '';
  discountCode = '';
  newsletterEmail = '';
  saveCheckoutInfo = true;
  adminOrderSearch = '';
  adminOrderStatus = 'Todos';
  adminProductSearch = '';
  adminStatus: OrderStatus = 'CONFIRMADO';
  auth = { nombres: '', apellidos: '', email: 'admin@bambeli.com', password: '12345678' };
  checkoutForm = this.loadCheckoutForm();
  productForm: ProductForm = this.emptyProductForm();
  bannerForm: BannerForm = this.emptyBannerForm();

  subtotal = computed(() =>
    this.cart().reduce((sum, item) => sum + item.product.precio * item.quantity, 0)
  );
  shipping = computed(() => this.cart().length ? 15.9 : 0);
  discountAmount = computed(() => this.subtotal() * (this.discountPercent() / 100));
  total = computed(() => Math.max(0, this.subtotal() + this.shipping() - this.discountAmount()));
  cartItemCount = computed(() => this.cart().reduce((sum, item) => sum + item.quantity, 0));
  displayOrders = computed(() => this.currentUser() ? this.orders() : fallbackOrders);
  selectedOrder = computed(() => {
    const orders = this.displayOrders();
    if (!orders.length) {
      return null;
    }
    return orders.find(order => order.id === this.selectedOrderId()) ?? orders[0];
  });
  selectedAdminOrder = computed(() => {
    const id = this.selectedAdminOrderId();
    if (id == null) {
      return null;
    }
    return this.displayOrders().find(order => order.id === id) ?? null;
  });
  totalSales = computed(() =>
    this.displayOrders().reduce((sum, order) => sum + Number(order.total || 0), 0)
  );
  salesToday = computed(() => Number(this.dashboard().ventasDia ?? 0));
  pendingOrders = computed(() => Number(this.dashboard().pedidosPendientes ?? this.displayOrders().filter(order => this.normalizeStatus(order.estado) === 'PENDIENTE').length));
  lowStockProducts = computed(() =>
    this.products().filter(product => product.stock <= 10)
  );
  favoriteProducts = computed(() =>
    this.products().filter(product => this.productFavoriteKeys(product).some(key => this.favorites().includes(key)))
  );

  visibleProducts = computed(() => {
    const selected = this.selectedCategory();
    const size = this.selectedSize();
    const price = this.maxPrice();
    const query = this.normalize(this.search);
    return this.products().filter(product => {
      const categoryMatches = this.productMatchesCategory(product, selected);
      const sizeMatches = size === 'Todas' || product.tallas.includes(size);
      const priceMatches = !price || product.precio <= price;
      const newMatches = !this.newOnly() || Boolean(product.nuevo);
      const searchMatches = !query || this.matchesProduct(product, query);
      return categoryMatches && sizeMatches && priceMatches && newMatches && searchMatches;
    });
  });

  sortedVisibleProducts = computed(() => {
    const products = [...this.visibleProducts()];
    if (this.sortMode() === 'price-asc') {
      return products.sort((a, b) => a.precio - b.precio);
    }
    if (this.sortMode() === 'new') {
      return products.sort((a, b) => Number(Boolean(b.nuevo)) - Number(Boolean(a.nuevo)));
    }
    return products;
  });

  adminProducts = computed(() => {
    const query = this.normalize(this.adminProductSearch);
    return query ? this.products().filter(product => this.matchesProduct(product, query)) : this.products();
  });

  adminOrders = computed(() => {
    const query = this.normalize(this.adminOrderSearch);
    return this.displayOrders().filter(order => {
      const status = this.normalizeStatus(order.estado);
      const statusMatches = this.adminOrderStatus === 'Todos' || status === this.adminOrderStatus;
      const queryMatches = !query || [
        String(order.id),
        order.cliente ?? '',
        order.email ?? '',
        ...(order.detalles ?? []).map(item => item.nombre)
      ].some(value => this.normalize(value).includes(query));
      return statusMatches && queryMatches;
    });
  });

  availableSizes = computed(() => this.uniqueValues(this.products().flatMap(product => product.tallas)));
  availableColors = computed(() => this.uniqueValues(this.products().flatMap(product => product.colores)));
  topCategories = computed(() => this.categories().slice(0, 6));
  featuredProducts = computed(() => this.products().slice(0, 6));
  recommendedProducts = computed(() => this.products().slice(1, 7));
  bestProducts = computed(() => this.products().slice(0, 5));
  bestSellerRows = computed(() => this.dashboard().masVendidos?.length ? this.dashboard().masVendidos ?? [] : this.bestProducts().map((product, index) => ({
    id: product.id,
    sku: product.sku,
    nombre: product.nombre,
    imagen: product.imagen,
    vendidos: 145 - (index * 13),
    ingresos: product.precio * (12 - index)
  })));

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
    const params = new URLSearchParams({
      size: '80',
      search: this.search
    });
    if (this.maxPrice()) {
      params.set('maxPrice', String(this.maxPrice()));
    }
    if (this.newOnly() || this.selectedCategory() === 'Nuevos ingresos') {
      params.set('nuevoOnly', 'true');
    }
    if (this.isExactCatalogCategory(this.selectedCategory())) {
      params.set('category', this.selectedCategory());
    }
    if (this.selectedSize() !== 'Todas') {
      params.set('talla', this.selectedSize());
    }
    this.http.get<Page<Product>>(`${this.api}/products?${params.toString()}`)
      .subscribe({
        next: page => {
          const products = page.content.length
            ? page.content.map(product => this.normalizeProduct(product))
            : fallbackProducts;
          this.products.set(products);
          if (!this.selectedProduct() && products.length) {
            this.openProduct(products[0], false);
          }
        },
        error: () => {
          this.message = 'Modo demo activo: inicia el backend en http://localhost:8080 para datos reales.';
          this.products.set(fallbackProducts);
        }
      });

    this.http.get<Category[]>(`${this.api}/categories`).subscribe({
      next: data => {
        const categories = data.length ? data : fallbackCategories;
        this.categories.set(categories);
        if (!this.productForm.categoriaId && categories.length) {
          this.productForm.categoriaId = categories[0].id;
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
    this.selectedCategory.set(category === 'Inicio' ? 'Todas' : category);
    this.newOnly.set(category === 'Nuevos ingresos');
    this.searchPanelOpen.set(false);
    this.view.set(category === 'Inicio' ? 'home' : 'catalog');
    if (this.view() === 'catalog') {
      this.loadCatalog();
    }
  }

  showCatalog() {
    this.selectedCategory.set('Todas');
    this.searchPanelOpen.set(false);
    this.view.set('catalog');
    this.loadCatalog();
  }

  openProduct(product: Product, navigate = true) {
    this.selectedProduct.set(product);
    this.detailQuantity.set(1);
    this.detailSize.set(product.tallas[0] ?? '8');
    this.detailColor.set(product.colores[0] ?? 'Azul');
    if (navigate) {
      this.searchPanelOpen.set(false);
      this.view.set('product');
    }
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
      : products.slice(0, 6);
    return matches.slice(0, 6);
  }

  categorySuggestions() {
    const query = this.normalize(this.search);
    const categories = this.categories();
    const matches = query
      ? categories.filter(category => this.normalize(category.nombre).includes(query))
      : categories.slice(0, 6);
    return matches.slice(0, 6);
  }

  chooseProductSuggestion(product: Product) {
    this.search = product.nombre;
    this.openProduct(product);
  }

  chooseCategorySuggestion(category: Category) {
    this.search = '';
    this.selectCategory(category.nombre);
  }

  selectCategoryFromEvent(event: Event) {
    this.selectCategory((event.target as HTMLSelectElement).value);
  }

  selectSize(size: string) {
    this.selectedSize.set(size);
    this.loadCatalog();
  }

  selectSizeFromEvent(event: Event) {
    this.selectSize((event.target as HTMLSelectElement).value);
  }

  selectColor(color: string) {
    this.selectedColor.set(color);
    this.loadCatalog();
  }

  selectDetailSize(size: string) {
    this.detailSize.set(size);
  }

  selectDetailColor(color: string) {
    this.detailColor.set(color);
  }

  setMaxPrice(event: Event) {
    this.maxPrice.set(Number((event.target as HTMLInputElement).value));
    this.loadCatalog();
  }

  setStockOnly(event: Event) {
    this.stockOnly.set((event.target as HTMLInputElement).checked);
    this.loadCatalog();
  }

  setNewOnly(event: Event) {
    this.newOnly.set((event.target as HTMLInputElement).checked);
    this.loadCatalog();
  }

  setSortMode(event: Event) {
    this.sortMode.set((event.target as HTMLSelectElement).value as 'relevant' | 'price-asc' | 'new');
  }

  clearFilters() {
    this.selectedCategory.set('Todas');
    this.selectedSize.set('Todas');
    this.selectedColor.set('Todos');
    this.maxPrice.set(0);
    this.stockOnly.set(false);
    this.newOnly.set(false);
    this.search = '';
    this.loadCatalog();
  }

  addToCart(product: Product, quantity = 1) {
    if (product.stock <= 0) {
      this.message = `${product.nombre} esta agotado.`;
      return false;
    }
    const size = this.detailSize() || product.tallas[0] || '8';
    const color = this.detailColor() || product.colores[0] || 'Azul';
    const existing = this.cart().find(item => item.product.id === product.id);
    const currentQuantity = existing?.quantity ?? 0;
    const nextQuantity = currentQuantity + quantity;
    if (nextQuantity > product.stock) {
      this.message = `Solo quedan ${product.stock} unidades de ${product.nombre}.`;
      return false;
    }
    if (existing) {
      this.cart.set(this.cart().map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + quantity, size, color }
          : item
      ));
    } else {
      this.cart.set([...this.cart(), { product, quantity, size, color }]);
    }
    this.message = `${product.nombre} agregado al carrito.`;
    return true;
  }

  addSelectedToCart() {
    const product = this.selectedProduct();
    if (product) {
      return this.addToCart(product, this.detailQuantity());
    }
    return false;
  }

  buyNow() {
    if (this.addSelectedToCart()) {
      this.view.set('cart');
    }
  }

  updateDetailQuantity(delta: number) {
    const stock = this.selectedProduct()?.stock ?? 1;
    this.detailQuantity.set(Math.max(1, Math.min(stock, this.detailQuantity() + delta)));
  }

  updateCartQuantity(productId: number, delta: number) {
    const next = this.cart()
      .map(item => item.product.id === productId ? { ...item, quantity: Math.min(item.product.stock, item.quantity + delta) } : item)
      .filter(item => item.quantity > 0);
    this.cart.set(next);
  }

  removeFromCart(productId: number) {
    this.cart.set(this.cart().filter(item => item.product.id !== productId));
  }

  emptyCart() {
    this.cart.set([]);
  }

  toggleFavorite(product: Product) {
    const favorites = new Set(this.favorites());
    const keys = this.productFavoriteKeys(product);
    if (keys.some(key => favorites.has(key))) {
      keys.forEach(key => favorites.delete(key));
    } else {
      favorites.add(this.productKey(product));
    }
    const next = Array.from(favorites);
    this.favorites.set(next);
    this.saveFavorites(next);
  }

  isFavorite(product: Product) {
    return this.productFavoriteKeys(product).some(key => this.favorites().includes(key));
  }

  openFavorites() {
    this.searchPanelOpen.set(false);
    this.accountTab.set('favorites');
    if (!this.currentUser()) {
      this.mode.set('login');
      this.message = 'Inicia sesion para ver tus favoritos guardados.';
      this.view.set('auth');
      return;
    }
    this.view.set('orders');
    this.loadOrders();
  }

  applyDiscount() {
    if (this.discountCode.trim().toUpperCase() === 'BAMBELI10') {
      this.discountPercent.set(10);
      this.message = 'Codigo aplicado: 10% de descuento.';
    } else {
      this.discountPercent.set(0);
      this.message = 'Codigo no valido. Prueba BAMBELI10.';
    }
  }

  login() {
    this.http.post<AuthResponse>(`${this.api}/auth/login`, {
      email: this.auth.email,
      password: this.auth.password
    }).subscribe({
      next: user => {
        this.saveUser(user);
        this.message = `Bienvenido, ${user.nombres}.`;
        if (user.rol === 'ADMINISTRADOR') {
          this.view.set('admin');
          this.adminTab.set('overview');
          this.loadAdmin();
          return;
        }
        this.view.set('home');
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
    if (!this.cart().length) {
      return;
    }
    this.checkoutStep.set(1);
    this.message = '';
    this.view.set('checkout');
  }

  placeOrder() {
    if (!this.cart().length) {
      this.message = 'Agrega productos antes de confirmar el pedido.';
      this.view.set('cart');
      return;
    }
    const finish = (orderId?: number) => {
      this.persistCheckoutForm();
      this.confirmationTotal.set(this.total());
      this.confirmationNumber.set(orderId ? `#BAM-${orderId}` : `#BAM-${Math.floor(24000 + Math.random() * 900)}`);
      this.checkoutStep.set(4);
      this.cart.set([]);
      this.view.set('confirmation');
    };

    if (!this.currentUser()) {
      finish();
      return;
    }

    const items = this.cart().map(item => ({
      productId: item.product.id,
      cantidad: item.quantity,
      talla: item.size,
      color: item.color
    }));
    this.http.post<Order>(`${this.api}/orders`, { items, ...this.checkoutForm }, { headers: this.headers() }).subscribe({
      next: order => {
        this.message = 'Pedido registrado correctamente.';
        this.loadOrders();
        this.loadCatalog();
        finish(order.id);
      },
      error: () => {
        this.message = 'No se pudo registrar el pedido. Revisa stock, sesion o backend.';
      }
    });
  }

  loadOrders() {
    if (!this.currentUser()) {
      this.orders.set([]);
      return;
    }
    this.http.get<Order[]>(`${this.api}/orders/mine`, { headers: this.headers() }).subscribe({
      next: data => this.orders.set(data.map(order => this.normalizeOrder(order))),
      error: () => this.orders.set([])
    });
  }

  loadAdmin() {
    if (this.currentUser()?.rol !== 'ADMINISTRADOR') {
      this.view.set('auth');
      this.message = 'Ingresa con una cuenta administradora.';
      return;
    }

    this.http.get<DashboardData>(`${this.api}/admin/dashboard`, { headers: this.headers() }).subscribe({
      next: data => this.dashboard.set(data),
      error: () => this.dashboard.set({ pedidos: fallbackOrders.length, productos: this.products().length })
    });

    this.http.get<Banner[]>(`${this.api}/banners/admin`, { headers: this.headers() }).subscribe({
      next: data => this.adminBanners.set(data.length ? data : fallbackBanners),
      error: () => this.adminBanners.set(fallbackBanners)
    });

    this.http.get<Order[]>(`${this.api}/admin/orders`, { headers: this.headers() }).subscribe({
      next: data => {
        const orders = data.map(order => this.normalizeOrder(order));
        this.orders.set(orders);
        const selected = orders.find(order => order.id === this.selectedAdminOrderId()) ?? orders[0];
        if (selected) {
          this.selectedAdminOrderId.set(selected.id);
          this.adminStatus = this.nextStatusValue(selected);
        }
      },
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
      imagen: this.productForm.imagen.trim(),
      categoria: { id: categoryId },
      tallas: this.splitList(this.productForm.tallas),
      colores: this.splitList(this.productForm.colores),
      nuevo: this.productForm.nuevo
    };

    const request = this.editProductId()
      ? this.http.put<Product>(`${this.api}/products/${this.editProductId()}`, product, { headers: this.headers() })
      : this.http.post<Product>(`${this.api}/products`, product, { headers: this.headers() });

    request.subscribe({
      next: saved => {
        this.message = `${saved.nombre} fue guardado en el catalogo.`;
        this.editProductId.set(null);
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

  editProduct(product: Product) {
    this.editProductId.set(product.id);
    this.productForm = {
      sku: product.sku ?? '',
      nombre: product.nombre,
      descripcion: product.descripcion,
      detalles: '',
      precio: product.precio,
      stock: product.stock,
      imagen: product.imagen,
      categoriaId: product.categoria.id,
      tallas: product.tallas.join(', '),
      colores: product.colores.join(', '),
      nuevo: Boolean(product.nuevo)
    };
  }

  resetProductForm() {
    this.editProductId.set(null);
    this.productForm = this.emptyProductForm();
  }

  logout() {
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.favorites.set(this.loadFavorites('guest'));
    this.view.set('home');
  }

  selectView(view: View) {
    this.message = '';
    this.searchPanelOpen.set(false);
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

  selectOrder(order: Order) {
    this.selectedOrderId.set(order.id);
  }

  selectAdminOrder(order: Order) {
    this.selectedAdminOrderId.set(order.id);
    this.adminStatus = this.nextStatusValue(order);
  }

  closeAdminOrder() {
    this.selectedAdminOrderId.set(null);
  }

  updateAdminStatus() {
    const order = this.selectedAdminOrder();
    if (!order) {
      return;
    }
    this.http.put<Order>(`${this.api}/orders/${order.id}/status?estado=${this.adminStatus}`, {}, { headers: this.headers() }).subscribe({
      next: () => {
        this.message = `Pedido #BMB-${order.id} actualizado a ${this.statusLabel(this.adminStatus)}.`;
        this.loadAdmin();
        this.loadCatalog();
      },
      error: () => this.message = 'No se pudo actualizar el estado. Verifica que sea la siguiente etapa permitida.'
    });
  }

  nextStatusOptions(order: Order) {
    const status = this.normalizeStatus(order.estado);
    if (status === 'PENDIENTE') {
      return ['CONFIRMADO', 'CANCELADO'];
    }
    if (status === 'CONFIRMADO') {
      return ['EN_PREPARACION', 'CANCELADO'];
    }
    if (status === 'EN_PREPARACION') {
      return ['ENVIADO', 'CANCELADO'];
    }
    if (status === 'ENVIADO') {
      return ['ENTREGADO', 'CANCELADO'];
    }
    if (status === 'CANCELADO') {
      return ['PENDIENTE', 'CONFIRMADO'];
    }
    return ['ENTREGADO'];
  }

  nextStatusValue(order: Order) {
    return this.nextStatusOptions(order)[0] as OrderStatus;
  }

  statusLabel(status: string) {
    const normalized = this.normalizeStatus(status);
    const labels: Record<OrderStatus, string> = {
      PENDIENTE: 'Pendiente',
      CONFIRMADO: 'Confirmado',
      EN_PREPARACION: 'En preparación',
      ENVIADO: 'Enviado',
      ENTREGADO: 'Entregado',
      CANCELADO: 'Cancelado'
    };
    return labels[normalized];
  }

  orderItems(order?: Order) {
    return order?.detalles ?? [];
  }

  orderItemCount(order?: Order) {
    return this.orderItems(order).reduce((sum, item) => sum + item.cantidad, 0);
  }

  orderStatusCount(status: OrderStatus) {
    return this.displayOrders().filter(order => this.normalizeStatus(order.estado) === status).length;
  }

  contactSupport() {
    window.open('https://wa.me/51980543314?text=Hola%20Bambeli%2C%20necesito%20ayuda%20con%20mi%20pedido', '_blank');
  }

  selectDetailTab(tab: DetailTab) {
    this.detailTab.set(tab);
  }

  subscribeNewsletter() {
    const email = this.newsletterEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.message = 'Ingresa un correo valido para suscribirte.';
      return;
    }
    localStorage.setItem(NEWSLETTER_KEY, email);
    this.newsletterEmail = '';
    this.message = 'Suscripcion registrada. Te avisaremos sobre nuevas colecciones Bambeli.';
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
    this.selectCategory(banner.enlace || 'Todas');
  }

  categoryImage(category: Category) {
    return this.imageSrc(this.products().find(product => product.categoria.nombre === category.nombre)?.imagen);
  }

  countByCategory(category: string) {
    return this.products().filter(product => product.categoria.nombre === category).length;
  }

  imageSrc(image?: string) {
    return image?.trim() ? image : '/assets/icons/svg/black/box.svg';
  }

  colorHex(color: string) {
    const normalized = this.normalize(color);
    if (normalized.includes('celeste') || normalized.includes('hielo')) {
      return '#b9d6ee';
    }
    if (normalized.includes('intermedio')) {
      return '#5d7fa3';
    }
    if (normalized.includes('marino')) {
      return '#173b73';
    }
    if (normalized.includes('azul')) {
      return '#1f6fca';
    }
    if (normalized.includes('negro')) {
      return '#111827';
    }
    if (normalized.includes('gris')) {
      return '#9ca3af';
    }
    if (normalized.includes('rosa')) {
      return '#f08ab8';
    }
    return '#f8fafc';
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
      product.genero ?? '',
      ...product.tallas,
      ...product.colores
    ].some(value => this.normalize(value).includes(query));
  }

  private productMatchesCategory(product: Product, selected: string) {
    const selectedValue = this.normalize(selected);
    const category = this.normalize(product.categoria.nombre);
    const gender = this.normalize(product.genero ?? '');
    if (selectedValue === 'todas') {
      return true;
    }
    if (selectedValue === 'nuevos ingresos') {
      return Boolean(product.nuevo);
    }
    if (selectedValue === 'nina') {
      return gender.includes('nina') || category.includes('nina');
    }
    if (selectedValue === 'nino') {
      return gender.includes('nino') || category.includes('nino');
    }
    if (selectedValue === 'pantalones') {
      return category.includes('pantalones');
    }
    if (selectedValue === 'shorts') {
      return category.includes('shorts');
    }
    if (selectedValue === 'faldas') {
      return category.includes('falda');
    }
    if (selectedValue === 'casacas' || selectedValue === 'chaquetas') {
      return category.includes('casaca') || category.includes('chaqueta');
    }
    return category === selectedValue;
  }

  private isExactCatalogCategory(category: string) {
    return this.categories().some(item => item.nombre === category);
  }

  private normalizeProduct(product: Product): Product {
    return {
      ...product,
      precio: Number(product.precio),
      stock: Number(product.stock),
      imagen: product.imagen ?? '',
      tallas: this.sortSizes(product.tallas ?? []),
      colores: this.sortColors(product.colores ?? []),
      genero: product.genero ?? this.inferGender(product)
    };
  }

  private normalizeOrder(order: Order): Order {
    return {
      ...order,
      total: Number(order.total),
      estado: this.normalizeStatus(order.estado),
      detalles: (order.detalles ?? []).map(item => this.normalizeOrderItem(item))
    };
  }

  private normalizeOrderItem(item: OrderItem): OrderItem {
    const product = item.producto;
    return {
      productId: item.productId ?? product?.id ?? 0,
      sku: item.sku ?? product?.sku ?? '',
      nombre: item.nombre ?? product?.nombre ?? 'Producto',
      imagen: item.imagen ?? product?.imagen ?? '',
      categoria: item.categoria ?? product?.categoria?.nombre ?? '',
      talla: item.talla ?? '8',
      color: item.color ?? 'Azul',
      cantidad: Number(item.cantidad ?? 1),
      precio: Number(item.precio ?? product?.precio ?? 0),
      subtotal: Number(item.subtotal ?? (Number(item.precio ?? product?.precio ?? 0) * Number(item.cantidad ?? 1)))
    };
  }

  private normalizeStatus(status: string): OrderStatus {
    const normalized = (status ?? 'PENDIENTE').toUpperCase();
    if (normalized === 'PROCESANDO' || normalized === 'EN PREPARACION' || normalized === 'EN_PREPARACIÓN') {
      return 'EN_PREPARACION';
    }
    return ORDER_STATUSES.includes(normalized as OrderStatus) ? normalized as OrderStatus : 'PENDIENTE';
  }

  private sortSizes(sizes: string[]) {
    const order = new Map(this.sizeOptions.map((size, index) => [size, index]));
    return [...sizes].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }

  private sortColors(colors: string[]) {
    const order = new Map(this.colorOptions.map((color, index) => [this.normalize(color), index]));
    return [...colors].sort((a, b) => (order.get(this.normalize(a)) ?? 99) - (order.get(this.normalize(b)) ?? 99));
  }

  private inferGender(product: Product) {
    const value = this.normalize(`${product.nombre} ${product.descripcion} ${product.imagen}`);
    if (value.includes('ninas') || value.includes('nina')) {
      return 'Niña';
    }
    if (value.includes('ninos') || value.includes('nino')) {
      return 'Niño';
    }
    return 'Unisex';
  }

  private loadFavorites(email?: string) {
    return this.readFavorites(this.favoriteStorageKey(email));
  }

  private saveFavorites(favorites: string[]) {
    localStorage.setItem(this.favoriteStorageKey(), JSON.stringify(favorites));
  }

  private readFavorites(key: string) {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      return [];
    }
    try {
      return (JSON.parse(raw) as Array<string | number>).map(String);
    } catch {
      return [];
    }
  }

  private favoriteStorageKey(email = this.currentUser()?.email ?? this.loadUser()?.email ?? 'guest') {
    return `${FAVORITES_KEY}:${email}`;
  }

  private productKey(product: Product) {
    return product.sku || String(product.id);
  }

  private productFavoriteKeys(product: Product) {
    return Array.from(new Set([this.productKey(product), String(product.id)].filter(Boolean)));
  }

  private loadCheckoutForm() {
    const fallback = {
      nombres: 'Maria Fernanda',
      apellidos: 'Garcia Lopez',
      telefono: '980 543 314',
      email: 'maria.garcia@email.com',
      direccion: 'Av. Javier Prado Este 1234',
      referencia: 'Edificio Los Parques, dpto. 502',
      departamento: 'Lima',
      provincia: 'Lima',
      distrito: 'San Isidro'
    };
    const raw = localStorage.getItem(CHECKOUT_KEY);
    if (!raw) {
      return fallback;
    }
    try {
      return { ...fallback, ...JSON.parse(raw) };
    } catch {
      return fallback;
    }
  }

  private persistCheckoutForm() {
    if (this.saveCheckoutInfo) {
      localStorage.setItem(CHECKOUT_KEY, JSON.stringify(this.checkoutForm));
      return;
    }
    localStorage.removeItem(CHECKOUT_KEY);
  }

  private emptyProductForm(categoryId = this.categories()[0]?.id ?? fallbackCategories[0].id): ProductForm {
    return {
      sku: '',
      nombre: '',
      descripcion: '',
      detalles: '',
      precio: 0,
      stock: 1,
      imagen: '',
      categoriaId: categoryId,
      tallas: '4, 6, 8, 10, 12, 14, 16',
      colores: 'Negro, Azul, Intermedio, Hielo',
      nuevo: true
    };
  }

  private emptyBannerForm(): BannerForm {
    return {
      titulo: '',
      subtitulo: '',
      textoBoton: 'Ver coleccion',
      enlace: 'Todas',
      imagen: '',
      activo: true,
      orden: 1
    };
  }

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.currentUser()?.token ?? ''}` });
  }

  private saveUser(user: AuthResponse) {
    const mergedFavorites = Array.from(new Set([
      ...this.favorites(),
      ...this.readFavorites(this.favoriteStorageKey(user.email))
    ]));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.favorites.set(mergedFavorites);
    this.saveFavorites(mergedFavorites);
  }

  private loadUser(): AuthResponse | null {
    const raw = localStorage.getItem(USER_KEY);
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
  genero?: string;
  nuevo?: boolean;
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
  nuevo: boolean;
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
  nuevo: boolean;
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
  size: string;
  color: string;
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
  estado: OrderStatus;
  usuarioId?: number;
  cliente?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  referencia?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  detalles?: OrderItem[];
}

type OrderStatus = 'PENDIENTE' | 'CONFIRMADO' | 'EN_PREPARACION' | 'ENVIADO' | 'ENTREGADO' | 'CANCELADO';

interface OrderItem {
  productId?: number;
  sku?: string;
  nombre: string;
  imagen: string;
  categoria?: string;
  talla?: string;
  color?: string;
  cantidad: number;
  precio: number;
  subtotal?: number;
  producto?: Product;
}

interface DashboardData {
  [key: string]: unknown;
  usuarios?: number;
  productos?: number;
  categorias?: number;
  pedidos?: number;
  banners?: number;
  ventasDia?: number;
  pedidosPendientes?: number;
  productosBajoStock?: number;
  bajoStock?: Array<{ id: number; sku?: string; nombre: string; stock: number; imagen: string }>;
  masVendidos?: BestSeller[];
}

interface BestSeller {
  id: number;
  sku?: string;
  nombre: string;
  imagen: string;
  vendidos: number;
  ingresos: number;
}

const fallbackBanners: Banner[] = [
  {
    id: 1,
    titulo: 'Hecho para jugar, creado para durar',
    subtitulo: 'Denim comodo, moderno y resistente para cada aventura.',
    textoBoton: 'Para niña',
    enlace: 'Niña',
    imagen: '/assets/BANNERS/1.png',
    activo: true,
    orden: 1
  },
  {
    id: 2,
    titulo: 'Nuevos ingresos',
    subtitulo: 'Para cada aventura.',
    textoBoton: 'Ver coleccion',
    enlace: 'Nuevos ingresos',
    imagen: '/assets/BANNERS/4.png',
    activo: true,
    orden: 2
  },
  {
    id: 3,
    titulo: 'Para niñas con estilo',
    subtitulo: 'Prendas de denim pensadas para su comodidad.',
    textoBoton: 'Ver niñas',
    enlace: 'Niña',
    imagen: '/assets/BANNERS/5.png',
    activo: true,
    orden: 3
  },
  {
    id: 4,
    titulo: 'Listo para todo',
    subtitulo: 'Denim resistente que se mueve con su energia.',
    textoBoton: 'Ver niños',
    enlace: 'Niño',
    imagen: '/assets/BANNERS/6.png',
    activo: true,
    orden: 4
  }
];

const catalogSizes = ['4', '6', '8', '10', '12', '14', '16'];
const catalogColors = ['Negro', 'Azul', 'Intermedio', 'Hielo'];

const fallbackCategories: Category[] = [
  { id: 1, nombre: 'Casacas', descripcion: 'Casacas denim en modelos Clasico y Crop.' },
  { id: 2, nombre: 'Pantalones niño', descripcion: 'Pantalones denim para niño con calce comodo.' },
  { id: 3, nombre: 'Pantalones niña', descripcion: 'Pantalones denim para niña en modelos baggy, moon y sirena.' },
  { id: 4, nombre: 'Shorts niño', descripcion: 'Shorts frescos y resistentes para niño.' },
  { id: 5, nombre: 'Falda short niña', descripcion: 'Faldas short para niña con libertad de movimiento.' },
  { id: 6, nombre: 'Shorts niña', descripcion: 'Shorts denim para niña con detalles divertidos.' }
];

const fallbackProducts: Product[] = [
  { id: 1, sku: 'BMB-001', nombre: 'Casaca Clasico', descripcion: 'Casaca denim modelo Clasico para uso diario con acabado resistente.', precio: 139.9, stock: 45, imagen: '/assets/CATALOGO/CASACAS/27.png', categoria: fallbackCategories[0], tallas: catalogSizes, colores: catalogColors, genero: 'Unisex', nuevo: true },
  { id: 2, sku: 'BMB-002', nombre: 'Casaca Crop', descripcion: 'Casaca denim modelo Crop con corte moderno y comodo.', precio: 129.9, stock: 42, imagen: '/assets/CATALOGO/CASACAS/28.png', categoria: fallbackCategories[0], tallas: catalogSizes, colores: catalogColors, genero: 'Unisex', nuevo: true },
  { id: 3, sku: 'BMB-003', nombre: 'Pantalon Santiago', descripcion: 'Pantalon denim para niño modelo Santiago con bolsillos funcionales.', precio: 119.9, stock: 50, imagen: '/assets/CATALOGO/PANTALONES_NIÑOS/21.png', categoria: fallbackCategories[1], tallas: catalogSizes, colores: catalogColors, genero: 'Niño', nuevo: true },
  { id: 4, sku: 'BMB-004', nombre: 'Pantalon Albeiro', descripcion: 'Pantalon denim para niño modelo Albeiro con pretina comoda.', precio: 119.9, stock: 48, imagen: '/assets/CATALOGO/PANTALONES_NIÑOS/22.png', categoria: fallbackCategories[1], tallas: catalogSizes, colores: catalogColors, genero: 'Niño', nuevo: true },
  { id: 5, sku: 'BMB-005', nombre: 'Pantalon Titi', descripcion: 'Pantalon denim para niño modelo Titi resistente para jugar.', precio: 119.9, stock: 46, imagen: '/assets/CATALOGO/PANTALONES_NIÑOS/23.png', categoria: fallbackCategories[1], tallas: catalogSizes, colores: catalogColors, genero: 'Niño' },
  { id: 6, sku: 'BMB-006', nombre: 'Baggy Estrella', descripcion: 'Pantalon para niña modelo Baggy Estrella con calce amplio.', precio: 129.9, stock: 52, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/1.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 7, sku: 'BMB-007', nombre: 'Baggy Georgina', descripcion: 'Pantalon para niña modelo Baggy Georgina con estilo denim.', precio: 129.9, stock: 52, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/2.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 8, sku: 'BMB-008', nombre: 'Baggy Daniella', descripcion: 'Pantalon para niña modelo Baggy Daniella comodo y resistente.', precio: 129.9, stock: 52, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/3.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 9, sku: 'BMB-009', nombre: 'Baggy Eva', descripcion: 'Pantalon para niña modelo Baggy Eva de denim suave.', precio: 129.9, stock: 50, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/4.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 10, sku: 'BMB-010', nombre: 'Baggy Coraly', descripcion: 'Pantalon para niña modelo Baggy Coraly con acabado moderno.', precio: 129.9, stock: 50, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/5.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 11, sku: 'BMB-011', nombre: 'Moon Amaiya', descripcion: 'Pantalon para niña modelo Moon Amaiya con corte comodo.', precio: 129.9, stock: 48, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/6.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 12, sku: 'BMB-012', nombre: 'Moon Margarita', descripcion: 'Pantalon para niña modelo Moon Margarita para cada aventura.', precio: 129.9, stock: 48, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/7.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 13, sku: 'BMB-013', nombre: 'Sirena Ivanna', descripcion: 'Pantalon para niña modelo Sirena Ivanna con detalle especial.', precio: 129.9, stock: 46, imagen: '/assets/CATALOGO/PANTALONES_NIÑAS/8.png', categoria: fallbackCategories[2], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 14, sku: 'BMB-014', nombre: 'Short Alonso', descripcion: 'Short denim para niño modelo Alonso fresco y resistente.', precio: 89.9, stock: 60, imagen: '/assets/CATALOGO/SHORTS_NIÑOS/24.png', categoria: fallbackCategories[3], tallas: catalogSizes, colores: catalogColors, genero: 'Niño' },
  { id: 15, sku: 'BMB-015', nombre: 'Short Sandro', descripcion: 'Short denim para niño modelo Sandro con calce comodo.', precio: 89.9, stock: 58, imagen: '/assets/CATALOGO/SHORTS_NIÑOS/25.png', categoria: fallbackCategories[3], tallas: catalogSizes, colores: catalogColors, genero: 'Niño' },
  { id: 16, sku: 'BMB-016', nombre: 'Short Erick', descripcion: 'Short denim para niño modelo Erick listo para jugar.', precio: 89.9, stock: 56, imagen: '/assets/CATALOGO/SHORTS_NIÑOS/26.png', categoria: fallbackCategories[3], tallas: catalogSizes, colores: catalogColors, genero: 'Niño' },
  { id: 17, sku: 'BMB-017', nombre: 'Falda Short Lua', descripcion: 'Falda short para niña modelo Lua con movimiento comodo.', precio: 94.9, stock: 44, imagen: '/assets/CATALOGO/FALDAS_NIÑAS/9.png', categoria: fallbackCategories[4], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 18, sku: 'BMB-018', nombre: 'Falda Short Elif', descripcion: 'Falda short para niña modelo Elif en denim resistente.', precio: 94.9, stock: 44, imagen: '/assets/CATALOGO/FALDAS_NIÑAS/10.png', categoria: fallbackCategories[4], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 19, sku: 'BMB-019', nombre: 'Falda Short Catalina', descripcion: 'Falda short para niña modelo Catalina facil de combinar.', precio: 94.9, stock: 42, imagen: '/assets/CATALOGO/FALDAS_NIÑAS/11.png', categoria: fallbackCategories[4], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 20, sku: 'BMB-020', nombre: 'Falda Short Valeria', descripcion: 'Falda short para niña modelo Valeria con estilo diario.', precio: 94.9, stock: 42, imagen: '/assets/CATALOGO/FALDAS_NIÑAS/12.png', categoria: fallbackCategories[4], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 21, sku: 'BMB-021', nombre: 'Falda Short Paola', descripcion: 'Falda short para niña modelo Paola con denim suave.', precio: 94.9, stock: 40, imagen: '/assets/CATALOGO/FALDAS_NIÑAS/13.png', categoria: fallbackCategories[4], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 22, sku: 'BMB-022', nombre: 'Falda Short Marta', descripcion: 'Falda short para niña modelo Marta comoda y versatil.', precio: 94.9, stock: 40, imagen: '/assets/CATALOGO/FALDAS_NIÑAS/14.png', categoria: fallbackCategories[4], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 23, sku: 'BMB-023', nombre: 'Short Marinet', descripcion: 'Short denim para niña modelo Marinet con detalle delicado.', precio: 99.9, stock: 60, imagen: '/assets/CATALOGO/SHORTS_NIÑAS/15.png', categoria: fallbackCategories[5], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 24, sku: 'BMB-024', nombre: 'Short Karla', descripcion: 'Short denim para niña modelo Karla fresco y comodo.', precio: 99.9, stock: 58, imagen: '/assets/CATALOGO/SHORTS_NIÑAS/16.png', categoria: fallbackCategories[5], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 25, sku: 'BMB-025', nombre: 'Short Valentina', descripcion: 'Short denim para niña modelo Valentina para el dia a dia.', precio: 99.9, stock: 56, imagen: '/assets/CATALOGO/SHORTS_NIÑAS/17.png', categoria: fallbackCategories[5], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 26, sku: 'BMB-026', nombre: 'Short Star', descripcion: 'Short denim para niña modelo Star con estilo divertido.', precio: 99.9, stock: 54, imagen: '/assets/CATALOGO/SHORTS_NIÑAS/18.png', categoria: fallbackCategories[5], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 27, sku: 'BMB-027', nombre: 'Short Vania', descripcion: 'Short denim para niña modelo Vania con acabado moderno.', precio: 99.9, stock: 52, imagen: '/assets/CATALOGO/SHORTS_NIÑAS/19.png', categoria: fallbackCategories[5], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' },
  { id: 28, sku: 'BMB-028', nombre: 'Short Brillito', descripcion: 'Short denim para niña modelo Brillito con detalles especiales.', precio: 99.9, stock: 50, imagen: '/assets/CATALOGO/SHORTS_NIÑAS/20.png', categoria: fallbackCategories[5], tallas: catalogSizes, colores: catalogColors, genero: 'Niña' }
];

const fallbackOrderItems: OrderItem[] = [
  {
    productId: fallbackProducts[1].id,
    sku: fallbackProducts[1].sku,
    nombre: fallbackProducts[1].nombre,
    imagen: fallbackProducts[1].imagen,
    categoria: fallbackProducts[1].categoria.nombre,
    talla: '8',
    color: 'Azul',
    cantidad: 1,
    precio: fallbackProducts[1].precio,
    subtotal: fallbackProducts[1].precio
  },
  {
    productId: fallbackProducts[2].id,
    sku: fallbackProducts[2].sku,
    nombre: fallbackProducts[2].nombre,
    imagen: fallbackProducts[2].imagen,
    categoria: fallbackProducts[2].categoria.nombre,
    talla: '10',
    color: 'Hielo',
    cantidad: 1,
    precio: fallbackProducts[2].precio,
    subtotal: fallbackProducts[2].precio
  },
  {
    productId: fallbackProducts[4].id,
    sku: fallbackProducts[4].sku,
    nombre: fallbackProducts[4].nombre,
    imagen: fallbackProducts[4].imagen,
    categoria: fallbackProducts[4].categoria.nombre,
    talla: '12',
    color: 'Intermedio',
    cantidad: 1,
    precio: fallbackProducts[4].precio,
    subtotal: fallbackProducts[4].precio
  }
];

const fallbackOrders: Order[] = [
  { id: 156, fecha: '2026-06-15T10:30:00', total: 159.9, estado: 'PENDIENTE', cliente: 'Maria Fernandez', email: 'mariaf@ejemplo.com', telefono: '912 345 678', direccion: 'Av. Primavera 123, San Borja', detalles: fallbackOrderItems },
  { id: 155, fecha: '2026-06-15T09:15:00', total: 129.9, estado: 'CONFIRMADO', cliente: 'Lucia Gomez', email: 'lucia@ejemplo.com', telefono: '987 111 222', direccion: 'Av. La Marina 500, Pueblo Libre', detalles: fallbackOrderItems.slice(0, 1) },
  { id: 154, fecha: '2026-06-14T16:45:00', total: 239.8, estado: 'EN_PREPARACION', cliente: 'Ana Torres', email: 'ana@ejemplo.com', telefono: '955 222 333', direccion: 'Jr. Los Cedros 240, Surco', detalles: fallbackOrderItems },
  { id: 153, fecha: '2026-06-14T14:20:00', total: 89.9, estado: 'ENVIADO', cliente: 'Carlos Ruiz', email: 'carlos@ejemplo.com', telefono: '944 333 444', direccion: 'Calle Lima 810, Miraflores', detalles: fallbackOrderItems.slice(1, 2) },
  { id: 152, fecha: '2026-06-13T11:05:00', total: 179.8, estado: 'ENTREGADO', cliente: 'Sofia Medina', email: 'sofia@ejemplo.com', telefono: '933 444 555', direccion: 'Av. Arequipa 1200, Lince', detalles: fallbackOrderItems.slice(0, 2) }
];
