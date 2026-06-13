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
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@RequiredArgsConstructor
public class DataSeeder {
    private static final String PUBLIC_ASSET_BASE = "/caoxwear/";
    private static final Set<String> LEGACY_PRODUCTS = Set.of(
            "Polo Oversize Noir",
            "Casaca Denim Urbana",
            "Vestido Minimal Beige",
            "Polo Classic Blanco");
    private static final Set<String> LEGACY_CATEGORIES = Set.of("Vestidos");
    private static final Set<String> LEGACY_BANNERS = Set.of(
            "Nueva temporada urbana",
            "Hasta 40% en seleccionados",
            "Basicos premium",
            "2000s energy",
            "Peruvian roots");

    private final PasswordEncoder passwordEncoder;

    @Bean
    CommandLineRunner seed(UserRepository users, CategoryRepository categories, ProductRepository products,
            BannerRepository banners) {
        return args -> {
            seedUsers(users);
            seedProducts(categories, products);
            seedBanners(banners);
        };
    }

    private void seedUsers(UserRepository users) {
        if (!users.existsByEmail("admin@caoxwear.com")) {
            User admin = new User();
            admin.setNombres("Admin");
            admin.setApellidos("CaoxWear");
            admin.setEmail("admin@caoxwear.com");
            admin.setPassword(passwordEncoder.encode("12345678"));
            admin.setRol(Role.ADMINISTRADOR);
            users.save(admin);
        }
        if (!users.existsByEmail("cliente@caoxwear.com")) {
            User client = new User();
            client.setNombres("Cliente");
            client.setApellidos("Demo");
            client.setEmail("cliente@caoxwear.com");
            client.setPassword(passwordEncoder.encode("12345678"));
            client.setRol(Role.CLIENTE);
            users.save(client);
        }
    }

    private void seedProducts(CategoryRepository categories, ProductRepository products) throws Exception {
        products.findAll().stream()
                .filter(product -> LEGACY_PRODUCTS.contains(product.getNombre()))
                .forEach(products::delete);
        categories.findAll().stream()
                .filter(category -> LEGACY_CATEGORIES.contains(category.getNombre()))
                .filter(category -> products.countByCategoriaNombre(category.getNombre()) == 0)
                .forEach(categories::delete);

        Map<String, Category> categoryCache = categories.findAll().stream()
                .collect(Collectors.toMap(Category::getNombre, Function.identity(), (first, second) -> first,
                        LinkedHashMap::new));

        try (InputStream input = getClass().getResourceAsStream("/caoxwear/productos_caoxwear.csv")) {
            if (input == null) {
                throw new IllegalStateException("No se encontro caoxwear/productos_caoxwear.csv");
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
                }
            }
        }
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
        product.setImagen(PUBLIC_ASSET_BASE + values.get(8));
        products.save(product);
    }

    private void seedBanners(BannerRepository banners) {
        banners.findAll().stream()
                .filter(banner -> LEGACY_BANNERS.contains(banner.getTitulo()))
                .forEach(banners::delete);

        upsertBanner(banners, "Freestyle is culture",
                "Streetwear hecho en Lima, Peru.",
                "Comprar ahora", "catalog", "/caoxwear/banners/banner_home_desktop_1920x600.webp", 1);
        upsertBanner(banners, "Nuevos lanzamientos",
                "Hoodies, cargos, gorras y tees.",
                "Explorar", "catalog", "/caoxwear/banners/banner_strip_nuevos_1920x320.webp", 2);
        upsertBanner(banners, "Casacas street",
                "Bomber, denim y windbreaker.",
                "Ver casacas", "catalog", "/caoxwear/banners/banner_categoria_casacas_1600x500.webp", 3);
        upsertBanner(banners, "Gorras y accesorios",
                "Completa el fit urbano.",
                "Ver productos", "catalog", "/caoxwear/banners/banner_categoria_gorras_1600x500.webp", 4);
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

    private String categoryDescription(String name) {
        return switch (name) {
            case "Hoodies" -> "Poleras urbanas con graficas CaoxWear.";
            case "Polos" -> "Tees y polos de uso diario.";
            case "Casacas" -> "Capas exteriores para drops streetwear.";
            case "Gorras" -> "Accesorios de cabeza con marca CW.";
            case "Pantalones" -> "Joggers y cargos para outfits completos.";
            case "Shorts" -> "Piezas ligeras para looks de verano.";
            case "Accesorios" -> "Complementos para llevar essentials.";
            case "Tie-Dye" -> "Prendas con energia freestyle y patron urbano.";
            default -> "Coleccion CaoxWear.";
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
