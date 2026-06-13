package com.caoxwear.backend.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record OrderRequest(
        @NotEmpty List<OrderLineRequest> items
) {
}
