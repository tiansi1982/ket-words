# KET 单词 — 项目 Review 与下一阶段开发计划

> 基于 2026-11-01 对 `main`（最新提交 `f66ac6d` strict speak-practice loop）的完整代码走查、
> 词库数据体检、以及 `npm test` / `npm run lint` / `npm run build` 的实际运行结果整理。
> 与 [SPEC.md](./SPEC.md)（产品文档）、[BACKLOG.md](./BACKLOG.md)（2026-07 的清单，已基本全部完成）配合使用。

---

## 进度

**2026-11-01 · 第 1 周那组已完成**（分支 `claude/beautiful-clarke-7qqdu3`）：

| 编号 | 状态 | 说明 |
|------|------|------|
| R13 | ✅ | lint 0 错误；移除未用的 `tw-animate-css`；`tsx` 进 devDependencies |
| R2 | ✅ | `Study` 进入时剔除词库里不存在/重复的 ID，光标不丢；全部失效则清空 session；`src/lib/session.ts` + 测试 |
| R3 | ✅ | 词库 1598 → 1574；`src/lib/word-aliases.ts` 把 24 个旧 ID 并入保留 ID（persist v3 迁移 + 同步合并时都处理）；删了 20 个孤儿音频；README/SPEC 数字更新 |
| R4 | ✅ | `scripts/validate-words.mjs` 接进 `npm test`；顺手修了 36 条格式错误的音标（碎片/方括号/澳音） |
| R1 | ✅ | `/api/soe-url` 必须带 session token 或设备令牌（新 `POST /api/device`），只签词库例句，按主体与 IP 每日计数（`migrations/0002_soe_quota.sql`）；前端超额有专门提示。**上线前要执行一次 `npx wrangler d1 migrations apply ket-words-sync --remote`**，并建议在控制台加 WAF 速率限制 |
| E1 | ✅ | `.github/workflows/ci.yml`：lint → test → build |

**2026-11-01 · 第 2 周那组也已完成**：

| 编号 | 状态 | 说明 |
|------|------|------|
| R5 | ✅ | 16 条词条加 `forms`，`findInExample` 先试变形再试基础拼写；校验脚本把"例句找不到目标词"升为错误 |
| R6 | ✅ | 页面共用一个 AudioContext，在点击麦克风的手势内解锁并 resume；不再每次新建/关闭。**仍需 iPhone 实机确认评分正常** |
| R7 | ✅ | 总结页 `SessionSummary`：每词跟读分数胶囊 + 拼写对错、点行朗读、明天待复习数、今日进错题本数；`currentSession.results` |
| R8 | ✅ | 学习卡片顶部 复习 / 学习中 / 新词 标签 + 上次学习距今天数 |
| R12 | ✅ | SPEC 5.1 / 5.2 / 5.3 / 六 / 九 / 十、BACKLOG 盘点表与代码对齐；新增 CHANGELOG.md |
| R14 | ✅ | 决定保留"一词两题"（跟读失败仍记错、重置 SRS），统计页加一行说明；`recordSpeak` 另记 `speakFailCount` / `lastSpeakScore` |

**2026-11-01 · 第 3 周那组也已完成**：

| 编号 | 状态 | 说明 |
|------|------|------|
| R10 | ✅ | `/settings`：每日目标、自动朗读、跟读通过线（家长，60–100）、家长 PIN；`PinDialog` / `usePinGate` 守住删档案、解绑、改通过线 |
| R11 | ✅ | 连续 3 次低于通过线 → 最低分的 2 个词单独播放；分数条画通过线 |
| R9 | ✅ | `/error-bank` 列表页 + `/error-bank/practice` 每轮 10 个；`errorSession` 持久化可续；轮次回顾 |
| E2 | ✅ | vitest + Testing Library；13 个旧脚本原样包进 `test()`，4 个组件测试文件（25 个用例，4.5s） |

**2026-11-01 · 第 4 周那组也已完成**：

| 编号 | 状态 | 说明 |
|------|------|------|
| F1 | ✅ | `/words` 单词本：`VirtualList` 虚拟滚动、搜索、状态/难度/词性筛选、A–Z 跳转、`WordDetail` 详情弹层；`src/lib/word-status.ts` 统一状态推导 |
| F2 | ✅ | `markKnown`（进入 SRS 第 2 级、7 天后复习、移出错题本）/ `resetWords`（写新记录而非删除，兼容同步）；详情单个 + 多选批量（可全选当前筛选），PIN 守住 |

