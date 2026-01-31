package com.oddlink.dto;

/**
 * エラーレスポンスを保持する
 * @param message エラーメッセージ
 */
public record ErrorResponse(String message) {
}
