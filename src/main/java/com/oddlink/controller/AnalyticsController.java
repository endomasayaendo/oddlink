package com.oddlink.controller;

import com.oddlink.dto.AnalyticsResponse;
import com.oddlink.service.AnalyticsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * アナリティクス情報を返却するコントローラー
 */
@RestController
@RequestMapping("/api")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    @Value("${app.base-url}")
    private String baseUrl;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    /**
     * ショートコードのアクセス統計を取得する
     * @param shortCode 短縮コード
     * @return アナリティクス情報
     */
    @GetMapping("/analytics/{shortCode}")
    public AnalyticsResponse getAnalytics(@PathVariable String shortCode) {
        return analyticsService.getAnalytics(shortCode, baseUrl);
    }
}
