package com.oddlink.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class UrlMappingTest {

    @Test
    @DisplayName("有効期限がnullの場合は期限切れではない")
    void isExpired_whenExpiresAtIsNull_returnsFalse() {
        UrlMapping urlMapping = new UrlMapping();
        urlMapping.setExpiresAt(null);

        assertThat(urlMapping.isExpired()).isFalse();
    }

    @Test
    @DisplayName("有効期限が未来の場合は期限切れではない")
    void isExpired_whenExpiresAtIsFuture_returnsFalse() {
        UrlMapping urlMapping = new UrlMapping();
        urlMapping.setExpiresAt(LocalDateTime.now().plusDays(1));

        assertThat(urlMapping.isExpired()).isFalse();
    }

    @Test
    @DisplayName("有効期限が過去の場合は期限切れ")
    void isExpired_whenExpiresAtIsPast_returnsTrue() {
        UrlMapping urlMapping = new UrlMapping();
        urlMapping.setExpiresAt(LocalDateTime.now().minusDays(1));

        assertThat(urlMapping.isExpired()).isTrue();
    }

    @Test
    @DisplayName("アクセスカウントが正しく増加する")
    void incrementAccessCount_incrementsByOne() {
        UrlMapping urlMapping = new UrlMapping();
        assertThat(urlMapping.getAccessCount()).isEqualTo(0L);

        urlMapping.incrementAccessCount();
        assertThat(urlMapping.getAccessCount()).isEqualTo(1L);

        urlMapping.incrementAccessCount();
        assertThat(urlMapping.getAccessCount()).isEqualTo(2L);
    }
}
