package com.oddlink.service;

import com.oddlink.entity.UrlMapping;
import com.oddlink.repository.UrlMappingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * UrlMappingの保存を独立したトランザクションで行うサービス
 */
@Service
public class UrlMappingSaveService {

    private final UrlMappingRepository urlMappingRepository;

    public UrlMappingSaveService(UrlMappingRepository urlMappingRepository) {
        this.urlMappingRepository = urlMappingRepository;
    }

    /**
     * 新しいトランザクションでUrlMappingを保存する
     * @param urlMapping 保存するエンティティ
     * @return 保存されたエンティティ
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public UrlMapping save(UrlMapping urlMapping) {
        return urlMappingRepository.save(urlMapping);
    }
}
