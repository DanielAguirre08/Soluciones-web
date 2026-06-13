package com.caoxwear.backend.dto;

import com.caoxwear.backend.entity.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record RegisterRequest(
        @NotBlank String nombres,
        @NotBlank String apellidos,
        @Email String email,
        @NotBlank String password,
        Role rol
) {
}
