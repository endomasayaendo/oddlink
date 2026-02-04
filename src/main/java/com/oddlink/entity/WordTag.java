package com.oddlink.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.LocalDateTime;

@Entity
@Table(name = "word_tags")
@Getter
@Setter
@NoArgsConstructor
@IdClass(WordTag.WordTagId.class)
public class WordTag {

    @Id
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "word_type_id", nullable = false)
    private WordType wordType;

    @Id
    @Column(name = "word_id", nullable = false)
    private Long wordId;

    @Id
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tag_id", nullable = false)
    private Tag tag;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public WordTag(WordType wordType, Long wordId, Tag tag) {
        this.wordType = wordType;
        this.wordId = wordId;
        this.tag = tag;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class WordTagId implements Serializable {
        private Long wordType;
        private Long wordId;
        private Long tag;

        public WordTagId(Long wordType, Long wordId, Long tag) {
            this.wordType = wordType;
            this.wordId = wordId;
            this.tag = tag;
        }
    }
}
