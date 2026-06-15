package com.caoxwear.backend.dto;

import com.caoxwear.backend.entity.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record AdminOrderResponse(
        Long id,
        LocalDateTime fecha,
        BigDecimal total,
        OrderStatus estado,
        Long usuarioId,
        String cliente,
        String email,
        String telefono,
        String direccion,
        String referencia,
        String departamento,
        String provincia,
        String distrito,
        List<OrderItemResponse> detalles) {
}
