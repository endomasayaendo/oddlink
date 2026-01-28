package com.oddlink.dto;

import jakarta.validation.constraints.NotBlank;
import org.hibernate.validator.constraints.URL;

/**
 * URL発行リクエストを保持する
 * @param originalUrl 変換前のURL
 */
public record IssueRequest(
        @NotBlank(message = "URLは必須です")
        @URL(message = "有効なURL形式で入力してください")
        String originalUrl
) {
}
