package com.oddlink.repository;

import com.oddlink.entity.Verb;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VerbRepository extends JpaRepository<Verb, Long> {

    List<Verb> findByIsActiveTrueOrderById();
}