**2026-11-04 · 第 5 周那组也已完成**：

| 编号 | 状态 | 说明 |
|------|------|------|
| F3 | ✅ | `/placement`：分层 40 题（英→中 + 听音选词），`markKnown` 答对的词，`placement.estimated` 参与每日选词权重；首页新档案卡片、设置页可再测 |
| F4（前半） | ✅ | `src/lib/exercise.ts` 阶段计划：复习词先考后看，`srsLevel ≥ 1` 用听写（`DictationPrompt`）；练习页题型选择：混合 / 中→英 / 英→中 / 听写 |

F4 后半（例句填空、听音选词进练习页）排第 6 周，与 F9 备份、F11 音标重建一起。

---

## 0. 一页结论

**项目整体健康**：架构清晰、功能闭环完整（学 → 读 → 拼 → SRS 复习 → 错题 → 统计 → 多孩子 → 云同步），
代码量小（约 5.8k 行）但该有的都有，注释和历史决策记录得很好。7 组回归测试全部通过，类型检查和构建通过。

**但有几件事应当先于任何新功能处理**：

| # | 问题 | 严重度 | 为什么现在就要做 |
|---|------|--------|------------------|
| 1 | `/api/soe-url` 没有任何鉴权和限流，任何人都能拿签名 URL 消耗你的腾讯评测额度 | 🔴 高（费用风险） | 线上地址公开，脚本刷一晚上就是真金白银 |
| 2 | 词库有 **24 个完全重复的词条**（`goat` `gold` `good`… 全在 G 区，ID 572–600 与 601–645 两段重叠） | 🔴 高（数据） | 孩子会把同一个词学两遍、复习两遍；"1598 词"实际只有 1574 个 |
| 3 | `Study.tsx` 遇到词库里不存在的 `wordId` 会**白屏卡死**（没有内容、没有"下一个"） | 🔴 高（潜在） | 现在没触发只是因为没人改过词库；做第 2 项之前必须先修 |
| 4 | 音标数据质量差：英美澳口音混杂、5 条是截断碎片、`act` 标成 `/æk/` | 🟠 中 | 配的是英音 Sonia 的音频，音标却一半是美音，会误导孩子 |
| 5 | README / SPEC / BACKLOG 与代码已经脱节（"无后端"、"自行对比发音"、"可随时跳过"都已不成立） | 🟠 中 | 下一个接手的人（包括未来的你）会被文档误导 |

**下一阶段的主线建议**（详见第二章）：
1. **第 1–2 周 · 止血与打磨**：上面 5 项 + 学习完成总结页 + 复习词/新词标识 + 错题分批 + 设置页雏形。
2. **第 3–6 周 · 新功能**：单词本/词典浏览 + "我已经会了"批量标记 + 摸底测试（最能缩短总学习周期的一组），
   然后是新题型（听写、句子填空、英选中）、主题分类、家长周报/提醒。
3. **持续 · 工程底座**：CI、组件测试、端到端冒烟、错误监控、词库校验脚本、AudioWorklet 迁移。

---

## 一、现状 Review

### 1.1 做得好的地方（保持）

- **学习闭环设计扎实**：展示 → 整句跟读（云评分）→ 拼写 → 结果；SRS 1/3/7/15/30 天；
  每日选词"到期复习 > 学习中 > 新词"三级优先；难度权重随进度漂移。这套逻辑都在 store 里，可测、已测。
- **历史决策都有记录**：为什么弃用 Web Speech 识别、为什么从 LeanCloud 换成自建 D1、
  为什么括号词条这样判定……在 SPEC 和代码注释里都能找到。这是小项目里少见的好习惯。
- **离线与性能考虑周到**：词库独立 chunk、路由懒加载、预生成神经语音 + CacheFirst 运行时缓存、
  `prefers-reduced-motion` 处理、低端平板上避免多重 backdrop-blur。
- **安全基本面尚可**：SOE 密钥不出服务端、密码 PBKDF2 加盐、登录失败也算一次哈希防时序探测、
  D1 写入有 1MB 上限、`refText` 长度校验。
- **多孩子 + 云同步的无损合并**（`mergeProfileData`）思路正确，且有测试覆盖。

