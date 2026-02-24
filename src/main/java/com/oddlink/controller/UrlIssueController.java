package com.oddlink.controller;

import com.oddlink.dto.IssueRequest;
import com.oddlink.dto.IssueResponse;
import com.oddlink.service.UrlIssueService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class UrlIssueController {

    private final UrlIssueService urlIssueService;

    /**
     * ベースURLをapplication.ymlから取得
     */
    @Value("${app.base-url}")
    private String baseUrl;

    public UrlIssueController(UrlIssueService urlIssueService) {
        this.urlIssueService = urlIssueService;
    }

    /**
     * ユーザの発行リクエストを受け付け、短縮URLを発行して返却する
     * @param request リクエストボディ
     * @return 発行された短縮URL
     */
    @PostMapping("/issue")
    public IssueResponse issueUrl(@Valid @RequestBody IssueRequest request) {
        String shortCode = urlIssueService.issue(request.originalUrl());
        return new IssueResponse(baseUrl + "/" + shortCode, request.originalUrl());
    }
}
