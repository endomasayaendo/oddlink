package com.oddlink.controller;

import com.oddlink.dto.IssueRequest;
import com.oddlink.entity.UrlMapping;
import com.oddlink.repository.UrlMappingRepository;
import com.oddlink.service.SurrealPhraseGenerator;
import org.springframework.web.bind.annotation.*;

@RestController
public class UrlIssueController {

    private final UrlMappingRepository urlMappingRepository;
    private final SurrealPhraseGenerator phraseGenerator;

    public UrlIssueController(UrlMappingRepository urlMappingRepository, SurrealPhraseGenerator phraseGenerator) {
        this.urlMappingRepository = urlMappingRepository;
        this.phraseGenerator = phraseGenerator;
    }

    /**
     * ユーザの発行リクエストを受け付け、短縮URLを発行して返却する
     * @param request リクエストボディ
     * @return 発行された短縮URL
     */
    @PostMapping("/issue")
    public String issueUrl(@RequestBody IssueRequest request) {

        String originalUrl = request.getOriginalUrl();

        // ユニークなシュールフレーズを生成
        String shortCode = phraseGenerator.generatePhrase();

        // 短縮コードと元URLの対応を保存
        UrlMapping urlMapping = new UrlMapping();
        urlMapping.setShortCode(shortCode);
        urlMapping.setOriginalUrl(originalUrl);
        urlMappingRepository.save(urlMapping);

        return "http://localhost:8080/" + shortCode;
    }
}
