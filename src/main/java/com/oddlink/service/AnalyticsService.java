package com.oddlink.service;

import com.oddlink.dto.AnalyticsResponse;
import com.oddlink.dto.DailyAccess;
import com.oddlink.entity.UrlMapping;
import com.oddlink.exception.ShortCodeNotFoundException;
import com.oddlink.repository.AccessLogRepository;
import com.oddlink.repository.UrlMappingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * アナリティクス情報の取得を担当するサービス
 */
@Service
public class AnalyticsService {

    private final UrlMappingRepository urlMappingRepository;
    private final AccessLogRepository accessLogRepository;

    public AnalyticsService(UrlMappingRepository urlMappingRepository,
                            AccessLogRepository accessLogRepository) {
        this.urlMappingRepository = urlMappingRepository;
        this.accessLogRepository = accessLogRepository;
    }

    /**
     * ショートコードに対するアナリティクス情報を取得する
     * @param shortCode 短縮コード
     * @return アナリティクス情報
     * @throws ShortCodeNotFoundException ショートコードが存在しない場合
     */
    @Transactional(readOnly = true)
    public AnalyticsResponse getAnalytics(String shortCode) {
        UrlMapping urlMapping = urlMappingRepository.findByShortCode(shortCode)
                .orElseThrow(() -> new ShortCodeNotFoundException(shortCode));

        List<DailyAccess> dailyAccess = accessLogRepository.findDailyAccessCounts(urlMapping.getId());

        return new AnalyticsResponse(
                urlMapping.getShortCode(),
                urlMapping.getOriginalUrl(),
                urlMapping.getAccessCount(),
                urlMapping.getCreatedAt(),
                urlMapping.getExpiresAt(),
                dailyAccess
        );
    }
}