### 1.2 实测结果

| 检查项 | 结果 | 备注 |
|--------|------|------|
| `npm test`（7 个 tsx 脚本） | ✅ 全部通过 | 覆盖 SRS、档案、选词、同步合并、录音、SOE 解析、词条工具 |
| `npm run build`（tsc -b + vite） | ✅ 通过 | 1.0s |
| `npm run lint` | ❌ 2 个错误 | `react-refresh/only-export-components`：`SentenceSpeak.tsx:32`、`ui/button.tsx:61` |
| CI | ❌ 没有 | 无 `.github/workflows`，lint/test/build 全靠手动 |
| 首屏 JS | 284 KB（gzip 92 KB） | React 19 + Router 7 + zustand + lucide + base-ui |
| 词库 chunk | 311 KB（gzip 87 KB） | 并行加载，App 以 `ready` 门控 |
| CSS | 58 KB（gzip 10 KB） | |
| 预生成音频 | 3154 个 mp3，44 MB，全部进了 git | 覆盖率 100%（词 + 例句），repo pack 33 MB |
| 无用依赖 | `tw-animate-css` | 已 import 但代码里没用到任何 `animate-in` 类 |

### 1.3 问题清单（按严重度）

#### 🔴 高

**H1. `/api/soe-url` 可被任意调用刷额度**
`functions/api/soe-url.ts` 只校验 `refText` 格式，不校验调用者。拿到签名 URL 后对方可以直连腾讯跑评测，
账单记在你头上。建议三层叠加：
- 必须带云同步的 session token（`requireSession`）；未绑定账号的孩子走一个"设备令牌"（首次启动由服务端签发并写入 KV/D1）；
- D1 或 KV 记每账号/每设备每日配额（例如 300 次），超了返回 429，前端提示"今天的发音练习次数用完了"；
- Cloudflare 控制台加 WAF Rate Limiting 规则（同 IP 每分钟 ≤ 20 次）。
顺手：`refText` 应该只接受词库里存在的例句（服务端持有例句 SHA 集合即可），而不是任意 200 字符文本。

**H2. 词库 24 个重复词条**
`src/data/ket-words.json` 的 G 区被导入了两遍（ID 572–600 与 601–645 交叠，释义略有不同、例句不同）。
完整对照见附录 A。影响：同一个词出现在两个 ID 下，各自独立计 SRS，孩子要掌握两次；
选择题虽然已排除同拼写干扰项，但题目本身仍会重复。
处理原则：**保留 ID 不变、只删除重复条目**（用户 `progress` 里存的是 ID，不能重编号）；
删除后老数据里残留的 ID 要能被安全忽略（见 H3）。建议保留释义更完整的一条（多数是 572–600 那段）。

**H3. `Study.tsx` 对未知 wordId 卡死**
`currentWord = getWord(wordIds[index])` 为 `undefined` 时，四个 phase 的 JSX 全部不渲染，
页面只剩标题和进度条，没有任何按钮能前进。`ErrorBank` 用 `getErrorWords` 过滤掉了，`Study` 没有。
修法：进入 `/study` 时把 `currentSession.wordIds` 过滤成词库里存在的 ID（或 `useEffect` 里自动 `advanceSession`）。
同时 `getMasteredIds` / `getDueReviewIds` / 统计页的分母也应忽略不存在的 ID。

#### 🟠 中

**M1. 音标质量**（来源 dictionaryapi.dev，1425/1598 有值）
- 口音混杂：354 条带美音标记（`ɹ` `ɚ` `oʊ`），187 条带英音标记（`ɒ` `əʊ`），9 条是澳音（`bus /bɐs/`、`about /əˈbɛʊt/`、`goat /ɡɐ̟ʉt/`）；
- 5 条是词典里的后缀碎片：`actually /-ɪ/`、`environment /-mɪnt/`、`nationality /-ˈnæl.ti/`、`panda /ˈpæn-/`；
- 错误：`act /æk/`（丢了 t）；格式不一：`bike [bɐɪk]` 用方括号；
- 84 个单词（非词组）缺音标。
音频是 `en-GB-SoniaNeural`，音标应统一为英音。1598 条规模不大，建议：
从 Wiktionary（en-GB）或 CMU + 英音转换批量重建，再人工/LLM 抽检；加入校验脚本防止回归。

