package com.oddlink.dto;

import jakarta.validation.constraints.NotBlank;
import org.hibernate.validator.constraints.URL;

/**
 * URL発行リクエストを保持する
 * @param originalUrl 変換前のURL
 */
public record IssueRequest(
        @NotBlank(message = "URL is required")
        @URL(message = "Must be a valid URL")
        String originalUrl
) {
}
