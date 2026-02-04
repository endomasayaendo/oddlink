package com.oddlink.repository;

import com.oddlink.entity.WordType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface WordTypeRepository extends JpaRepository<WordType, Long> {

    Optional<WordType> findByName(String name);
}