**M2. 例句高亮对不规则变形失效**（18 条）
`ExampleSentence` 用 `\b{base}\w*` 匹配，`fly/flew`、`give/gave`、`tooth/teeth`、`steal/stole`、
`wake/woke`、`wear/wore`、`spend/spent`、`break down/broke down`… 都高亮不了。
最省事：给词条加可选字段 `forms: string[]`（不规则形式），高亮和（将来的）句子填空都用它。

**M3. iOS 上 SOE 可能收不到音频（需实机验证）**
`soe.ts` 的 `new AudioContext()` 发生在两次 `await` 之后（`getUserMedia`、`fetch('/api/soe-url')`），
不在用户手势栈内；iOS Safari 可能让它处于 `suspended`，`onaudioprocess` 不触发，腾讯收到的是空音频 → 低分/无分。
加一行 `await ctx.resume()` 并在 `state !== 'running'` 时上报，成本极低。
另外 `ScriptProcessorNode` 已废弃，中期迁到 `AudioWorklet`。

**M4. 一个词一轮里可能被记两次错**
跟读没过 → `updateProgress(false)`；接着拼写又一次 `updateProgress(...)`。`wrongCount`、`dailyLog`、
正确率都会因此偏离"一题一记"。如果这是有意的（跟读和拼写算两题），统计页的文案应该说清楚；
否则应把跟读结果只记到一个单独字段（如 `speakFail`），不进 `wrongCount`。

**M5. 通过线、超时、跳过策略全部硬编码**
`PASS_SCORE = 90`、`STUCK_SKIP_MS = 30000`、`MAX_SCORE_FAILS = 3`、`MAX_RECORD_MS = 30000`。
90 分对 10 岁孩子的整句朗读偏严（腾讯 `SuggestedScore` 在 `score_coeff=1.0` 下 80 分已是很好的发音）。
建议进设置页，由家长设定（默认可保持 90），并在分数条上画出通过线。

**M6. 错题练习不分批**
错题本 100+ 时，一次练习 = 100 次"跟读 + 拼写"，孩子做不完就退出，下次又从头来（`index` 不持久化）。
建议每轮 10 个（与选择题一致）、按加入时间 + 连错次数排序、练完一轮给小结。

**M7. 文档漂移**
- README："无后端"、"发音朗读用浏览器原生 speechSynthesis"、"孩子自己对比标准发音" —— 三条都已过时；
- SPEC 5.2："不支持时或点击'跳过发音'可直接进入拼写阶段"、SPEC 七："网络/评测失败时静默退回纯录音对比" —— 严格模式后已不成立；
- BACKLOG 功能盘点表仍写"发音评估 SpeechRecognition + Levenshtein ✅"；SPEC 第十章"待实现功能（暂无）"。
建议把这份 ROADMAP 作为新的待办入口，SPEC 只描述"现在是什么样"，并补一份 CHANGELOG。

**M8. 云同步后端的运维细节**
- `sessions` 表只增不减，没有过期、没有登出接口；
- 登录/注册没有限流（可暴力猜密码；虽然数据价值低，但用户名是孩子名字时很好猜）；
- `register.ts` 把所有插入异常都当成"用户名已占用"（202），D1 故障时会误导；
- PBKDF2 1 万次是 Workers 免费版 CPU 限制下的折中，可以接受，但应在注册时要求密码 ≥ 8 位。

#### 🟡 低

- **L1.** lint 2 个 `only-export-components` 错误：把 `speakWordAndExample`/`ExampleSentence`/`PASS_SCORE` 移到 `lib/`，`buttonVariants` 单独文件。
- **L2.** `tw-animate-css` 未使用，移除。
- **L3.** 没有 CI；`npm test` 是 bash for 循环 + 每次 `npx tsx`（首次还要下载）。
- **L4.** 可访问性：全项目只有 7 处 `aria-*`；`ProgressBar` 无 `role="progressbar"`；选择题选项无 `aria-pressed`；颜色是唯一的对错反馈（已有 ✅/❌ 辅助，尚可）。
- **L5.** `Practice` 的 `useMemo` 用 eslint-disable 绕过依赖检查，`round` 作为"重新抽题"信号可读性一般，改成 `useState(() => pick())` + `restart` 里显式重抽更直白。
- **L6.** 词性标注零星问题：`action` 标为 adj（"动作的"），`unhappy` 标为 n。
- **L7.** 44 MB 音频进 git：目前可接受（Pages 限制 2 万文件/单文件 25 MB），但每次重生成都会让仓库膨胀；若未来换音色，考虑放 R2 并用自定义域名反代。

