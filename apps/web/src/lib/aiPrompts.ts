export const LEMMA_REDUCTION_RULE =
  "plural nouns and third-person singular verbs reduce to the singular, past tense / past participle / present participle reduce to the base verb, comparative and superlative reduce to the positive degree.";

export const LEMMA_EXCEPTION_RULE =
  "Exception: if the given spelling is itself an established dictionary headword (for example excited or tired used as adjectives, or left and better as independent words), return it unchanged as the lemma instead of reducing it.";

export const SENSE_SELECTION_RULE =
  "senses lists only the senses a learner actually meets in everyday English, at most 3 entries, ordered from most to least frequent; the first entry must be the most common sense. Return a single entry when the word has only one common sense: never pad the list with rare, technical, literary or outdated senses (the obsolete sense of dependant meaning a person another person supports is not worth listing). Merge near-duplicates, including senses that differ only in register, so that every entry is clearly distinguishable from the others; genuinely different senses stay separate entries.";

export const SENSE_FIELD_LINES = [
  "1. pos: exactly one tag from n., v., adj., adv., prep., conj., pron., det., num., int.; keep the trailing period and never combine two tags;",
  "2. chinese: the common Simplified Chinese translation(s) of this sense, concise (at most 10 characters); separate alternative translations of the same sense with 、; never use a dash or a line break;",
  "3. english: learner's-dictionary style definition of this sense, one sentence, at most 15 words.",
];
