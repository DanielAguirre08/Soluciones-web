package com.caoxwear.backend.repository;

import com.caoxwear.backend.entity.Banner;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BannerRepository extends JpaRepository<Banner, Long> {
    List<Banner> findAllByOrderByOrdenAscIdAsc();

    List<Banner> findByActivoTrueOrderByOrdenAscIdAsc();
}
