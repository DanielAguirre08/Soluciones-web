package com.caoxwear.backend.service;

import com.caoxwear.backend.dto.OrderRequest;
import com.caoxwear.backend.entity.Order;
import com.caoxwear.backend.entity.OrderItem;
import com.caoxwear.backend.entity.Product;
import com.caoxwear.backend.entity.User;
import com.caoxwear.backend.repository.OrderRepository;
import com.caoxwear.backend.repository.ProductRepository;
import com.caoxwear.backend.repository.UserRepository;
import java.math.BigDecimal;
import java.security.Principal;
import java.util.List;
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
}
