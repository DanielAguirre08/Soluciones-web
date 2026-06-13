package com.caoxwear.backend.controller;

import com.caoxwear.backend.dto.OrderRequest;
import com.caoxwear.backend.entity.Order;
import com.caoxwear.backend.entity.OrderStatus;
import com.caoxwear.backend.repository.OrderRepository;
import com.caoxwear.backend.service.OrderService;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;
    private final OrderRepository orderRepository;

    @PostMapping
    public Order create(@Valid @RequestBody OrderRequest request, Principal principal) {
        return orderService.create(request, principal);
    }

    @GetMapping("/mine")
    public List<Order> mine(Principal principal) {
        return orderService.myOrders(principal);
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<Order> all() {
        return orderRepository.findAll();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public Order updateStatus(@PathVariable Long id, @RequestParam OrderStatus estado) {
        Order order = orderRepository.findById(id).orElseThrow();
        order.setEstado(estado);
        return orderRepository.save(order);
    }
}
