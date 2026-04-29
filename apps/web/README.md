# Learning English Web

[![Vercel](https://img.shields.io/github/deployments/lnwu/learning-english/production?label=vercel&logo=vercel)](https://vercel.com)

## 练习页功能

- 在 `Home` 练习页，每个单词右侧有「减少频率」按钮。
- 点击后输入要减少的次数（默认 1），确认后会把该单词的 `totalAttempts` 下调，从而降低被抽到的优先级。
- 改动会进入同步队列，并在下次自动/手动同步时写入云端。
