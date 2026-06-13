package com.caoxwear.backend.controller;

import com.caoxwear.backend.dto.AdminOrderResponse;
import com.caoxwear.backend.entity.Order;
import com.caoxwear.backend.entity.User;
import com.caoxwear.backend.repository.BannerRepository;
import com.caoxwear.backend.repository.CategoryRepository;
import com.caoxwear.backend.repository.OrderRepository;
import com.caoxwear.backend.repository.ProductRepository;
import com.caoxwear.backend.repository.UserRepository;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
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
    public Map<String, Long> dashboard() {
        return Map.of(
                "usuarios", userRepository.count(),
                "productos", productRepository.count(),
                "categorias", categoryRepository.count(),
                "pedidos", orderRepository.count(),
                "banners", bannerRepository.count());
    }

    @GetMapping("/users")
    public List<User> users() {
        return userRepository.findAll();
    }

    @GetMapping("/orders")
    public List<AdminOrderResponse> orders() {
        return orderRepository.findAll(Sort.by(Sort.Direction.DESC, "fecha")).stream()
                .map(this::toAdminOrderResponse)
                .toList();
    }

    private AdminOrderResponse toAdminOrderResponse(Order order) {
        User user = order.getUsuario();
        String fullName = ((user.getNombres() == null ? "" : user.getNombres()) + " "
                + (user.getApellidos() == null ? "" : user.getApellidos())).trim();
        return new AdminOrderResponse(
                order.getId(),
                order.getFecha(),
                order.getTotal(),
                order.getEstado(),
                user.getId(),
                fullName.isBlank() ? user.getEmail() : fullName,
                user.getEmail());
    }
}
