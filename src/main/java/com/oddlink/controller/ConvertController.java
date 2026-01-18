package com.oddlink.controller;

import com.oddlink.dto.ConvertRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/convert")
public class ConvertController {

    private  Map<String, String> urlMap = new HashMap<>();

    /**
     * ユーザの変換リクエストを受け付け、変換後URLの発行をおこない、そのURLを変換する
     * @param request
     * @return
     */
    @PostMapping("/create")
    public String createURL(@RequestBody ConvertRequest request) {

        //URLを引き取る
        String originalUrl = request.getUrl();;

        //定数のダミーURL
        String dummyUrl = "http://localhost:8080/convert/abc123";

        //元URLと変換後URLを対応させたデータをMapに格納
        urlMap.put(dummyUrl, originalUrl);

        //変換後URL(ダミーURL）を返却
        return dummyUrl;
    }

    /**
     * 変換後のURLから変換前のURLにリダイレクトさせる
     * @param shortCode
     * @return
     */
    @GetMapping("/{shortCode}")
    public ResponseEntity<Void> redirect(@PathVariable String shortCode) {
        //短縮コードから完全なダミーURLを構築
        String dummyUrl = "http://localhost:8080/convert/" + shortCode;

        //元のURLを取得
        String originalUrl = urlMap.get(dummyUrl);

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