### 1.4 体验走查（孩子 / 家长视角）

| 场景 | 现状 | 感受 | 建议 |
|------|------|------|------|
| 第一次打开 | 直接进首页，没有任何引导；第一次点麦克风才弹权限 | 家长不知道要先授权麦克风、要联网 | 首次启动 3 屏引导（怎么学 / 为什么要麦克风 / 家长设置入口） |
| 今日学习 · 展示 | 只有一个"练习发音 →" | 复习词和新词长得一模一样，孩子不知道这个词"见过" | 卡片角落加 `复习` / `新词` / `学习中` 小标签，复习词显示"上次 X 天前" |
| 今日学习 · 跟读 | 必须 ≥90 分才能继续，30 秒后才出现跳过 | 严格是家长要求的，但孩子遇到真读不准的词会反复录 5–6 次 | 第 3 次未过时给"听标准发音 → 逐词跟读"的分解提示；把通过线画在分数条上 |
| 今日学习 · 完成 | "🎉 共学习了 N 个单词" + 返回 | 没有回顾：哪些错了、哪些读得不好、明天有几个要复习 | 完成总结页：词列表（对/错/发音分）、可点读、"明天待复习 N 个"、分享给家长 |
| 错题练习 | 一口气全部、不保存进度 | 错题多时会放弃 | 分批 10 个 + 进度持久化 + 列表视图可浏览/点读/手动移除 |
| 选择题 | 只有"中文释义 → 选英文" | 题型单一，做多了会靠排除法 | 加"英文 → 选中文"、"听音 → 选词"、"例句填空"，并混入每日学习 |
| 统计页 | 信息够用；每日目标藏在这里 | "设置"和"统计"混在一起 | 独立设置页：目标、通过线、自动朗读、语速、主题、家长 PIN |
| 家长 | 只能看统计页 | 想知道"这周学了多少、哪些词老错、有没有偷懒" | 周报卡片（应用内）+ 可选邮件/微信推送；删除档案等危险操作加 PIN |
| 没网 | 学习和错题整页阻断，选择题可用 | 符合"必须评分"的决定，但出门、地铁里完全学不了 | 设置里加"离线时允许不评分学习"（默认关），离线答题标记 `unscored` 回网后不补分 |

---

## 二、下一阶段开发计划

工作量标注：**S** = 半天内，**M** = 1–2 天，**L** = 3–5 天。编号沿用 BACKLOG 的风格，新前缀：R（修复/打磨）、F（新功能）、E（工程）。

### 阶段 1 · 止血与打磨（第 1–2 周）

目标：把"已经上线的东西"做扎实，不新增学习模式。

