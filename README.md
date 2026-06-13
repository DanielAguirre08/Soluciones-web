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

## Base de datos

El proyecto usa SQLite. La base local se crea automaticamente como `backend/caoxwear.db` cuando se ejecuta el backend desde la carpeta `backend`.

Ese archivo no se sube a GitHub porque es una base local de trabajo. Esta ignorado en `.gitignore` para evitar subir datos personales, pedidos de prueba o cambios propios de cada computadora.

Cuando otra persona clona el proyecto, no necesita recibir el archivo `.db`. Al iniciar Spring Boot:

- Hibernate crea o actualiza las tablas segun las entidades Java.
- `DataSeeder` inserta los usuarios demo, categorias, productos base y banners iniciales.
- Los productos base salen de `backend/src/main/resources/caoxwear/productos_caoxwear.csv`.
- Las imagenes publicas se cargan desde `frontend/public/caoxwear`.

Si alguien quiere reiniciar la base desde cero, debe cerrar el backend, borrar `backend/caoxwear.db` y volver a ejecutar `.\start-backend.ps1`.

## Flujo despues de clonar

```bash
git clone https://github.com/Alex-bit64/SolucionesWeb.git
cd SolucionesWeb
```

Primero iniciar el backend:

```bash
.\start-backend.ps1
```

Luego, en otra terminal, iniciar el frontend:

```bash
.\start-frontend.ps1
```

Despues abrir:

- Frontend: `http://localhost:4200`
- Backend: `http://localhost:8080`
- Swagger: `http://localhost:8080/swagger-ui/index.html`

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
