package com.oddlink.service;

import com.oddlink.repository.UrlMappingRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class UrlRedirectService {

    private final UrlMappingRepository urlMappingRepository;

    public UrlRedirectService(UrlMappingRepository urlMappingRepository) {
        this.urlMappingRepository = urlMappingRepository;
    }

    /**
     * 短縮コードから元のURLを取得する
     * @param shortCode 短縮コード
     * @return 元のURL（存在しない場合または有効期限切れの場合はEmpty）
     */
    public Optional<String> findOriginalUrl(String shortCode) {
        return urlMappingRepository.findByShortCode(shortCode)
                .filter(urlMapping -> !urlMapping.isExpired())
                .map(urlMapping -> urlMapping.getOriginalUrl());
    }
}
