package com.oddlink.controller;

import com.oddlink.entity.UrlMapping;
import com.oddlink.repository.UrlMappingRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
public class RedirectController {

    private final UrlMappingRepository urlMappingRepository;

    public RedirectController(UrlMappingRepository urlMappingRepository) {
        this.urlMappingRepository = urlMappingRepository;
    }

    /**
     * 変換後のURLから変換前のURLにリダイレクトさせる
     * @param shortCode 短縮コード
     * @return リダイレクトレスポンス
     */
    @GetMapping("/{shortCode}")
    public ResponseEntity<Void> redirect(@PathVariable String shortCode) {

        //短縮コードから元のURLを取得
        Optional<UrlMapping> urlMapping = urlMappingRepository.findByShortCode(shortCode);

        if (urlMapping.isEmpty()) {
            //URLが見つからない場合は404を返却
            return ResponseEntity.notFound().build();
        }

        //元のURLにリダイレクト
        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(java.net.URI.create(urlMapping.get().getOriginalUrl()));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }
}
