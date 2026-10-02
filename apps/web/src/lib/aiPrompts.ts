export const LEMMA_REDUCTION_RULE =
  "plural nouns and third-person singular verbs reduce to the singular, past tense / past participle / present participle reduce to the base verb, comparative and superlative reduce to the positive degree.";

export const LEMMA_EXCEPTION_RULE =
  "Exception: if the given spelling is itself an established dictionary headword (for example excited or tired used as adjectives, or left and better as independent words), return it unchanged as the lemma instead of reducing it.";

export const SENSE_SELECTION_RULE =
  "senses lists only the senses a learner actually meets in everyday English, ordered from most to least frequent; the first entry must be the most common sense. Return a single sense when the word has only one common sense: never pad the list with rare, technical, literary or outdated senses (the dependant sense of mouth is not worth listing). Merge near-duplicates, including senses that differ only in register, and keep the entries clearly distinguishable from each other. Different senses are always separate entries.";

export const SENSE_FIELD_LINES = [
  "1. pos: short part-of-speech tag (n., v., adj., adv., ...);",
  "2. chinese: the common Chinese translation(s) of this sense, concise (at most 10 characters); separate alternative translations of the same sense with 、;",
  "3. english: learner's-dictionary style definition of this sense, one sentence, at most 15 words.",
];
