package com.caoxwear.backend.service;

import com.caoxwear.backend.entity.Category;
import com.caoxwear.backend.entity.Product;
import com.caoxwear.backend.repository.CategoryRepository;
import com.caoxwear.backend.repository.ProductRepository;
import java.math.BigDecimal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ProductService {
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public Page<Product> list(String search, String category, String size, String color, Double maxPrice,
            boolean stockOnly, boolean nuevoOnly, Pageable pageable) {
        List<Product> filtered = productRepository.findAll().stream()
                .filter(product -> matchesSearch(product, search))
                .filter(product -> isBlank(category) || "Todas".equalsIgnoreCase(category)
                        || product.getCategoria().getNombre().equalsIgnoreCase(category))
                .filter(product -> isBlank(size) || "Todas".equalsIgnoreCase(size) || product.getTallas().contains(size))
                .filter(product -> isBlank(color) || "Todos".equalsIgnoreCase(color)
                        || product.getColores().stream().anyMatch(item -> item.equalsIgnoreCase(color)))
                .filter(product -> maxPrice == null
                        || product.getPrecio().compareTo(BigDecimal.valueOf(maxPrice)) <= 0)
                .filter(product -> !stockOnly || (product.getStock() != null && product.getStock() > 0))
                .filter(product -> !nuevoOnly || Boolean.TRUE.equals(product.getNuevo()))
                .toList();
        int start = Math.min((int) pageable.getOffset(), filtered.size());
        int end = Math.min(start + pageable.getPageSize(), filtered.size());
        return new PageImpl<>(filtered.subList(start, end), pageable, filtered.size());
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

    private boolean matchesSearch(Product product, String search) {
        if (isBlank(search)) {
            return true;
        }
        String query = search.toLowerCase();
        return contains(product.getNombre(), query)
                || contains(product.getDescripcion(), query)
                || contains(product.getSku(), query)
                || contains(product.getCategoria().getNombre(), query);
    }

    private boolean contains(String value, String query) {
        return value != null && value.toLowerCase().contains(query);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
