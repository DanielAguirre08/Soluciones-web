package com.caoxwear.backend.service;

import com.caoxwear.backend.dto.OrderRequest;
import com.caoxwear.backend.entity.Order;
import com.caoxwear.backend.entity.OrderItem;
import com.caoxwear.backend.entity.OrderStatus;
import com.caoxwear.backend.entity.Product;
import com.caoxwear.backend.entity.User;
import com.caoxwear.backend.repository.OrderRepository;
import com.caoxwear.backend.repository.ProductRepository;
import com.caoxwear.backend.repository.UserRepository;
import java.math.BigDecimal;
import java.security.Principal;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OrderService {
    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    @Transactional
    public Order create(OrderRequest request, Principal principal) {
        User user = userRepository.findByEmail(principal.getName()).orElseThrow();
        Order order = new Order();
        order.setUsuario(user);
        order.setClienteNombres(valueOrDefault(request.nombres(), user.getNombres()));
        order.setClienteApellidos(valueOrDefault(request.apellidos(), user.getApellidos()));
        order.setClienteEmail(valueOrDefault(request.email(), user.getEmail()));
        order.setClienteTelefono(request.telefono());
        order.setDireccionEnvio(request.direccion());
        order.setReferenciaEnvio(request.referencia());
        order.setDepartamento(request.departamento());
        order.setProvincia(request.provincia());
        order.setDistrito(request.distrito());

        request.items().forEach(line -> {
            Product product = productRepository.findById(line.productId())
                    .orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
            if (product.getStock() < line.cantidad()) {
                throw new IllegalArgumentException("Stock insuficiente para " + product.getNombre());
            }
            product.setStock(product.getStock() - line.cantidad());
            OrderItem item = new OrderItem();
            item.setPedido(order);
            item.setProducto(product);
            item.setCantidad(line.cantidad());
            item.setPrecio(product.getPrecio());
            item.setTalla(valueOrDefault(line.talla(), firstValue(product.getTallas())));
            item.setColor(valueOrDefault(line.color(), firstValue(product.getColores())));
            order.getDetalles().add(item);
        });

        BigDecimal total = order.getDetalles().stream()
                .map(item -> item.getPrecio().multiply(BigDecimal.valueOf(item.getCantidad())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        order.setTotal(total);
        return orderRepository.save(order);
    }

    public List<Order> myOrders(Principal principal) {
        return orderRepository.findByUsuarioEmailOrderByFechaDesc(principal.getName());
    }

    @Transactional
    public Order updateStatus(Long id, OrderStatus requestedStatus) {
        Order order = orderRepository.findById(id).orElseThrow();
        OrderStatus current = normalizeStatus(order.getEstado());
        OrderStatus next = normalizeStatus(requestedStatus);
        if (!allowedNextStatuses(current).contains(next)) {
            throw new IllegalArgumentException("Transicion de estado no permitida");
        }

        if (next == OrderStatus.CANCELADO && current != OrderStatus.CANCELADO) {
            restoreStock(order);
        }
        if (current == OrderStatus.CANCELADO && next != OrderStatus.CANCELADO) {
            reserveStock(order);
        }

        order.setEstado(next);
        return orderRepository.save(order);
    }

    private Set<OrderStatus> allowedNextStatuses(OrderStatus status) {
        EnumMap<OrderStatus, Set<OrderStatus>> transitions = new EnumMap<>(OrderStatus.class);
        transitions.put(OrderStatus.PENDIENTE, EnumSet.of(OrderStatus.CONFIRMADO, OrderStatus.CANCELADO));
        transitions.put(OrderStatus.CONFIRMADO, EnumSet.of(OrderStatus.EN_PREPARACION, OrderStatus.CANCELADO));
        transitions.put(OrderStatus.EN_PREPARACION, EnumSet.of(OrderStatus.ENVIADO, OrderStatus.CANCELADO));
        transitions.put(OrderStatus.ENVIADO, EnumSet.of(OrderStatus.ENTREGADO, OrderStatus.CANCELADO));
        transitions.put(OrderStatus.ENTREGADO, EnumSet.of(OrderStatus.ENTREGADO));
        transitions.put(OrderStatus.CANCELADO, EnumSet.of(OrderStatus.PENDIENTE, OrderStatus.CONFIRMADO));
        return transitions.getOrDefault(status, EnumSet.of(OrderStatus.CANCELADO));
    }

    private OrderStatus normalizeStatus(OrderStatus status) {
        return status == OrderStatus.PROCESANDO ? OrderStatus.EN_PREPARACION : status;
    }

    private void restoreStock(Order order) {
        order.getDetalles().forEach(item -> {
            Product product = item.getProducto();
            if (product != null) {
                product.setStock(product.getStock() + item.getCantidad());
            }
        });
    }

    private void reserveStock(Order order) {
        order.getDetalles().forEach(item -> {
            Product product = item.getProducto();
            if (product == null) {
                return;
            }
            if (product.getStock() < item.getCantidad()) {
                throw new IllegalArgumentException("Stock insuficiente para reactivar " + product.getNombre());
            }
            product.setStock(product.getStock() - item.getCantidad());
        });
    }

    private String firstValue(Set<String> values) {
        return values == null || values.isEmpty() ? null : values.iterator().next();
    }

    private String valueOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
