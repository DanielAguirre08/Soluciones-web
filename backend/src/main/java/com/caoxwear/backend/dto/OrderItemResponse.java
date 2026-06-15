package com.caoxwear.backend.dto;

import java.math.BigDecimal;

public record OrderItemResponse(
        Long productId,
        String sku,
        String nombre,
        String imagen,
        String categoria,
        String talla,
        String color,
        Integer cantidad,
        BigDecimal precio,
        BigDecimal subtotal) {
}
