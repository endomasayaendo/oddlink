ALTER TABLE "adjectives" ADD CONSTRAINT "adjectives_word_length_check" CHECK (char_length("adjectives"."word") <= 49);--> statement-breakpoint
ALTER TABLE "adverbs" ADD CONSTRAINT "adverbs_word_length_check" CHECK (char_length("adverbs"."word") <= 49);--> statement-breakpoint
ALTER TABLE "nouns" ADD CONSTRAINT "nouns_word_length_check" CHECK (char_length("nouns"."word") <= 49);--> statement-breakpoint
ALTER TABLE "verbs" ADD CONSTRAINT "verbs_word_length_check" CHECK (char_length("verbs"."word") <= 49);