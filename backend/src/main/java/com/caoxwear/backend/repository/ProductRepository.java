package com.caoxwear.backend.repository;

import com.caoxwear.backend.entity.Product;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {
    Page<Product> findByNombreContainingIgnoreCase(String nombre, Pageable pageable);

    Optional<Product> findBySku(String sku);

    long countByCategoriaNombre(String nombre);
}