| 编号 | 任务 | 量 | 涉及文件 | 验收标准 |
|------|------|----|----------|----------|
| R1 ✅ | **SOE 签名接口加鉴权 + 配额**（H1） | M | `functions/api/soe-url.ts`、`functions/api/sync/_lib.ts`、`src/services/soe.ts`、新 `migrations/0002_quota.sql` | 无 token 返回 401；每账号/设备每日上限可配置；超限前端有友好提示；`refText` 必须是词库例句 |
| R2 ✅ | **Study 对未知 wordId 的防护**（H3） | S | `src/pages/Study.tsx`、`src/store/userStore.ts` | 构造一个含不存在 ID 的 session，页面自动跳过且不崩；加回归测试 |
| R3 ✅ | **词库去重**（H2） | S | `src/data/ket-words.json`、新 `scripts/validate-words.mjs` | 24 个重复条目移除，ID 不重编；校验脚本断言 `word+pos` 唯一；首页总数显示 1574 |
| R4 ✅ | **词库校验脚本接入 test** | S | `scripts/validate-words.mjs`、`package.json` | 校验：ID 唯一递增、`word+pos` 唯一、IPA 以 `/` 包裹且不含 `-` 开头/结尾、例句含原形或 `forms` 之一、例句 ≤15 词 |
| R5 ✅ | **不规则变形字段 `forms`**（M2） | S | `ket-words.json`、`src/types/index.ts`、`SentenceSpeak.tsx` | 18 条例句高亮恢复；后续填空题复用 |
| R6 ✅ | **iOS AudioContext resume + 诊断**（M3） | S | `src/services/soe.ts` | iPhone Safari 主屏 PWA 实测评分正常；`state !== 'running'` 时 console.warn |
| R7 ✅ | **学习完成总结页** | M | `src/pages/Study.tsx`（或新 `SessionSummary.tsx`）、`userStore`（session 内记录每词结果） | 列出本次每个词：拼写对错、发音分、是否进错题本；可点读；显示"明天待复习 N 个" |
| R8 ✅ | **复习词 / 新词 / 学习中 标签** | S | `Study.tsx`、`SentenceSpeak.tsx` | 展示阶段卡片右上角有标签；复习词显示上次学习距今天数 |
| R9 ✅ | **错题练习分批 + 进度持久化 + 列表视图**（M6） | M | `src/pages/ErrorBank.tsx`、`userStore`（`errorSession`）、新 `ErrorList.tsx` | 每轮 10 个；中途退出可续；列表可浏览、点读、手动移除 |
| R10 ✅ | **设置页雏形 + 家长 PIN**（M5） | M | 新 `src/pages/Settings.tsx`、`userStore`（`settings` 字段，持 persist v3 迁移）、`Stats.tsx`（移走每日目标） | 可设：每日目标、发音通过线（60–100）、自动朗读开关、离线是否允许学习；危险操作（删档案/解绑/改通过线）需 4 位 PIN |
| R11 ✅ | **跟读连续未过时的分解提示** | S | `SentenceSpeak.tsx` | 第 3 次 <通过线：显示逐词分数最低的 1–2 个词，提供"只听这个词"按钮 |
| R12 ✅ | **文档同步**（M7） | S | `README.md`、`SPEC.md`、`BACKLOG.md`、新 `CHANGELOG.md` | README 技术栈/后端/发音描述正确；SPEC 5.2 与七章反映严格模式；BACKLOG 顶部指向本文件 |
| R13 ✅ | **lint 清零 + 移除 `tw-animate-css`**（L1、L2） | S | `SentenceSpeak.tsx`、`ui/button.tsx`、`index.css`、`package.json` | `npm run lint` 0 错误；bundle 不增大 |
| R14 ✅ | **跟读/拼写计分口径明确**（M4） | S | `userStore.updateProgress`、`Stats.tsx` | 决定并实现：要么跟读失败不计 `wrongCount` 只标 `speakFail`，要么统计页写明"一词两题" |

### 阶段 2 · 新功能（第 3–6 周）

按"对缩短总学习周期的贡献"排序。F1–F3 是一组，建议一起做。

