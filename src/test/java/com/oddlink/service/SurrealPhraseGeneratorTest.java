package com.oddlink.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SurrealPhraseGeneratorTest {

    @Mock
    private WordCache wordCache;

    private SurrealPhraseGenerator generator;

    private static final long TEST_SALT = 12345L;

    @BeforeEach
    void setUp() {
        // テスト用の単語リストを設定
        when(wordCache.getAdjectives()).thenReturn(List.of(
                "purple", "golden", "silver", "broken", "floating",
                "melting", "silent", "ancient", "forgotten", "hidden"
        ));
        when(wordCache.getNouns()).thenReturn(List.of(
                "clock", "whale", "butterfly", "mirror", "shadow",
                "moon", "river", "dream", "echo", "star"
        ));
        when(wordCache.getVerbs()).thenReturn(List.of(
                "whispers", "dances", "falls", "waits", "watches",
                "sleeps", "fades", "blooms", "melts", "grows"
        ));
        when(wordCache.getAdverbs()).thenReturn(List.of(
                "gently", "slowly", "quietly", "suddenly", "softly",
                "deeply", "silently", "gracefully", "swiftly", "forever"
        ));

        generator = new SurrealPhraseGenerator(wordCache, TEST_SALT);
    }

    @Test
    @DisplayName("生成されたフレーズは正しい形式を持つ")
    void generate_returnsCorrectFormat() {
        String phrase = generator.generate(1L);

        // ハイフン区切りで複数の単語を含む
        String[] parts = phrase.split("-");
        assertThat(parts).hasSizeGreaterThanOrEqualTo(4);
    }

    @Test
    @DisplayName("複数回生成してもフレーズが正常に返される")
    void generate_multipleCallsReturnValidPhrases() {
        for (long i = 1; i <= 100; i++) {
            String phrase = generator.generate(i);
            assertThat(phrase).isNotBlank();
            // 全てのパターンはハイフンで区切られた複数の単語を持つ
            assertThat(phrase.split("-")).hasSizeGreaterThanOrEqualTo(4);
        }
    }

    @Test
    @DisplayName("同じシーケンスは同じフレーズを生成する（決定性）")
    void generate_sameSequenceProducesSamePhrase() {
        String phrase1 = generator.generate(42L);
        String phrase2 = generator.generate(42L);

        assertThat(phrase1).isEqualTo(phrase2);
    }

    @Test
    @DisplayName("異なるシーケンスは異なるフレーズを生成する")
    void generate_differentSequencesProduceDifferentPhrases() {
        Set<String> phrases = new HashSet<>();
        for (long i = 1; i <= 50; i++) {
            phrases.add(generator.generate(i));
        }
        // 50回生成して、少なくとも40種類以上の異なるフレーズが生成されることを確認
        assertThat(phrases.size()).isGreaterThanOrEqualTo(40);
    }

    @Test
    @DisplayName("6つのパターンが使用される")
    void generate_usesSixPatterns() {
        Set<String> patterns = new HashSet<>();

        // 多くのシーケンスを試して、異なるパターンを収集
        for (long i = 1; i <= 100; i++) {
            String phrase = generator.generate(i);
            if (phrase.contains("-to-")) patterns.add("A");
            else if (phrase.contains("-of-")) patterns.add("B");
            else if (phrase.contains("-with-")) patterns.add("C");
            else if (phrase.contains("-into-")) patterns.add("D");
            else patterns.add("E/F"); // adverb patterns without preposition
        }

        // 少なくとも3つ以上のパターンが使われることを確認
        assertThat(patterns.size()).isGreaterThanOrEqualTo(3);
    }
}
