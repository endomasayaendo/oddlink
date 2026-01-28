package com.oddlink.service;

import com.oddlink.entity.UrlMapping;
import com.oddlink.repository.UrlMappingRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * URL発行のビジネスロジックを担当するサービス
 */
@Service
public class UrlIssueService {

    private final SurrealPhraseGenerator phraseGenerator;
    private final UrlMappingRepository urlMappingRepository;

    public UrlIssueService(SurrealPhraseGenerator phraseGenerator, UrlMappingRepository urlMappingRepository) {
        this.phraseGenerator = phraseGenerator;
        this.urlMappingRepository = urlMappingRepository;
    }

    /**
     * 元URLに対してユニークなフレーズを発行し、保存する
     * @param originalUrl 元のURL
     * @return 生成されたショートコード
     */
    public String issue(String originalUrl) {
        String shortCode = phraseGenerator.generatePhrase();

        UrlMapping urlMapping = new UrlMapping();
        urlMapping.setShortCode(shortCode);
        urlMapping.setOriginalUrl(originalUrl);
        urlMapping.setExpiresAt(LocalDateTime.now().plusYears(1));
        urlMappingRepository.save(urlMapping);

        return shortCode;
    }
}
