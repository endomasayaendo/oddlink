package com.oddlink.controller;

import com.oddlink.service.UrlStorageService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class RedirectController {

    private final UrlStorageService urlStorageService;

    public RedirectController(UrlStorageService urlStorageService) {
        this.urlStorageService = urlStorageService;
    }

    /**
     * 変換後のURLから変換前のURLにリダイレクトさせる
     * @param shortCode 短縮コード
     * @return リダイレクトレスポンス
     */
    @GetMapping("/{shortCode}")
    public ResponseEntity<Void> redirect(@PathVariable String shortCode) {

        //短縮コードから元のURLを取得
        String originalUrl = urlStorageService.findByShortCode(shortCode);

        if (originalUrl == null) {
            //URLが見つからない場合は404を返却
            return ResponseEntity.notFound().build();
        }

        //元のURLにリダイレクト
        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(java.net.URI.create(originalUrl));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }
}
