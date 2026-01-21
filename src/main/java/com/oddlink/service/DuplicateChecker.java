package com.oddlink.service;

import com.oddlink.repository.UrlMappingRepository;
import org.springframework.stereotype.Service;

/**
 * 重複チェックを行うクラス
 */
@Service
public class DuplicateChecker {

    private final UrlMappingRepository urlMappingRepository;

    public DuplicateChecker(UrlMappingRepository urlMappingRepository) {
        this.urlMappingRepository = urlMappingRepository;
    }

    /**
     * フレーズが重複しているかチェックする
     * @param phrase チェック対象のフレーズ
     * @return 重複している場合はtrue
     */
    public boolean isDuplicate(String phrase) {
        return urlMappingRepository.existsByShortCode(phrase);
    }
}
