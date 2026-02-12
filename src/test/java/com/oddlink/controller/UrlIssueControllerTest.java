package com.oddlink.controller;

import com.oddlink.service.UrlIssueService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UrlIssueController.class)
class UrlIssueControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UrlIssueService urlIssueService;

    @Test
    @DisplayName("正常なURLで発行するとショートURLがJSON形式で返される")
    void issueUrl_returnsJsonResponse() throws Exception {
        when(urlIssueService.issue("https://example.com"))
                .thenReturn("melting-clock-whispers-to-purple-elephant");

        mockMvc.perform(post("/api/issue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"originalUrl\": \"https://example.com\"}"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.shortUrl").value("http://localhost:8080/melting-clock-whispers-to-purple-elephant"));
    }

    @Test
    @DisplayName("URLが空の場合はバリデーションエラーが返される")
    void issueUrl_returnsBadRequestWhenUrlIsBlank() throws Exception {
        mockMvc.perform(post("/api/issue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"originalUrl\": \"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    @DisplayName("不正なURL形式の場合はバリデーションエラーが返される")
    void issueUrl_returnsBadRequestWhenUrlIsInvalid() throws Exception {
        mockMvc.perform(post("/api/issue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"originalUrl\": \"not-a-url\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    @DisplayName("リクエストボディが空の場合は400が返される")
    void issueUrl_returnsBadRequestWhenBodyIsEmpty() throws Exception {
        mockMvc.perform(post("/api/issue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("サービスがIllegalStateExceptionを投げた場合は503が返される")
    void issueUrl_returns503WhenServiceFails() throws Exception {
        when(urlIssueService.issue("https://example.com"))
                .thenThrow(new IllegalStateException("Failed to generate unique phrase"));

        mockMvc.perform(post("/api/issue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"originalUrl\": \"https://example.com\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("サービスが一時的に利用できません"));
    }
}
