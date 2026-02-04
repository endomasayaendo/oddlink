package com.oddlink.service;

import com.oddlink.entity.Adjective;
import com.oddlink.entity.Adverb;
import com.oddlink.entity.Noun;
import com.oddlink.entity.Verb;
import com.oddlink.repository.AdjectiveRepository;
import com.oddlink.repository.AdverbRepository;
import com.oddlink.repository.NounRepository;
import com.oddlink.repository.VerbRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 単語キャッシュ
 * アプリケーション起動時に単語をメモリにロードし、高速なアクセスを提供する
 */
@Component
public class WordCache {

    private final AdjectiveRepository adjectiveRepository;
    private final NounRepository nounRepository;
    private final VerbRepository verbRepository;
    private final AdverbRepository adverbRepository;

    private List<String> adjectives;
    private List<String> nouns;
    private List<String> verbs;
    private List<String> adverbs;

    public WordCache(
            AdjectiveRepository adjectiveRepository,
            NounRepository nounRepository,
            VerbRepository verbRepository,
            AdverbRepository adverbRepository) {
        this.adjectiveRepository = adjectiveRepository;
        this.nounRepository = nounRepository;
        this.verbRepository = verbRepository;
        this.adverbRepository = adverbRepository;
    }

    /**
     * 起動時に単語をロード
     */
    @PostConstruct
    public void init() {
        refresh();
    }

    /**
     * キャッシュをリフレッシュする
     * 単語追加時に呼び出す
     * @throws IllegalStateException いずれかの単語リストが空の場合
     */
    public void refresh() {
        this.adjectives = adjectiveRepository.findByIsActiveTrueOrderById()
                .stream()
                .map(Adjective::getWord)
                .toList();

        this.nouns = nounRepository.findByIsActiveTrueOrderById()
                .stream()
                .map(Noun::getWord)
                .toList();

        this.verbs = verbRepository.findByIsActiveTrueOrderById()
                .stream()
                .map(Verb::getWord)
                .toList();

        this.adverbs = adverbRepository.findByIsActiveTrueOrderById()
                .stream()
                .map(Adverb::getWord)
                .toList();

        if (adjectives.isEmpty() || nouns.isEmpty() || verbs.isEmpty() || adverbs.isEmpty()) {
            throw new IllegalStateException("Word lis" +
                    "ts cannot be empty");
        }
    }

    public List<String> getAdjectives() {
        return adjectives;
    }

    public List<String> getNouns() {
        return nouns;
    }

    public List<String> getVerbs() {
        return verbs;
    }

    public List<String> getAdverbs() {
        return adverbs;
    }
}