| 编号 | 功能 | 量 | 说明 | 验收标准 |
|------|------|----|------|----------|
| F1 ✅ | **单词本 / 词典浏览** | L | 新页面 `/words`：全部 1574 词，按字母/状态/难度/词性筛选，搜索（英文、中文），点开看详情（音标、例句、发音、学习记录、SRS 到期日）。 | 任意词 3 秒内能找到并点读；列表虚拟滚动，低端平板不卡 |
| F2 ✅ | **"我已经会了"批量标记** | M | 在 F1 里多选 → 标记为已掌握（直接进入 SRS 等级 2，7 天后首次复习，而不是跳过复习）；也可反向"重新学"。 | 已有基础的孩子可在 10 分钟内标掉几百个词；标记的词仍会被 SRS 抽查 |
| F3 ✅ | **摸底测试** | M | 新孩子首次使用时可选：按难度分层抽 40 题（英→中选择 + 听音选词），答对的词按 F2 规则预标记，并据此设置初始难度权重。 | 10 分钟内完成；结果页给出"预计已掌握 N 词"；可跳过 |
| F4 ◐ | **新题型**（听写、英→中已做；填空、听音选词待做） | L | ① 听写（只放音频，拼写）② 英→中选择 ③ 例句填空（例句挖掉目标词，给首字母）④ 听音选词。选择题练习页改为"混合练习"，每日学习的拼写阶段按 SRS 等级随机换成听写/填空（等级越高越难）。 | 四种题型都有测试；选择题页可选题型；每日学习里复习词至少 30% 用非基础题型 |
| F5 | **主题分类（KET 官方 Topic）** | L（数据为主） | 给每个词打 1–2 个主题标签（家庭、食物、学校、运动、旅行、天气、动物、身体、购物、工作……约 20 个）；统计页按主题显示掌握度；可按主题开"专题学习"（不影响 SRS 主线）。 | 100% 词条有标签；主题页进度条；专题学习与每日学习共用 progress |
| F6 | **家长周报** | M | 应用内"本周"卡片：学习天数、新学/复习/错题数、正确率趋势、本周最常错的 10 个词、发音平均分。已绑定云同步的档案可选每周一早上邮件（Cloudflare Cron Worker + Resend）。 | 本地档案可看应用内周报；云端档案可订阅邮件，一键退订 |
| F7 | **学习提醒** | M | Web Push（iOS 16.4+ 主屏 PWA 支持）：家长设每天提醒时间；后端存订阅（D1）、Cron Worker 定时推送；无权限时退化为"添加到日历"。 | iPhone/安卓 Chrome 都能收到；关闭后不再推 |
| F8 | **成就与激励** | M | 徽章（连续 7/30/100 天、掌握 100/500/1000 词、发音满分 10 次…）、每日学习完成的小动画/音效（可关）、连续打卡"补签卡"（每月 1 张，防止一次请假清零）。 | 徽章页；获得时有即时反馈；音效受设置控制 |
| F9 | **备份导入导出** | S | 设置页：导出当前档案 JSON / 导入（合并用 `mergeProfileData`）。给不想注册账号的家庭一个换设备方案。 | 导出文件可在另一台设备导入且进度一致 |
| F10 | **离线学习模式（可选）** | M | 设置开关（默认关，需 PIN）：离线时允许跳过评分继续学习，该次跟读标记 `unscored`，不计对错、不进错题本。 | 飞行模式下可完成一轮学习；统计页能区分 unscored |
| F11 | **音标重建**（M1） | M（脚本） | 统一英音：优先 Wiktionary en-GB，其次 CMU → 英音映射，缺失的 84 个单词补齐；校验脚本守住格式。 | 0 条含 `-` 碎片；抽检 50 条人工确认；词组可留空 |

### 阶段 3 · 工程底座（与上面并行，持续）

| 编号 | 任务 | 量 | 说明 |
|------|------|----|------|
| E1 ✅ | **GitHub Actions CI** | S | PR 和 push 到 main：`npm ci` → lint → test → build → `validate-words`。失败不允许合并。 |
| E2 ✅ | **测试框架升级** | M | 迁到 vitest（保留现有断言），加 React Testing Library 覆盖 `Study`/`ErrorBank`/`SentenceSpeak` 的状态机（mock recorder/soe/tts）。 |
| E3 | **端到端冒烟** | M | Playwright：mock `/api/soe-url` 和 WebSocket，跑完"首页 → 今日学习一轮 → 完成页"，在 CI 里跑。 |
| E4 | **错误监控** | S | 前端 `window.onerror` + ErrorBoundary 上报到一个 Pages Function（写 D1 或 Cloudflare Analytics Engine），避免靠家长口述复现 bug。 |
| E5 | **AudioWorklet 迁移** | M | 替换 `ScriptProcessorNode`；同时把重采样放到 worklet 线程。 |
| E6 | **同步后端加固**（M8） | M | session 90 天过期 + 定时清理；登录每 IP/每用户名限速（KV 计数）；`register` 区分 UNIQUE 冲突与其它错误；密码最短 8 位。 |
| E7 | **持久化 schema 版本化规范** | S | 每次给 `ProfileData` 加字段都要：bump persist version、写 migrate、补 `withDefaults`、`mergeProfileData` 处理、加测试。写成 `docs/CONTRIBUTING.md` 的检查清单。 |
| E8 | **音频资产策略** | S（决策） | 保持 git 内；若换音色或加词组慢速版，迁 R2 + 自定义域名，SW 缓存规则不变。 |

### 建议排期

```
第 1 周   R1 R2 R3 R4 R13 E1          ← 先把风险和 CI 立起来
第 2 周   R5 R6 R7 R8 R12 R14         ← 学习体验打磨 + 文档
第 3 周   R9 R10 R11 E2               ← 错题/设置/PIN + 测试框架
第 4 周   F1 F2                       ← 单词本 + 批量标记
第 5 周   F3 F4(听写、英→中)           ← 摸底 + 前两种新题型
第 6 周   F4(填空、听音选词) F9 F11     ← 剩余题型 + 备份 + 音标
第 7 周+  F5 F6 F7 F8 F10 E3–E8       ← 按家长反馈排优先级
```

