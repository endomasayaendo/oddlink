package com.oddlink.controller;

import com.oddlink.service.UrlRedirectService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(RedirectController.class)
class RedirectControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UrlRedirectService urlRedirectService;

    @Test
    @DisplayName("有効なショートコードでリダイレクトされる")
    void redirect_returns302WithLocation() throws Exception {
        when(urlRedirectService.findOriginalUrl("melting-clock-whispers-to-purple-elephant"))
                .thenReturn(Optional.of("https://example.com"));

        mockMvc.perform(get("/melting-clock-whispers-to-purple-elephant"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "https://example.com"));
    }

    @Test
    @DisplayName("存在しないショートコードで404が返される")
    void redirect_returns404WhenNotFound() throws Exception {
        when(urlRedirectService.findOriginalUrl("nonexistent-code"))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/nonexistent-code"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("期限切れのショートコードで404が返される")
    void redirect_returns404WhenExpired() throws Exception {
        when(urlRedirectService.findOriginalUrl("expired-phrase-code"))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/expired-phrase-code"))
                .andExpect(status().isNotFound());
    }
}
