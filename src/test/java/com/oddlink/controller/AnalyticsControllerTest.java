package com.oddlink.controller;

import com.oddlink.dto.AnalyticsResponse;
import com.oddlink.dto.DailyAccess;
import com.oddlink.exception.ShortCodeNotFoundException;
import com.oddlink.service.AnalyticsService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AnalyticsController.class)
class AnalyticsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AnalyticsService analyticsService;

    @Test
    @DisplayName("正常なshortCodeでアナリティクスがJSON形式で返される")
    void getAnalytics_returnsJsonResponse() throws Exception {
        String shortCode = "melting-clock-whispers-to-purple-elephant";
        AnalyticsResponse response = new AnalyticsResponse(
                shortCode,
                "https://example.com",
                10L,
                LocalDateTime.of(2025, 1, 1, 0, 0),
                LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(
                        new DailyAccess(LocalDate.of(2025, 1, 1), 5),
                        new DailyAccess(LocalDate.of(2025, 1, 2), 3)
                )
        );

        when(analyticsService.getAnalytics(shortCode)).thenReturn(response);

        mockMvc.perform(get("/api/analytics/" + shortCode))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/json"))
                .andExpect(jsonPath("$.shortCode").value(shortCode))
                .andExpect(jsonPath("$.originalUrl").value("https://example.com"))
                .andExpect(jsonPath("$.totalAccessCount").value(10))
                .andExpect(jsonPath("$.dailyAccess").isArray())
                .andExpect(jsonPath("$.dailyAccess.length()").value(2))
                .andExpect(jsonPath("$.dailyAccess[0].date").value("2025-01-01"))
                .andExpect(jsonPath("$.dailyAccess[0].count").value(5));
    }

    @Test
    @DisplayName("存在しないshortCodeで404が返される")
    void getAnalytics_returns404WhenNotFound() throws Exception {
        when(analyticsService.getAnalytics("nonexistent"))
                .thenThrow(new ShortCodeNotFoundException("nonexistent"));

        mockMvc.perform(get("/api/analytics/nonexistent"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Short code not found"));
    }
}
