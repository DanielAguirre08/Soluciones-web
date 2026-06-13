# CaoxWear

Proyecto final de e-commerce de ropa con Angular, Spring Boot, JWT, Swagger y SQLite.

## Estructura

- `frontend`: SPA Angular para catalogo, carrito, login, pedidos y panel admin.
- `backend`: API REST Spring Boot con arquitectura `controller -> service -> repository -> entity`.

## Ejecutar backend

```bash
.\start-backend.ps1
```

O manualmente:

```bash
cd backend
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
mvnw.cmd spring-boot:run
```

Backend: `http://localhost:8080`

Swagger: `http://localhost:8080/swagger-ui/index.html`

## Ejecutar frontend

```bash
.\start-frontend.ps1
```

O manualmente:

```bash
cd frontend
set "PATH=C:\Program Files\nodejs;C:\Users\USER\AppData\Roaming\npm;%PATH%"
npm start
```

Frontend: `http://localhost:4200`

## Credenciales demo

- Admin: `admin@caoxwear.com` / `12345678`
- Cliente: `cliente@caoxwear.com` / `12345678`

## Endpoints principales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/products?page=0&size=10`
- `GET /api/categories`
- `POST /api/orders`
- `GET /api/orders/mine`
- `GET /api/admin/dashboard`
