package com.caoxwear.backend.dto;

import com.caoxwear.backend.entity.Role;

public record AuthResponse(
        String token,
        Long id,
        String nombres,
        String email,
        Role rol
) {
}
