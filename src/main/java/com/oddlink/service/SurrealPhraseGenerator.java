package com.oddlink.service;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Random;

/**
 * シュールな英語フレーズを生成するクラス
 * 構造: [形容詞]-[名詞]-[動詞]-to-[形容詞]-[名詞]
 * 例: melting-clock-whispers-to-purple-elephant
 */
@Component
public class SurrealPhraseGenerator {

    private static final int MAX_GENERATION_ATTEMPTS = 10;

    private final Random random = new Random();
    private final DuplicateChecker duplicateChecker;

    public SurrealPhraseGenerator(DuplicateChecker duplicateChecker) {
        this.duplicateChecker = duplicateChecker;
    }

    private static final List<String> ADJECTIVES = List.of(
            "melting", "floating", "invisible", "dancing", "sleeping",
            "purple", "golden", "silent", "backwards", "upside-down",
            "translucent", "magnetic", "velvet", "crystalline", "hollow",
            "ancient", "forgotten", "whispering", "luminous", "frozen",
            "elastic", "paper-thin", "clockwork", "recursive", "parallel"
    );

    private static final List<String> NOUNS = List.of(
            "clock", "elephant", "teacup", "umbrella", "moon",
            "whale", "piano", "lighthouse", "origami", "staircase",
            "typewriter", "hourglass", "compass", "lantern", "mirror",
            "telescope", "chandelier", "pendulum", "labyrinth", "kaleidoscope",
            "silhouette", "echo", "shadow", "prism", "constellation"
    );

    private static final List<String> VERBS = List.of(
            "whispers", "dreams", "melts", "floats", "dances",
            "sings", "paints", "remembers", "forgets", "dissolves",
            "echoes", "spirals", "unfolds", "multiplies", "reverberates",
            "contemplates", "transcends", "illuminates", "evaporates", "crystallizes"
    );

    /**
     * ランダムなシュールフレーズを生成する
     * @return ハイフン区切りのフレーズ（URL用）
     */
    public String generate() {
        String adj1 = randomFrom(ADJECTIVES);
        String noun1 = randomFrom(NOUNS);
        String verb = randomFrom(VERBS);
        String adj2 = randomFrom(ADJECTIVES);
        String noun2 = randomFrom(NOUNS);

        return String.format("%s-%s-%s-to-%s-%s", adj1, noun1, verb, adj2, noun2);
    }

    /**
     * フレーズを生成する
     * @return フレーズ
     */
    public String generatePhrase() {
        for (int i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
            String phrase = generate();
            if (!duplicateChecker.isDuplicate(phrase)) {
                return phrase;
            }
        }
        throw new RuntimeException("Failed to generate unique phrase after " + MAX_GENERATION_ATTEMPTS + " attempts");
    }

    /**
     * 単語リストからランダムに単語１つを抽出する
     * @param list
     * @return
     */
    private String randomFrom(List<String> list) {
        return list.get(random.nextInt(list.size()));
    }
}
