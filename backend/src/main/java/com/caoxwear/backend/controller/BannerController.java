package com.caoxwear.backend.controller;

import com.caoxwear.backend.entity.Banner;
import com.caoxwear.backend.repository.BannerRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/banners")
@RequiredArgsConstructor
public class BannerController {
    private final BannerRepository bannerRepository;

    @GetMapping
    public List<Banner> active() {
        return bannerRepository.findByActivoTrueOrderByOrdenAscIdAsc();
    }

    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<Banner> all() {
        return bannerRepository.findAllByOrderByOrdenAscIdAsc();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public Banner create(@RequestBody Banner banner) {
        return bannerRepository.save(banner);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public Banner update(@PathVariable Long id, @RequestBody Banner banner) {
        banner.setId(id);
        return bannerRepository.save(banner);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public void delete(@PathVariable Long id) {
        bannerRepository.deleteById(id);
    }
}