### 暂不建议做的

- **原生 App 打包（Capacitor 等）**：PWA 在目标设备上已满足需求，打包只增加发布与审核成本；除非 iOS 推送（F7）实测不可靠再考虑。
- **排行榜 / 好友 PK**：多孩子是家庭内场景，社交功能收益低、隐私成本高。
- **AI 自由对话口语**：成本和延迟都高，且与 KET 词汇目标偏离；F4 的句子填空和听写已能覆盖"用起来"的需求。
- **重写 UI 框架**：现有 Tailwind 4 + 少量 base-ui 很轻，没有必要引入完整组件库。

---

## 附录

### A. 重复词条对照（H2）

| 单词 | ID | 释义（前 / 后） |
|------|----|-----------------|
| goat | #572 / #601 | 山羊 / 山羊 |
| gold | #573 / #602 | 金；金色 / 黄金 |
| good | #574 / #605 | 好的；良好的 / 好的 |
| goodbye | #575 / #611 | 再见 / 再见 |
| grade | #577 / #612 | 年级；成绩；等级 / 成绩 |
| grandchild | #579 / #615 | 孙子/孙女；外孙/外孙女 / 孙子女 |
| granddaughter | #580 / #616 | 孙女；外孙女 / 孙女 |
| grandfather | #581 / #617 | 祖父；外祖父 / 祖父 |
| grandma | #582 / #618 | 奶奶；外婆 / 奶奶 |
| grandmother | #583 / #619 | 祖母；外祖母 / 祖母 |
| grandpa | #584 / #620 | 爷爷；外公 / 爷爷 |
| grandson | #586 / #622 | 孙子；外孙 / 孙子 |
| great | #587 / #626 | 极好的；伟大的 / 极好的 |
| grey | #589 / #628 | 灰色 / 灰色 |
| grocery store | #590 / #630 | 杂货店；食品店 / 杂货店 |
| ground | #591 / #631 | 地面；地上 / 地面 |
| group | #592 / #632 | 组；群体 / 小组 |
| grow | #593 / #633 | 生长；成长；种植 / 生长 |
| grow up | #594 / #634 | 长大 / 长大 |
| guess | #595 / #635 | 猜测；猜 / 猜测 |
| guitar | #596 / #641 | 吉他 / 吉他 |
| gym | #597 / #643 | 健身房；体育馆 / 健身房 |
| hair | #598 / #644 | 头发 / 头发 |
| half | #600 / #645 | 一半 / 一半 |

`green`（#588 名词"绿色" / #627 形容词"绿色的"）词性不同，是合法的两个词条，不在此列。

### B. 明显异常的音标（M1）

| ID | 单词 | 现值 | 问题 |
|----|------|------|------|
| 2 | about | `/əˈbɛʊt/` | 澳音 |
| 7 | act | `/æk/` | 丢了 /t/ |
| 11 | actually | `/-ɪ/` | 后缀碎片 |
| 126 | bike | `[bɐɪk]` | 方括号 + 澳音 |
| 186 | bus | `/bɐs/` | 澳音 |
| 456 | environment | `/-mɪnt/` | 后缀碎片 |
| 572 / 601 | goat | `/ɡɐ̟ʉt/` | 澳音 |
| 923 | nationality | `/-ˈnæl.ti/` | 后缀碎片 |
| 1003 | panda | `/ˈpæn-/` | 前缀碎片 |

另有 354 条带美音标记（如 `across /əˈkɹɑs/`、`bird /bɜd/`），需统一为英音。

### C. 例句中只出现不规则变形的词条（M2）

break down（broke）、century（centuries）、fall over（fell）、fly（flew）、give（gave）、go away（went）、
grand(d)ad（granddad）、look after（looks）、look for（looking）、memory（memories）、site（website）、
spend（spent）、steal（stole）、tooth（teeth）、wake（woke）、wear（wore）、work out（works）、yog(h)urt（yoghurt）。

其中 `look after`/`look for`/`work out` 是词组内第一个词变形导致 `\b{base}` 整体不匹配；
`site`/`website` 是例句用了派生词；其余为不规则动词/名词变形。
