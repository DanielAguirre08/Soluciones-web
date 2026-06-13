package com.caoxwear.backend.service;

import com.caoxwear.backend.entity.Category;
import com.caoxwear.backend.entity.Product;
import com.caoxwear.backend.repository.CategoryRepository;
import com.caoxwear.backend.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ProductService {
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public Page<Product> list(String search, Pageable pageable) {
        if (search == null || search.isBlank()) {
            return productRepository.findAll(pageable);
        }
        return productRepository.findByNombreContainingIgnoreCase(search, pageable);
    }

    public Product get(Long id) {
        return productRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
    }

    public Product save(Product product) {
        Long categoryId = product.getCategoria().getId();
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException("Categoria no encontrada"));
        product.setCategoria(category);
        return productRepository.save(product);
    }

    public Product update(Long id, Product product) {
        product.setId(id);
        return save(product);
    }

    public void delete(Long id) {
        productRepository.deleteById(id);
    }
}
