package com.oddlink.repository;

import com.oddlink.entity.Adjective;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AdjectiveRepository extends JpaRepository<Adjective, Long> {

    List<Adjective> findByIsActiveTrueOrderById();
}
