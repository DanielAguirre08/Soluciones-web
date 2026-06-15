package com.caoxwear.backend.controller;

import com.caoxwear.backend.dto.AdminOrderResponse;
import com.caoxwear.backend.dto.OrderItemResponse;
import com.caoxwear.backend.entity.Order;
import com.caoxwear.backend.entity.OrderItem;
import com.caoxwear.backend.entity.OrderStatus;
import com.caoxwear.backend.entity.Product;
import com.caoxwear.backend.entity.User;
import com.caoxwear.backend.repository.BannerRepository;
import com.caoxwear.backend.repository.CategoryRepository;
import com.caoxwear.backend.repository.OrderRepository;
import com.caoxwear.backend.repository.ProductRepository;
import com.caoxwear.backend.repository.UserRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMINISTRADOR')")
@RequiredArgsConstructor
public class AdminController {
    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final OrderRepository orderRepository;
    private final BannerRepository bannerRepository;

    @GetMapping("/dashboard")
    @Transactional(readOnly = true)
    public Map<String, Object> dashboard() {
        List<Order> orders = orderRepository.findAll();
        List<Product> products = productRepository.findAll();
        LocalDate today = LocalDate.now();
        BigDecimal salesToday = orders.stream()
                .filter(order -> order.getFecha() != null && order.getFecha().toLocalDate().equals(today))
                .filter(order -> order.getEstado() != OrderStatus.CANCELADO)
                .map(Order::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long pendingOrders = orders.stream()
                .filter(order -> order.getEstado() == OrderStatus.PENDIENTE)
                .count();
        List<Map<String, Object>> lowStockProducts = products.stream()
                .filter(product -> product.getStock() != null && product.getStock() <= 10)
                .sorted(Comparator.comparing(Product::getStock))
                .limit(8)
                .map(product -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", product.getId());
                    item.put("sku", product.getSku() == null ? "" : product.getSku());
                    item.put("nombre", product.getNombre());
                    item.put("stock", product.getStock());
                    item.put("imagen", product.getImagen());
                    return item;
                })
                .toList();
        List<Map<String, Object>> bestSellers = bestSellers(orders);

        return Map.of(
                "usuarios", userRepository.count(),
                "productos", productRepository.count(),
                "categorias", categoryRepository.count(),
                "pedidos", orderRepository.count(),
                "banners", bannerRepository.count(),
                "ventasDia", salesToday,
                "pedidosPendientes", pendingOrders,
                "productosBajoStock", lowStockProducts.size(),
                "bajoStock", lowStockProducts,
                "masVendidos", bestSellers);
    }

    @GetMapping("/users")
    public List<User> users() {
        return userRepository.findAll();
    }

    @GetMapping("/orders")
    @Transactional(readOnly = true)
    public List<AdminOrderResponse> orders() {
        return orderRepository.findAll(Sort.by(Sort.Direction.DESC, "fecha")).stream()
                .map(this::toAdminOrderResponse)
                .toList();
    }

    private AdminOrderResponse toAdminOrderResponse(Order order) {
        User user = order.getUsuario();
        String fullName = ((valueOrDefault(order.getClienteNombres(), user.getNombres())) + " "
                + (valueOrDefault(order.getClienteApellidos(), user.getApellidos()))).trim();
        return new AdminOrderResponse(
                order.getId(),
                order.getFecha(),
                order.getTotal(),
                order.getEstado(),
                user.getId(),
                fullName.isBlank() ? user.getEmail() : fullName,
                valueOrDefault(order.getClienteEmail(), user.getEmail()),
                order.getClienteTelefono(),
                order.getDireccionEnvio(),
                order.getReferenciaEnvio(),
                order.getDepartamento(),
                order.getProvincia(),
                order.getDistrito(),
                order.getDetalles().stream().map(this::toOrderItemResponse).toList());
    }

    private OrderItemResponse toOrderItemResponse(OrderItem item) {
        Product product = item.getProducto();
        BigDecimal subtotal = item.getPrecio().multiply(BigDecimal.valueOf(item.getCantidad()));
        if (product == null) {
            return new OrderItemResponse(
                    0L,
                    "",
                    "Producto no disponible",
                    "",
                    "",
                    item.getTalla(),
                    item.getColor(),
                    item.getCantidad(),
                    item.getPrecio(),
                    subtotal);
        }
        return new OrderItemResponse(
                product.getId(),
                product.getSku(),
                product.getNombre(),
                product.getImagen(),
                product.getCategoria().getNombre(),
                item.getTalla(),
                item.getColor(),
                item.getCantidad(),
                item.getPrecio(),
                subtotal);
    }

    private List<Map<String, Object>> bestSellers(List<Order> orders) {
        Map<Product, Integer> quantities = orders.stream()
                .filter(order -> order.getEstado() != OrderStatus.CANCELADO)
                .flatMap(order -> order.getDetalles().stream())
                .filter(item -> item.getProducto() != null)
                .collect(Collectors.groupingBy(OrderItem::getProducto, Collectors.summingInt(OrderItem::getCantidad)));
        return quantities.entrySet().stream()
                .sorted(Map.Entry.<Product, Integer>comparingByValue().reversed())
                .limit(8)
                .map(entry -> {
                    Product product = entry.getKey();
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", product.getId());
                    item.put("sku", product.getSku());
                    item.put("nombre", product.getNombre());
                    item.put("imagen", product.getImagen());
                    item.put("vendidos", entry.getValue());
                    item.put("ingresos", product.getPrecio().multiply(BigDecimal.valueOf(entry.getValue())));
                    return item;
                })
                .toList();
    }

    private String valueOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? (fallback == null ? "" : fallback) : value;
    }
}
