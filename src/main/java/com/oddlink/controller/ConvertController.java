package com.oddlink.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/convert")
public class ConvertController {

    @PostMapping("/create")
    public String create(@RequestBody String url) {

        //URLを引き取る

        //変換後URLの作成

        //元URLと変換後URLを対応させたデータをDBに格納

        //変換後URLを返却
        
        return "";
    }
}
