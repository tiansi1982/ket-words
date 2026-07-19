# KET 单词

给孩子学剑桥 KET（A2）词汇的 PWA。1598 个词条，每日学习（展示 → 整句跟读 → 拼写）、
间隔重复复习（1/3/7/15/30 天）、错题本、选择题练习、多孩子档案、连续打卡。

**线上地址**：https://ket-words.pages.dev （Cloudflare Pages，push 到 main 自动部署）

完整产品文档见 [SPEC.md](./SPEC.md)，待办与已完成清单见 [BACKLOG.md](./BACKLOG.md)。

## 技术栈

React 19 + TypeScript + Vite + Tailwind 4 + zustand（localStorage 持久化，无后端）。
发音朗读用浏览器原生 speechSynthesis（英式 en-GB）；整句跟读用 MediaRecorder 录音回放，
孩子自己对比标准发音（曾用 SpeechRecognition 自动评分，因目标设备上系统识别引擎不可用而弃用）。

## 开发

```bash
npm install
npm run dev       # 本地开发
npm test          # store 回归测试（tests/*.mts）
npm run build     # 类型检查 + 构建
```

## 数据

- `src/data/ket-words.json` — 词库（含中文释义、例句、IPA 音标）
- `scripts/fetch-ipa.mjs` — 从 dictionaryapi.dev 增量抓取 IPA，缓存在 `scripts/ipa-cache.json`
