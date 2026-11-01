# KET 单词

给孩子学剑桥 KET（A2）词汇的 PWA。1574 个词条，每日学习（展示 → 整句跟读 → 拼写）、
间隔重复复习（1/3/7/15/30 天）、错题本、选择题练习、多孩子档案、连续打卡。

**线上地址**：https://ket-words.pages.dev （Cloudflare Pages，push 到 main 自动部署）

完整产品文档见 [SPEC.md](./SPEC.md)；2026-11 的项目 review 与下一阶段开发计划见 [ROADMAP.md](./ROADMAP.md)；
2026-07 的历史清单见 [BACKLOG.md](./BACKLOG.md)。

## 技术栈

React 19 + TypeScript + Vite + Tailwind 4 + zustand（localStorage 持久化）；
云同步与发音评测签名用 Cloudflare Pages Functions + D1（`functions/api/`、`migrations/`）。
发音朗读优先播放预生成的神经语音（edge-tts 英式 Sonia，`public/audio/`），缺失时退回浏览器
speechSynthesis；整句跟读用 MediaRecorder 录音 + 腾讯智聆云端评分（学习闭环的必经环节，≥90 分通过）。
曾用 SpeechRecognition 本地识别评分，因目标设备上系统识别引擎不可用而弃用。

## 开发

```bash
npm install
npm run dev       # 本地开发（纯前端；要连 /api 用 npx wrangler pages dev dist）
npm run lint
npm test          # 词库校验（scripts/validate-words.mjs）+ vitest（tests/*.mts 的 store/服务测试，tests/components/ 的组件测试）
npm run test:watch
npm run build     # 类型检查 + 构建
```

CI（`.github/workflows/ci.yml`）对 push 和 PR 跑同样的 lint / test / build。

## 部署与运维

- push 到 `main` 自动部署到 Cloudflare Pages（项目名 `ket-words`）。
- 新增 D1 migration 后要手动应用一次：

```bash
npx wrangler d1 migrations apply ket-words-sync --remote   # 生产
```

```bash
npx wrangler d1 migrations apply ket-words-sync --local    # 本地 wrangler pages dev
```

- 发音评测密钥与配额参数见 `.dev.vars.example`；生产用
  `npx wrangler pages secret put <NAME> --project-name ket-words` 逐个设置。
- `/api/soe-url` 已有令牌鉴权与每日配额（SPEC 第七章）；建议再在 Cloudflare 控制台给 `/api/*`
  加一条 WAF 速率限制规则兜底。

## 数据

- `src/data/ket-words.json` — 词库（含中文释义、例句、IPA 音标），1574 条；改动后 `npm run validate`
- `src/lib/word-aliases.ts` — 去重时移除的旧 ID → 保留 ID 映射（用户进度按 ID 存储，不能重编号）
- `scripts/validate-words.mjs` — 词库校验（`npm test` 自动跑）
- `scripts/generate-audio.py` — 用 edge-tts 为词和例句批量生成 `public/audio/*.mp3`，增量、可中断
- `scripts/fetch-ipa.mjs` — 从 dictionaryapi.dev 增量抓取 IPA，缓存在 `scripts/ipa-cache.json`
  （口音混杂，待 F11 统一重建）
