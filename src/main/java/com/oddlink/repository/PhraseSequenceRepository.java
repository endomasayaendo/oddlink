package com.oddlink.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

/**
 * フレーズ生成用シーケンスのリポジトリ
 */
@Repository
public class PhraseSequenceRepository {

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * 次のシーケンス番号を取得する
     * @return シーケンス番号
     */
    public long getNext() {
        return ((Number) entityManager
                .createNativeQuery("SELECT nextval('phrase_seq')")
                .getSingleResult())
                .longValue();
    }
}
