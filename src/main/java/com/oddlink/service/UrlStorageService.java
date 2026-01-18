package com.oddlink.service;

import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class UrlStorageService {

    private final Map<String, String> urlMap = new HashMap<>();

    /**
     * 短縮コードと元URLの対応を保存する
     * @param shortCode 短縮コード
     * @param originalUrl 元のURL
     */
    public void save(String shortCode, String originalUrl) {
        urlMap.put(shortCode, originalUrl);
    }

    /**
     * 短縮コードから元のURLを取得する
     * @param shortCode 短縮コード
     * @return 元のURL（存在しない場合はnull）
     */
    public String findByShortCode(String shortCode) {
        return urlMap.get(shortCode);
    }
}
