export const LEMMA_REDUCTION_RULE =
  "复数/第三人称单数还原为单数，过去式/过去分词/现在分词还原为动词原形，比较级/最高级还原为原级。";

export const LEMMA_EXCEPTION_RULE =
  "例外：如果给出的拼写本身就是词典中常见的独立词条（例如 excited、tired 这类可作形容词的过去分词，或 left、better 这类独立单词），lemma 直接返回该词本身，不要强行还原。";

export const SENSE_FIELD_LINES = [
  "1. pos：简短词性标注（如 n.、v.、adj.、adv. 等）；",
  "2. chinese：该义项最常用的中文译法，简洁（不超过 10 个字，有多个常用译法时用顿号分隔）；",
  "3. english：该义项的学习型词典风格简短英文释义，一句话，不超过 15 个单词。",
];
