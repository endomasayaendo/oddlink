package com.oddlink.controller;

import com.oddlink.dto.IssueRequest;
import com.oddlink.service.UrlIssueService;
import org.springframework.web.bind.annotation.*;

@RestController
public class UrlIssueController {

    private final UrlIssueService urlIssueService;

    public UrlIssueController(UrlIssueService urlIssueService) {
        this.urlIssueService = urlIssueService;
    }

    /**
     * ユーザの発行リクエストを受け付け、短縮URLを発行して返却する
     * @param request リクエストボディ
     * @return 発行された短縮URL
     */
    @PostMapping("/issue")
    public String issueUrl(@RequestBody IssueRequest request) {
        String shortCode = urlIssueService.issue(request.originalUrl());
        return "http://localhost:8080/" + shortCode;
    }
}
