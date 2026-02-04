package com.oddlink.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Random;

/**
 * シュールな英語フレーズを生成するクラス
 * シーケンス番号とソルトを使って決定的にフレーズを生成する
 */
@Component
public class SurrealPhraseGenerator {

    private static final int PATTERN_COUNT = 6;

    private final WordCache wordCache;
    private final long salt;

    public SurrealPhraseGenerator(
            WordCache wordCache,
            @Value("${phrase.security.salt}") long salt) {
        this.wordCache = wordCache;
        this.salt = salt;
    }

    /**
     * シーケンス番号からフレーズを生成する
     * @param sequence シーケンス番号
     * @return ハイフン区切りのフレーズ（URL用）
     */
    public String generate(long sequence) {
        Random random = new Random(sequence ^ salt);

        int patternIndex = random.nextInt(PATTERN_COUNT);

        return switch (patternIndex) {
            case 0 -> patternA(random);
            case 1 -> patternB(random);
            case 2 -> patternC(random);
            case 3 -> patternD(random);
            case 4 -> patternE(random);
            case 5 -> patternF(random);
            default -> patternA(random);
        };
    }

    /**
     * パターンA: [adj]-[noun]-[verb]-to-[adj]-[noun]
     * 例: golden-clock-whispers-to-silent-butterfly
     */
    private String patternA(Random random) {
        return String.format("%s-%s-%s-to-%s-%s",
                randomAdjective(random),
                randomNoun(random),
                randomVerb(random),
                randomAdjective(random),
                randomNoun(random));
    }

    /**
     * パターンB: [noun]-of-[adj]-[noun]-[verb]
     * 例: echo-of-forgotten-piano-fades
     */
    private String patternB(Random random) {
        return String.format("%s-of-%s-%s-%s",
                randomNoun(random),
                randomAdjective(random),
                randomNoun(random),
                randomVerb(random));
    }

    /**
     * パターンC: [adj]-[noun]-[verb]-with-[adj]-[noun]
     * 例: floating-whale-dances-with-broken-mirror
     */
    private String patternC(Random random) {
        return String.format("%s-%s-%s-with-%s-%s",
                randomAdjective(random),
                randomNoun(random),
                randomVerb(random),
                randomAdjective(random),
                randomNoun(random));
    }

    /**
     * パターンD: [verb]-[adj]-[noun]-into-[noun]
     * 例: melts-ancient-key-into-shadow
     */
    private String patternD(Random random) {
        return String.format("%s-%s-%s-into-%s",
                randomVerb(random),
                randomAdjective(random),
                randomNoun(random),
                randomNoun(random));
    }

    /**
     * パターンE: [adj]-[noun]-[adv]-[verb]
     * 例: silent-cat-gently-whispers
     */
    private String patternE(Random random) {
        return String.format("%s-%s-%s-%s",
                randomAdjective(random),
                randomNoun(random),
                randomAdverb(random),
                randomVerb(random));
    }

    /**
     * パターンF: [noun]-[adv]-[verb]-[adj]-[noun]
     * 例: shadow-slowly-becomes-golden-light
     */
    private String patternF(Random random) {
        return String.format("%s-%s-%s-%s-%s",
                randomNoun(random),
                randomAdverb(random),
                randomVerb(random),
                randomAdjective(random),
                randomNoun(random));
    }

    private String randomAdjective(Random random) {
        List<String> adjectives = wordCache.getAdjectives();
        return adjectives.get(random.nextInt(adjectives.size()));
    }

    private String randomNoun(Random random) {
        List<String> nouns = wordCache.getNouns();
        return nouns.get(random.nextInt(nouns.size()));
    }

    private String randomVerb(Random random) {
        List<String> verbs = wordCache.getVerbs();
        return verbs.get(random.nextInt(verbs.size()));
    }

    private String randomAdverb(Random random) {
        List<String> adverbs = wordCache.getAdverbs();
        return adverbs.get(random.nextInt(adverbs.size()));
    }
}
