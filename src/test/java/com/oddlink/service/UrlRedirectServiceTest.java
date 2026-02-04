package com.oddlink.service;

import com.oddlink.entity.UrlMapping;
import com.oddlink.repository.UrlMappingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UrlRedirectServiceTest {

    @Mock
    private UrlMappingRepository urlMappingRepository;

    private UrlRedirectService urlRedirectService;

    @BeforeEach
    void setUp() {
        urlRedirectService = new UrlRedirectService(urlMappingRepository);
    }

    @Test
    @DisplayName("存在する有効なショートコードで元URLが取得できる")
    void findOriginalUrl_whenValidShortCode_returnsOriginalUrl() {
        String shortCode = "melting-clock-whispers-to-purple-elephant";
        String originalUrl = "https://example.com";
        UrlMapping urlMapping = createUrlMapping(shortCode, originalUrl, LocalDateTime.now().plusDays(1));
        when(urlMappingRepository.findByShortCode(shortCode)).thenReturn(Optional.of(urlMapping));

        Optional<String> result = urlRedirectService.findOriginalUrl(shortCode);

        assertThat(result).isPresent();
        assertThat(result.get()).isEqualTo(originalUrl);
    }

    @Test
    @DisplayName("存在しないショートコードではEmptyが返される")
    void findOriginalUrl_whenShortCodeNotFound_returnsEmpty() {
        when(urlMappingRepository.findByShortCode("nonexistent")).thenReturn(Optional.empty());

        Optional<String> result = urlRedirectService.findOriginalUrl("nonexistent");

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("有効期限切れのショートコードではEmptyが返される")
    void findOriginalUrl_whenExpired_returnsEmpty() {
        String shortCode = "expired-code";
        UrlMapping expiredMapping = createUrlMapping(shortCode, "https://example.com", LocalDateTime.now().minusDays(1));
        when(urlMappingRepository.findByShortCode(shortCode)).thenReturn(Optional.of(expiredMapping));

        Optional<String> result = urlRedirectService.findOriginalUrl(shortCode);

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("有効なURLにアクセスするとアクセスカウントが増加する")
    void findOriginalUrl_whenValid_incrementsAccessCount() {
        String shortCode = "test-code";
        UrlMapping urlMapping = createUrlMapping(shortCode, "https://example.com", LocalDateTime.now().plusDays(1));
        urlMapping.setAccessCount(5L);
        when(urlMappingRepository.findByShortCode(shortCode)).thenReturn(Optional.of(urlMapping));

        urlRedirectService.findOriginalUrl(shortCode);

        assertThat(urlMapping.getAccessCount()).isEqualTo(6L);
        verify(urlMappingRepository).save(urlMapping);
    }

    @Test
    @DisplayName("期限切れURLではアクセスカウントは増加しない")
    void findOriginalUrl_whenExpired_doesNotIncrementAccessCount() {
        String shortCode = "expired-code";
        UrlMapping expiredMapping = createUrlMapping(shortCode, "https://example.com", LocalDateTime.now().minusDays(1));
        expiredMapping.setAccessCount(5L);
        when(urlMappingRepository.findByShortCode(shortCode)).thenReturn(Optional.of(expiredMapping));

        urlRedirectService.findOriginalUrl(shortCode);

        assertThat(expiredMapping.getAccessCount()).isEqualTo(5L);
        verify(urlMappingRepository, never()).save(any());
    }

    private UrlMapping createUrlMapping(String shortCode, String originalUrl, LocalDateTime expiresAt) {
        UrlMapping urlMapping = new UrlMapping();
        urlMapping.setShortCode(shortCode);
        urlMapping.setOriginalUrl(originalUrl);
        urlMapping.setExpiresAt(expiresAt);
        urlMapping.setAccessCount(0L);
        return urlMapping;
    }
}
