package com.oddlink.service;

import com.oddlink.entity.UrlMapping;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * URL発行のビジネスロジックを担当するサービス
 */
@Service
public class UrlIssueService {

    private static final int MAX_RETRY_ATTEMPTS = 5;

    private final SurrealPhraseGenerator phraseGenerator;
    private final PhraseSequenceService phraseSequenceService;
    private final UrlMappingSaveService urlMappingSaveService;

    public UrlIssueService(
            SurrealPhraseGenerator phraseGenerator,
            PhraseSequenceService phraseSequenceService,
            UrlMappingSaveService urlMappingSaveService) {
        this.phraseGenerator = phraseGenerator;
        this.phraseSequenceService = phraseSequenceService;
        this.urlMappingSaveService = urlMappingSaveService;
    }

    /**
     * 元URLに対してユニークなフレーズを発行し、保存する
     * @param originalUrl 元のURL
     * @return 生成されたショートコード
     * @throws IllegalStateException 最大試行回数を超えてもユニークなフレーズを生成できなかった場合
     */
    public String issue(String originalUrl) {
        for (int attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
            long sequence = phraseSequenceService.getNext();
            String shortCode = phraseGenerator.generate(sequence);

            UrlMapping urlMapping = new UrlMapping();
            urlMapping.setShortCode(shortCode);
            urlMapping.setOriginalUrl(originalUrl);
            urlMapping.setExpiresAt(LocalDateTime.now().plusYears(1));

            try {
                urlMappingSaveService.save(urlMapping);
                return shortCode;
            } catch (DataIntegrityViolationException e) {
                // 衝突時は次のシーケンスで再試行（独立トランザクションなので問題なし）
            }
        }

        throw new IllegalStateException(
                "Failed to generate unique phrase after " + MAX_RETRY_ATTEMPTS + " attempts");
    }
}
