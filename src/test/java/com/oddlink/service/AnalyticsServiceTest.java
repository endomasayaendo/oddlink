package com.oddlink.service;

import com.oddlink.dto.AnalyticsResponse;
import com.oddlink.dto.DailyAccess;
import com.oddlink.entity.UrlMapping;
import com.oddlink.exception.ShortCodeNotFoundException;
import com.oddlink.repository.AccessLogRepository;
import com.oddlink.repository.UrlMappingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnalyticsServiceTest {

    @Mock
    private UrlMappingRepository urlMappingRepository;

    @Mock
    private AccessLogRepository accessLogRepository;

    private AnalyticsService analyticsService;

    @BeforeEach
    void setUp() {
        analyticsService = new AnalyticsService(urlMappingRepository, accessLogRepository);
    }

    @Test
    @DisplayName("正常系: UrlMappingと日別データからAnalyticsResponseが構築される")
    void getAnalytics_returnsAnalyticsResponse() {
        String shortCode = "melting-clock-whispers-to-purple-elephant";
        UrlMapping urlMapping = createUrlMapping(shortCode, "https://example.com",
                LocalDateTime.of(2025, 1, 1, 0, 0),
                LocalDateTime.of(2026, 1, 1, 0, 0),
                10L);

        List<DailyAccess> dailyData = List.of(
                new DailyAccess(LocalDate.of(2025, 1, 1), 5L),
                new DailyAccess(LocalDate.of(2025, 1, 2), 3L),
                new DailyAccess(LocalDate.of(2025, 1, 3), 2L)
        );

        when(urlMappingRepository.findByShortCode(shortCode)).thenReturn(Optional.of(urlMapping));
        when(accessLogRepository.findDailyAccessCounts(urlMapping.getId())).thenReturn(dailyData);

        AnalyticsResponse response = analyticsService.getAnalytics(shortCode);

        assertThat(response.shortCode()).isEqualTo(shortCode);
        assertThat(response.originalUrl()).isEqualTo("https://example.com");
        assertThat(response.totalAccessCount()).isEqualTo(10L);
        assertThat(response.createdAt()).isEqualTo(LocalDateTime.of(2025, 1, 1, 0, 0));
        assertThat(response.expiresAt()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
        assertThat(response.dailyAccess()).hasSize(3);
        assertThat(response.dailyAccess().get(0).date()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(response.dailyAccess().get(0).count()).isEqualTo(5L);
    }

    @Test
    @DisplayName("正常系: 日別データが空でも正常に返される")
    void getAnalytics_withNoDailyData_returnsEmptyList() {
        String shortCode = "test-code";
        UrlMapping urlMapping = createUrlMapping(shortCode, "https://example.com",
                LocalDateTime.of(2025, 1, 1, 0, 0),
                LocalDateTime.of(2026, 1, 1, 0, 0),
                0L);

        when(urlMappingRepository.findByShortCode(shortCode)).thenReturn(Optional.of(urlMapping));
        when(accessLogRepository.findDailyAccessCounts(urlMapping.getId())).thenReturn(List.of());

        AnalyticsResponse response = analyticsService.getAnalytics(shortCode);

        assertThat(response.dailyAccess()).isEmpty();
        assertThat(response.totalAccessCount()).isEqualTo(0L);
    }

    @Test
    @DisplayName("異常系: 存在しないshortCodeで例外が発生する")
    void getAnalytics_whenShortCodeNotFound_throwsException() {
        when(urlMappingRepository.findByShortCode("nonexistent")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> analyticsService.getAnalytics("nonexistent"))
                .isInstanceOf(ShortCodeNotFoundException.class)
                .hasMessageContaining("nonexistent");
    }

    private UrlMapping createUrlMapping(String shortCode, String originalUrl,
                                        LocalDateTime createdAt, LocalDateTime expiresAt,
                                        long accessCount) {
        UrlMapping urlMapping = new UrlMapping();
        urlMapping.setId(1L);
        urlMapping.setShortCode(shortCode);
        urlMapping.setOriginalUrl(originalUrl);
        urlMapping.setCreatedAt(createdAt);
        urlMapping.setExpiresAt(expiresAt);
        urlMapping.setAccessCount(accessCount);
        return urlMapping;
    }
}
