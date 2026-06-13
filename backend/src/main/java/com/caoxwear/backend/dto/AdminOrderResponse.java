package com.caoxwear.backend.dto;

import com.caoxwear.backend.entity.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record AdminOrderResponse(
        Long id,
        LocalDateTime fecha,
        BigDecimal total,
        OrderStatus estado,
        Long usuarioId,
        String cliente,
        String email) {
}
