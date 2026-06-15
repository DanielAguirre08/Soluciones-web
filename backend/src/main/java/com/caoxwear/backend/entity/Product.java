package com.caoxwear.backend.entity;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "productos")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String sku;
    private String nombre;
    private String descripcion;
    private BigDecimal precio;
    private Integer stock;
    private Boolean nuevo = false;

    @Lob
    private String imagen;

    @ManyToOne(optional = false)
    private Category categoria;

    @ElementCollection(fetch = FetchType.EAGER)
    private Set<String> tallas = new LinkedHashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    private Set<String> colores = new LinkedHashSet<>();
}
