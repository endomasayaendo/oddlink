package com.oddlink.controller;

import com.oddlink.dto.IssueRequest;
import com.oddlink.service.SurrealPhraseGenerator;
import com.oddlink.service.UrlStorageService;
import org.springframework.web.bind.annotation.*;

@RestController
public class UrlIssueController {

    private static final int MAX_GENERATION_ATTEMPTS = 10;

    private final UrlStorageService urlStorageService;
    private final SurrealPhraseGenerator phraseGenerator;

    public UrlIssueController(UrlStorageService urlStorageService, SurrealPhraseGenerator phraseGenerator) {
        this.urlStorageService = urlStorageService;
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
        String shortCode = generateUniquePhrase();

        // 短縮コードと元URLの対応を保存
        urlStorageService.save(shortCode, originalUrl);

        return "http://localhost:8080/" + shortCode;
    }

    /**
     * 重複しないシュールフレーズを生成する
     * @return ユニークなフレーズ
     */
    private String generateUniquePhrase() {
        for (int i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
            String phrase = phraseGenerator.generate();
            if (!urlStorageService.exists(phrase)) {
                return phrase;
            }
        }
        throw new RuntimeException("Failed to generate unique phrase after " + MAX_GENERATION_ATTEMPTS + " attempts");
    }
}
