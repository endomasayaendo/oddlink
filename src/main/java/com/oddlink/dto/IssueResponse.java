package com.oddlink.dto;

/**
 * URL発行レスポンスを保持する
 * @param shortUrl 短縮URL
 * @param originalUrl 変換前のURL
 */
public record IssueResponse(String shortUrl, String originalUrl) {
}
