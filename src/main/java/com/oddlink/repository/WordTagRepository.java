package com.oddlink.repository;

import com.oddlink.entity.WordTag;
import com.oddlink.entity.WordType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordTagRepository extends JpaRepository<WordTag, WordTag.WordTagId> {

    List<WordTag> findByWordTypeAndWordId(WordType wordType, Long wordId);

    List<WordTag> findByWordType(WordType wordType);
}
