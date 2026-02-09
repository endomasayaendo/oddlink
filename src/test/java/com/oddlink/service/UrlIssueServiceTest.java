package com.oddlink.service;

import com.oddlink.entity.UrlMapping;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UrlIssueServiceTest {

    @Mock
    private SurrealPhraseGenerator phraseGenerator;

    @Mock
    private UrlMappingSaveService urlMappingSaveService;

    @Captor
    private ArgumentCaptor<UrlMapping> urlMappingCaptor;

    private UrlIssueService urlIssueService;

    @BeforeEach
    void setUp() {
        urlIssueService = new UrlIssueService(phraseGenerator, urlMappingSaveService);
    }

    @Test
    @DisplayName("URLを発行すると、ショートコードが返される")
    void issue_returnsShortCode() {
        String expectedShortCode = "melting-clock-whispers-to-purple-elephant";
        when(phraseGenerator.generate()).thenReturn(expectedShortCode);

        String result = urlIssueService.issue("https://example.com");

        assertThat(result).isEqualTo(expectedShortCode);
    }

    @Test
    @DisplayName("URLを発行すると、正しいマッピングが保存される")
    void issue_savesCorrectMapping() {
        String shortCode = "melting-clock-whispers-to-purple-elephant";
        String originalUrl = "https://example.com";
        when(phraseGenerator.generate()).thenReturn(shortCode);

        urlIssueService.issue(originalUrl);

        verify(urlMappingSaveService).save(urlMappingCaptor.capture());
        UrlMapping saved = urlMappingCaptor.getValue();

        assertThat(saved.getShortCode()).isEqualTo(shortCode);
        assertThat(saved.getOriginalUrl()).isEqualTo(originalUrl);
    }

    @Test
    @DisplayName("発行されたURLの有効期限は約1年後に設定される")
    void issue_setsExpirationToOneYear() {
        when(phraseGenerator.generate()).thenReturn("test-phrase-with-to-words");
        LocalDateTime beforeIssue = LocalDateTime.now();

        urlIssueService.issue("https://example.com");

        verify(urlMappingSaveService).save(urlMappingCaptor.capture());
        UrlMapping saved = urlMappingCaptor.getValue();

        LocalDateTime expectedExpiration = beforeIssue.plusYears(1);
        assertThat(saved.getExpiresAt()).isAfterOrEqualTo(expectedExpiration.minusSeconds(1));
        assertThat(saved.getExpiresAt()).isBeforeOrEqualTo(expectedExpiration.plusSeconds(1));
    }

    @Test
    @DisplayName("重複がある場合はリトライして別のフレーズを使用する")
    void issue_retriesOnDuplicate() {
        String duplicatePhrase = "duplicate-phrase-with-to-noun";
        String uniquePhrase = "unique-phrase-with-to-noun";
        when(phraseGenerator.generate())
                .thenReturn(duplicatePhrase)
                .thenReturn(uniquePhrase);
        when(urlMappingSaveService.save(any(UrlMapping.class)))
                .thenThrow(new DataIntegrityViolationException("Duplicate key"))
                .thenReturn(new UrlMapping());

        String result = urlIssueService.issue("https://example.com");

        assertThat(result).isEqualTo(uniquePhrase);
        verify(phraseGenerator, times(2)).generate();
    }

    @Test
    @DisplayName("最大試行回数を超えた場合は例外がスローされる")
    void issue_throwsExceptionWhenMaxAttemptsExceeded() {
        when(phraseGenerator.generate()).thenReturn("always-duplicate-phrase");
        when(urlMappingSaveService.save(any(UrlMapping.class)))
                .thenThrow(new DataIntegrityViolationException("Duplicate key"));

        assertThatThrownBy(() -> urlIssueService.issue("https://example.com"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Failed to generate unique phrase");

        verify(phraseGenerator, times(5)).generate();
    }
}
