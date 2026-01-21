package com.oddlink.controller;

import com.oddlink.dto.IssueRequest;
import com.oddlink.service.SurrealPhraseGenerator;
import com.oddlink.service.UrlStorageService;
import org.springframework.web.bind.annotation.*;

@RestController
public class UrlIssueController {

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
        String shortCode = phraseGenerator.generatePhrase();

        // 短縮コードと元URLの対応を保存
        urlStorageService.save(shortCode, originalUrl);

        return "http://localhost:8080/" + shortCode;
    }
}
