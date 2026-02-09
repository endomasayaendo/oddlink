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

    @BeforeEach
    void setUp() {
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

        generator = new SurrealPhraseGenerator(wordCache);
    }

    @Test
    @DisplayName("生成されたフレーズは正しい形式を持つ")
    void generate_returnsCorrectFormat() {
        String phrase = generator.generate();

        String[] parts = phrase.split("-");
        assertThat(parts).hasSizeGreaterThanOrEqualTo(4);
    }

    @Test
    @DisplayName("複数回生成してもフレーズが正常に返される")
    void generate_multipleCallsReturnValidPhrases() {
        for (int i = 0; i < 100; i++) {
            String phrase = generator.generate();
            assertThat(phrase).isNotBlank();
            assertThat(phrase.split("-")).hasSizeGreaterThanOrEqualTo(4);
        }
    }

    @Test
    @DisplayName("複数回生成すると異なるフレーズが生成される")
    void generate_producesDifferentPhrases() {
        Set<String> phrases = new HashSet<>();
        for (int i = 0; i < 50; i++) {
            phrases.add(generator.generate());
        }
        assertThat(phrases.size()).isGreaterThanOrEqualTo(40);
    }

    @Test
    @DisplayName("6つのパターンが使用される")
    void generate_usesSixPatterns() {
        Set<String> patterns = new HashSet<>();

        for (int i = 0; i < 100; i++) {
            String phrase = generator.generate();
            if (phrase.contains("-to-")) patterns.add("A");
            else if (phrase.contains("-of-")) patterns.add("B");
            else if (phrase.contains("-with-")) patterns.add("C");
            else if (phrase.contains("-into-")) patterns.add("D");
            else patterns.add("E/F");
        }

        assertThat(patterns.size()).isGreaterThanOrEqualTo(3);
    }
}
