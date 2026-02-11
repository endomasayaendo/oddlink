package com.oddlink.controller;

import com.oddlink.service.UrlRedirectService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

@RestController
public class RedirectController {

    private final UrlRedirectService urlRedirectService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public RedirectController(UrlRedirectService urlRedirectService) {
        this.urlRedirectService = urlRedirectService;
    }

    /**
     * 変換後のURLから変換前のURLにリダイレクトさせる
     * @param shortCode 短縮コード
     * @return リダイレクトレスポンス
     */
    @GetMapping("/{shortCode}")
    public ResponseEntity<Void> redirect(@PathVariable String shortCode) {

        return urlRedirectService.findOriginalUrl(shortCode)
                .map(originalUrl -> {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setLocation(URI.create(originalUrl));
                    return new ResponseEntity<Void>(headers, HttpStatus.FOUND);
                })
                .orElseGet(() -> {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setLocation(URI.create(frontendUrl + "/not-found"));
                    return new ResponseEntity<>(headers, HttpStatus.FOUND);
                });
    }
}
