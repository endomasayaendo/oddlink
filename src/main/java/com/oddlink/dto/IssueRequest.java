package com.oddlink.dto;

/**
 * URL発行リクエストを保持する
 * @param originalUrl 変換前のURL
 */
public record IssueRequest(String originalUrl) {
}
