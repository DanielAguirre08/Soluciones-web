package com.caoxwear.backend.config;

import com.caoxwear.backend.entity.Banner;
import com.caoxwear.backend.entity.Category;
import com.caoxwear.backend.entity.Product;
import com.caoxwear.backend.entity.Role;
import com.caoxwear.backend.entity.User;
import com.caoxwear.backend.repository.BannerRepository;
import com.caoxwear.backend.repository.CategoryRepository;
import com.caoxwear.backend.repository.ProductRepository;
import com.caoxwear.backend.repository.UserRepository;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@RequiredArgsConstructor
public class DataSeeder {
    private static final String PUBLIC_ASSET_BASE = "/assets/";
    private static final List<String> BAMBELI_CATEGORIES = List.of(
            "Casacas",
            "Pantalones niño",
            "Pantalones niña",
            "Shorts niño",
            "Falda short niña",
            "Shorts niña");
    private static final Set<String> LEGACY_PRODUCTS = Set.of(
            "Polo Oversize Noir",
            "Casaca Denim Urbana",
            "Vestido Minimal Beige",
            "Polo Classic Blanco");
    private static final Set<String> LEGACY_CATEGORIES = Set.of(
            "Vestidos",
            "Hoodies",
            "Polos",
            "Casacas",
            "Gorras",
            "Pantalones",
            "Accesorios",
            "Tie-Dye");
    private static final Set<String> LEGACY_BANNERS = Set.of(
            "Nueva temporada urbana",
            "Hasta 40% en seleccionados",
            "Basicos premium",
            "2000s energy",
            "Peruvian roots",
            "Freestyle is culture",
            "Nuevos lanzamientos",
            "Casacas street",
            "Gorras y accesorios");

    private final PasswordEncoder passwordEncoder;

    @Bean
    CommandLineRunner seed(UserRepository users, CategoryRepository categories, ProductRepository products,
            BannerRepository banners, JdbcTemplate jdbc) {
        return args -> {
            migrateOrderStatusCheck(jdbc);
            seedUsers(users);
            seedProducts(categories, products);
            seedBanners(banners);
        };
    }

    private void migrateOrderStatusCheck(JdbcTemplate jdbc) {
        List<String> tableDefinitions = jdbc.queryForList(
                "select sql from sqlite_master where type = 'table' and name = 'pedidos'", String.class);
        if (tableDefinitions.isEmpty() || tableDefinitions.get(0).contains("CONFIRMADO")) {
            return;
        }

        jdbc.execute("PRAGMA foreign_keys=off");
        jdbc.execute("ALTER TABLE pedidos RENAME TO pedidos_old");
        jdbc.execute("""
                CREATE TABLE pedidos (
                    id integer,
                    estado varchar(255) check (estado in ('PENDIENTE','CONFIRMADO','EN_PREPARACION','PROCESANDO','ENVIADO','ENTREGADO','CANCELADO')),
                    fecha timestamp,
                    total numeric(38,2),
                    usuario_id bigint not null,
                    cliente_apellidos varchar(255),
                    cliente_email varchar(255),
                    cliente_nombres varchar(255),
                    cliente_telefono varchar(255),
                    departamento varchar(255),
                    direccion_envio varchar(255),
                    distrito varchar(255),
                    provincia varchar(255),
                    referencia_envio varchar(255),
                    primary key (id)
                )
                """);
        jdbc.execute("""
                INSERT INTO pedidos (
                    id, estado, fecha, total, usuario_id, cliente_apellidos, cliente_email,
                    cliente_nombres, cliente_telefono, departamento, direccion_envio,
                    distrito, provincia, referencia_envio
                )
                SELECT
                    id, estado, fecha, total, usuario_id, cliente_apellidos, cliente_email,
                    cliente_nombres, cliente_telefono, departamento, direccion_envio,
                    distrito, provincia, referencia_envio
                FROM pedidos_old
                """);
        jdbc.execute("DROP TABLE pedidos_old");
        jdbc.execute("PRAGMA foreign_keys=on");
    }

