package com.oddlink.controller;

import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/convert")
public class ConvertController {

    private  Map<String, String> urlMap = new HashMap<>();

    @PostMapping("/create")
    public String createURL(@RequestBody String url) {

        //URLを引き取る
        String originalUrl = url;

        //定数のダミーURL
        String dummyUrl = "http://oddlink.com/abc123";

        //元URLと変換後URLを対応させたデータをMapに格納
        urlMap.put(dummyUrl, originalUrl);

        //変換後URL(ダミーURL）を返却
        return dummyUrl;
    }
}
