package com.oddlink.dto;

import lombok.Data;

/**
 * URL発行リクエストを保持する
 */
@Data
public class IssueRequest {

    //変換前のURL
    private String originalUrl;
}
