package com.oddlink.service;

import org.springframework.stereotype.Service;

@Service
public class DuplicateChecker {

    private final UrlStorageService urlStorageService;

    public DuplicateChecker(UrlStorageService urlStorageService) {
        this.urlStorageService = urlStorageService;
    }

    /**
     * フレーズが重複しているかチェックする
     * @param phrase チェック対象のフレーズ
     * @return 重複している場合はtrue
     */
    public boolean isDuplicate(String phrase) {
        return urlStorageService.exists(phrase);
    }
}
