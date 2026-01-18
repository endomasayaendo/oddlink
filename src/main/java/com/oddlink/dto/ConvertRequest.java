package com.oddlink.dto;

import lombok.Data;

/**
 * URL変換リクエストを保持する
 */
@Data
public class ConvertRequest {

    //変換前のURL
    private String url;
}
