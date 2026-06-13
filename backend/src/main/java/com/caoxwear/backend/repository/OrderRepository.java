package com.caoxwear.backend.repository;

import com.caoxwear.backend.entity.Order;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByUsuarioEmailOrderByFechaDesc(String email);
}
