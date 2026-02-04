package com.oddlink.repository;

import com.oddlink.entity.Noun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NounRepository extends JpaRepository<Noun, Long> {

    List<Noun> findByIsActiveTrueOrderById();
}
