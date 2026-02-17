package com.oddlink.dto;

import java.time.LocalDateTime;
import java.util.List;

public record AnalyticsResponse(
        String shortCode,
        String shortUrl,
        String originalUrl,
        long totalAccessCount,
        LocalDateTime createdAt,
        LocalDateTime expiresAt,
        List<DailyAccess> dailyAccess
) {
}
