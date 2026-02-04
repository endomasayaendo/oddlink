package com.oddlink.service;

import com.oddlink.repository.PhraseSequenceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * フレーズ生成用のシーケンス番号を取得するサービス
 */
@Service
public class PhraseSequenceService {

    private final PhraseSequenceRepository phraseSequenceRepository;

    public PhraseSequenceService(PhraseSequenceRepository phraseSequenceRepository) {
        this.phraseSequenceRepository = phraseSequenceRepository;
    }

    /**
     * 次のシーケンス番号を取得する
     * @return シーケンス番号
     */
    @Transactional
    public long getNext() {
        return phraseSequenceRepository.getNext();
    }
}
