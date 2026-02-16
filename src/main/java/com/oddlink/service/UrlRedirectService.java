package com.oddlink.service;

import com.oddlink.entity.AccessLog;
import com.oddlink.repository.AccessLogRepository;
import com.oddlink.repository.UrlMappingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class UrlRedirectService {

    private final UrlMappingRepository urlMappingRepository;
    private final AccessLogRepository accessLogRepository;

    public UrlRedirectService(UrlMappingRepository urlMappingRepository,
                              AccessLogRepository accessLogRepository) {
        this.urlMappingRepository = urlMappingRepository;
        this.accessLogRepository = accessLogRepository;
    }

    /**
     * 短縮コードから元のURLを取得する
     * @param shortCode 短縮コード
     * @return 元のURL（存在しない場合または有効期限切れの場合はEmpty）
     */
    @Transactional
    public Optional<String> findOriginalUrl(String shortCode) {
        return urlMappingRepository.findByShortCode(shortCode)
                .filter(urlMapping -> !urlMapping.isExpired())
                .map(urlMapping -> {
                    urlMapping.incrementAccessCount();
                    urlMappingRepository.save(urlMapping);

                    AccessLog log = new AccessLog();
                    log.setUrlMapping(urlMapping);
                    accessLogRepository.save(log);

                    return urlMapping.getOriginalUrl();
                });
    }
}