    private void seedUsers(UserRepository users) {
        if (!users.existsByEmail("admin@bambeli.com")) {
            User admin = new User();
            admin.setNombres("Admin");
            admin.setApellidos("Bambeli");
            admin.setEmail("admin@bambeli.com");
            admin.setPassword(passwordEncoder.encode("12345678"));
            admin.setRol(Role.ADMINISTRADOR);
            users.save(admin);
        }
        if (!users.existsByEmail("cliente@bambeli.com")) {
            User client = new User();
            client.setNombres("Maria");
            client.setApellidos("Garcia");
            client.setEmail("cliente@bambeli.com");
            client.setPassword(passwordEncoder.encode("12345678"));
            client.setRol(Role.CLIENTE);
            users.save(client);
        }
    }

    private void seedProducts(CategoryRepository categories, ProductRepository products) throws Exception {
        Set<String> catalogSkus = fallbackProductRows().stream()
                .map(values -> values.get(0))
                .collect(Collectors.toSet());
        products.findAll().stream()
                .filter(product -> LEGACY_PRODUCTS.contains(product.getNombre())
                        || (product.getSku() != null && product.getSku().startsWith("CW-"))
                        || (product.getSku() != null && product.getSku().startsWith("BMB-")
                                && !catalogSkus.contains(product.getSku())))
                .forEach(products::delete);
        categories.findAll().stream()
                .filter(category -> LEGACY_CATEGORIES.contains(category.getNombre())
                        || !BAMBELI_CATEGORIES.contains(category.getNombre()))
                .filter(category -> products.countByCategoriaNombre(category.getNombre()) == 0)
                .forEach(categories::delete);

        Map<String, Category> categoryCache = categories.findAll().stream()
                .collect(Collectors.toMap(Category::getNombre, Function.identity(), (first, second) -> first,
                        LinkedHashMap::new));
        BAMBELI_CATEGORIES.forEach(name -> {
            Category category = categoryCache.computeIfAbsent(name,
                    categoryName -> categories.save(category(categoryName, categoryDescription(categoryName))));
            String description = categoryDescription(name);
            if (!description.equals(category.getDescripcion())) {
                category.setDescripcion(description);
                categoryCache.put(name, categories.save(category));
            }
        });

        int imported = 0;
        try (InputStream input = getClass().getResourceAsStream("/catalog/productos_bambeli.csv")) {
            if (input == null) {
                throw new IllegalStateException("No se encontro catalog/productos_bambeli.csv");
            }

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                reader.readLine();
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) {
                        continue;
                    }
                    List<String> values = parseCsvLine(line);
                    if (values.size() < 9) {
                        continue;
                    }
                    upsertProduct(values, categoryCache, categories, products);
                    imported++;
                }
            }
        }
        if (imported == 0 || products.findBySku("BMB-001").isEmpty()) {
            fallbackProductRows().forEach(values -> upsertProduct(values, categoryCache, categories, products));
        }
        categories.findAll().stream()
                .filter(category -> !BAMBELI_CATEGORIES.contains(category.getNombre()))
                .filter(category -> products.countByCategoriaNombre(category.getNombre()) == 0)
                .forEach(categories::delete);
    }

    private void upsertProduct(List<String> values, Map<String, Category> categoryCache,
            CategoryRepository categories, ProductRepository products) {
        String sku = values.get(0);
        String categoryName = values.get(5);
        Category category = categoryCache.computeIfAbsent(categoryName,
                name -> categories.save(category(name, categoryDescription(name))));
        String description = categoryDescription(categoryName);
        if (!description.equals(category.getDescripcion())) {
            category.setDescripcion(description);
            category = categories.save(category);
            categoryCache.put(categoryName, category);
        }

        Product product = products.findBySku(sku).orElseGet(Product::new);
        product.setSku(sku);
        product.setNombre(values.get(1));
        product.setDescripcion(values.get(2));
        product.setPrecio(new BigDecimal(values.get(3)));
        product.setStock(Integer.parseInt(values.get(4)));
        product.setCategoria(category);
        product.setTallas(splitSet(values.get(6)));
        product.setColores(splitSet(values.get(7)));
        String imagePath = values.get(8);
        product.setImagen(imagePath.isBlank() ? "" : PUBLIC_ASSET_BASE + imagePath);
        product.setNuevo(Set.of("BMB-001", "BMB-002", "BMB-003", "BMB-004").contains(sku));
        products.save(product);
    }

    private void seedBanners(BannerRepository banners) {
        banners.findAll().stream()
                .filter(banner -> LEGACY_BANNERS.contains(banner.getTitulo())
                        || (banner.getImagen() != null && banner.getImagen().contains("/caoxwear/")))
                .forEach(banners::delete);

        upsertBanner(banners, "Hecho para jugar, creado para durar",
                "Denim comodo, moderno y resistente para cada aventura.",
                "Para niña", "Niña", "/assets/BANNERS/1.png", 1);
        upsertBanner(banners, "Nuevos ingresos",
                "Descubre los nuevos estilos en denim que los acompañan todos los dias.",
                "Ver coleccion", "Nuevos ingresos", "/assets/BANNERS/4.png", 2);
        upsertBanner(banners, "Para niñas con estilo",
                "Prendas de denim pensadas para su comodidad y libertad.",
                "Ver niñas", "Niña", "/assets/BANNERS/5.png", 3);
        upsertBanner(banners, "Listo para todo",
                "Denim resistente que se mueve con su energia.",
                "Ver niños", "Niño", "/assets/BANNERS/6.png", 4);
    }

    private void upsertBanner(BannerRepository banners, String title, String subtitle, String button,
            String link, String image, Integer order) {
        Banner banner = banners.findAll().stream()
                .filter(item -> title.equals(item.getTitulo()))
                .findFirst()
                .orElseGet(Banner::new);
        banner.setTitulo(title);
        banner.setSubtitulo(subtitle);
        banner.setTextoBoton(button);
        banner.setEnlace(link);
        banner.setImagen(image);
        banner.setOrden(order);
        banner.setActivo(true);
        banners.save(banner);
    }

    private Category category(String nombre, String descripcion) {
        Category category = new Category();
        category.setNombre(nombre);
        category.setDescripcion(descripcion);
        return category;
    }

    private List<List<String>> fallbackProductRows() {
        return List.of(
                List.of("BMB-001", "Casaca Clasico",
                        "Casaca denim modelo Clasico para uso diario con acabado resistente", "139.90", "45",
                        "Casacas", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/CASACAS/27.png"),
                List.of("BMB-002", "Casaca Crop",
                        "Casaca denim modelo Crop con corte moderno y comodo", "129.90", "42",
                        "Casacas", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/CASACAS/28.png"),
                List.of("BMB-003", "Pantalon Santiago",
                        "Pantalon denim para nino modelo Santiago con bolsillos funcionales", "119.90", "50",
                        "Pantalones niño", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑOS/21.png"),
                List.of("BMB-004", "Pantalon Albeiro",
                        "Pantalon denim para nino modelo Albeiro con pretina comoda", "119.90", "48",
                        "Pantalones niño", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑOS/22.png"),
                List.of("BMB-005", "Pantalon Titi",
                        "Pantalon denim para nino modelo Titi resistente para jugar", "119.90", "46",
                        "Pantalones niño", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑOS/23.png"),
                List.of("BMB-006", "Baggy Estrella",
                        "Pantalon para nina modelo Baggy Estrella con calce amplio", "129.90", "52",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/1.png"),
                List.of("BMB-007", "Baggy Georgina",
                        "Pantalon para nina modelo Baggy Georgina con estilo denim", "129.90", "52",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/2.png"),
                List.of("BMB-008", "Baggy Daniella",
                        "Pantalon para nina modelo Baggy Daniella comodo y resistente", "129.90", "52",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/3.png"),
                List.of("BMB-009", "Baggy Eva",
                        "Pantalon para nina modelo Baggy Eva de denim suave", "129.90", "50",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/4.png"),
                List.of("BMB-010", "Baggy Coraly",
                        "Pantalon para nina modelo Baggy Coraly con acabado moderno", "129.90", "50",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/5.png"),
                List.of("BMB-011", "Moon Amaiya",
                        "Pantalon para nina modelo Moon Amaiya con corte comodo", "129.90", "48",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/6.png"),
                List.of("BMB-012", "Moon Margarita",
                        "Pantalon para nina modelo Moon Margarita para cada aventura", "129.90", "48",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/7.png"),
                List.of("BMB-013", "Sirena Ivanna",
                        "Pantalon para nina modelo Sirena Ivanna con detalle especial", "129.90", "46",
                        "Pantalones niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/PANTALONES_NIÑAS/8.png"),
                List.of("BMB-014", "Short Alonso",
                        "Short denim para nino modelo Alonso fresco y resistente", "89.90", "60",
                        "Shorts niño", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑOS/24.png"),
                List.of("BMB-015", "Short Sandro",
                        "Short denim para nino modelo Sandro con calce comodo", "89.90", "58",
                        "Shorts niño", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑOS/25.png"),
                List.of("BMB-016", "Short Erick",
                        "Short denim para nino modelo Erick listo para jugar", "89.90", "56",
                        "Shorts niño", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑOS/26.png"),
                List.of("BMB-017", "Falda Short Lua",
                        "Falda short para nina modelo Lua con movimiento comodo", "94.90", "44",
                        "Falda short niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/FALDAS_NIÑAS/9.png"),
                List.of("BMB-018", "Falda Short Elif",
                        "Falda short para nina modelo Elif en denim resistente", "94.90", "44",
                        "Falda short niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/FALDAS_NIÑAS/10.png"),
                List.of("BMB-019", "Falda Short Catalina",
                        "Falda short para nina modelo Catalina facil de combinar", "94.90", "42",
                        "Falda short niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/FALDAS_NIÑAS/11.png"),
                List.of("BMB-020", "Falda Short Valeria",
                        "Falda short para nina modelo Valeria con estilo diario", "94.90", "42",
                        "Falda short niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/FALDAS_NIÑAS/12.png"),
                List.of("BMB-021", "Falda Short Paola",
                        "Falda short para nina modelo Paola con denim suave", "94.90", "40",
                        "Falda short niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/FALDAS_NIÑAS/13.png"),
                List.of("BMB-022", "Falda Short Marta",
                        "Falda short para nina modelo Marta comoda y versatil", "94.90", "40",
                        "Falda short niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/FALDAS_NIÑAS/14.png"),
                List.of("BMB-023", "Short Marinet",
                        "Short denim para nina modelo Marinet con detalle delicado", "99.90", "60",
                        "Shorts niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑAS/15.png"),
                List.of("BMB-024", "Short Karla",
                        "Short denim para nina modelo Karla fresco y comodo", "99.90", "58",
                        "Shorts niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑAS/16.png"),
                List.of("BMB-025", "Short Valentina",
                        "Short denim para nina modelo Valentina para el dia a dia", "99.90", "56",
                        "Shorts niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑAS/17.png"),
                List.of("BMB-026", "Short Star",
                        "Short denim para nina modelo Star con estilo divertido", "99.90", "54",
                        "Shorts niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑAS/18.png"),
                List.of("BMB-027", "Short Vania",
                        "Short denim para nina modelo Vania con acabado moderno", "99.90", "52",
                        "Shorts niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑAS/19.png"),
                List.of("BMB-028", "Short Brillito",
                        "Short denim para nina modelo Brillito con detalles especiales", "99.90", "50",
                        "Shorts niña", "4, 6, 8, 10, 12, 14, 16", "Negro, Azul, Intermedio, Hielo",
                        "CATALOGO/SHORTS_NIÑAS/20.png"));
    }

    private String categoryDescription(String name) {
        return switch (name) {
            case "Casacas" -> "Casacas denim en modelos Clasico y Crop.";
            case "Pantalones niño" -> "Pantalones denim para niño con calce comodo.";
            case "Pantalones niña" -> "Pantalones denim para niña en modelos baggy, moon y sirena.";
            case "Shorts niño" -> "Shorts frescos y resistentes para niño.";
            case "Falda short niña" -> "Faldas short para niña con libertad de movimiento.";
            case "Shorts niña" -> "Shorts denim para niña con detalles divertidos.";
            default -> "Coleccion Bambeli Denim Kids.";
        };
    }

    private Set<String> splitSet(String value) {
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char character = line.charAt(index);
            if (character == '"') {
                if (quoted && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    current.append(character);
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (character == ',' && !quoted) {
                values.add(current.toString().trim());
                current.setLength(0);
            } else {
                current.append(character);
            }
        }
        values.add(current.toString().trim());
        return values;
    }
}
