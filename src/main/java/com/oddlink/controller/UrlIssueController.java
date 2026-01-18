package com.oddlink.controller;

import com.oddlink.dto.IssueRequest;
import com.oddlink.service.UrlStorageService;
import org.springframework.web.bind.annotation.*;

@RestController
public class UrlIssueController {

    private final UrlStorageService urlStorageService;

    public UrlIssueController(UrlStorageService urlStorageService) {
        this.urlStorageService = urlStorageService;
    }

    /**
     * ユーザの発行リクエストを受け付け、短縮URLを発行して返却する
     * @param request
     * @return
     */
    @PostMapping("/issue")
    public String issueUrl(@RequestBody IssueRequest request) {

        //URLを引き取る
        String originalUrl = request.getOriginalUrl();

        //定数のダミー短縮コード
        String shortCode = "abc123";

        //短縮コードと元URLの対応を保存
        urlStorageService.save(shortCode, originalUrl);

        //発行したURLを返却
        return "http://localhost:8080/" + shortCode;
    }
}
