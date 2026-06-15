package com.caoxwear.backend.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record OrderRequest(
        @NotEmpty List<OrderLineRequest> items,
        String nombres,
        String apellidos,
        String email,
        String telefono,
        String direccion,
        String referencia,
        String departamento,
        String provincia,
        String distrito
) {
}
