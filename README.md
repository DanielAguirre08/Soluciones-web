# Bambeli

Proyecto final de e-commerce de ropa infantil Bambeli con Angular, Spring Boot, JWT, Swagger y SQLite.

## Estructura

- `frontend`: SPA Angular para catalogo, carrito, login, pedidos y panel admin.
- `backend`: API REST Spring Boot con arquitectura `controller -> service -> repository -> entity`.

## Requisitos antes de ejecutar

Instalar o tener disponible:

- Java JDK 21 o superior. El backend usa Spring Boot y compila con Java 21.
- Node.js y npm. El frontend usa Angular; las dependencias se instalan con `npm install`.
- Git, si se va a clonar el proyecto desde GitHub.
- Navegador web moderno, por ejemplo Chrome, Edge o Firefox.

No es obligatorio instalar Maven aparte porque el backend ya incluye Maven Wrapper:

- Windows: `backend/mvnw.cmd`
- Linux/Mac: `backend/mvnw`

Extensiones recomendadas para VS Code:

- Angular Language Service, para trabajar mejor con archivos Angular.
- Extension Pack for Java o Spring Boot Extension Pack, para el backend Java.
- SQLite Viewer, SQLite o una extension similar para abrir `backend/bambeli.db`.

Programa opcional para ver la base de datos:

- DB Browser for SQLite: permite abrir `backend/bambeli.db`, ver tablas, datos, pedidos, productos y usuarios.

Puertos usados por el proyecto:

- Frontend: `http://localhost:4200`
- Backend: `http://localhost:8080`

Antes de iniciar, cerrar otros procesos que ya esten usando los puertos `4200` o `8080`.

## Ejecutar backend

```bash
cd backend
.\mvnw.cmd spring-boot:run
```

Backend: `http://localhost:8080`

Swagger: `http://localhost:8080/swagger-ui/index.html`

## Base de datos

El proyecto usa SQLite. La base local se crea automaticamente como `backend/bambeli.db` cuando se ejecuta el backend desde la carpeta `backend`.

El archivo `.db` no se abre con Bloc de notas ni como texto en VS Code porque es un archivo binario de SQLite. Para verlo correctamente usar:

- Extension SQLite Viewer o SQLite dentro de VS Code.
- DB Browser for SQLite, abriendo el archivo `backend/bambeli.db`.

Ese archivo no se sube a GitHub porque es una base local de trabajo. Esta ignorado en `.gitignore` para evitar subir datos personales, pedidos de prueba o cambios propios de cada computadora.

Cuando otra persona clona el proyecto, no necesita recibir el archivo `.db`. Al iniciar Spring Boot:

- Hibernate crea o actualiza las tablas segun las entidades Java.
- `DataSeeder` inserta los usuarios demo, categorias, productos base y banners iniciales.
- Los productos base salen de `backend/src/main/resources/catalog/productos_bambeli.csv`.
- Las imagenes publicas se cargan desde `frontend/public/assets`.

Si alguien quiere reiniciar la base desde cero, debe cerrar el backend, borrar `backend/bambeli.db` y volver a ejecutar `.\mvnw.cmd spring-boot:run` desde `backend`.

## Flujo despues de clonar

```bash
git clone https://github.com/Alex-bit64/SolucionesWeb.git
cd SolucionesWeb
```

Primero iniciar el backend:

```bash
cd backend
.\mvnw.cmd spring-boot:run
```

Luego, en otra terminal, iniciar el frontend:

```bash
cd frontend
npm install
npm start
```

Despues abrir:

- Frontend: `http://localhost:4200`
- Backend: `http://localhost:8080`
- Swagger: `http://localhost:8080/swagger-ui/index.html`

## Ejecutar frontend

```bash
cd frontend
npm install
npm start
```

Frontend: `http://localhost:4200`

## Credenciales demo

- Admin: `admin@bambeli.com` / `12345678`
- Cliente: `cliente@bambeli.com` / `12345678`

## Endpoints principales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/products?page=0&size=10`
- `GET /api/categories`
- `POST /api/orders`
- `GET /api/orders/mine`
- `GET /api/admin/dashboard`
