# KET 单词 — 产品需求文档

## 一、项目概述

面向中国孩子（10 岁以上）的 KET 英语词汇学习 Web App。目标是帮助孩子系统掌握剑桥 KET（A2 级）全部 1574 个词汇，通过每日学习 + 发音练习 + 拼写测试 + 选择题，形成记忆闭环。

- **线上地址**：https://ket-words.pages.dev
- **技术栈**：React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + shadcn/ui + Zustand + React Router v6
- **数据存储**：localStorage（Zustand persist）
- **部署**：Cloudflare Pages + PWA（可离线、可添加到手机桌面）

---

## 二、词库数据

### 来源与规模
- 剑桥 KET 官方词表，共 **1574 个词条**（2026-11 去除了 24 个重复导入的 G 区词条；ID 不重编，旧 ID 映射见 `src/lib/word-aliases.ts`）
- 存储路径：`src/data/ket-words.json`

### 每个词条的字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一 ID，1–1598 之间、不连续（去重后保留原 ID，用户进度按 ID 存储） |
| `word` | string | 英文单词（含消歧文本，如 `"sign (NOTICE)"`） |
| `pos` | string | 词性（英文，如 `"n"`, `"v"`, `"adj"`） |
| `pos_cn` | string | 词性（中文，如 `"名词"`, `"动词"`） |
| `definition` | string | 中文释义（简洁，如 `"能够的"`） |
| `example` | string | 英文例句（A2 难度，不超过 15 个词） |
| `example_cn` | string | 例句中文翻译 |
| `ipa` | string? | 英式 IPA 音标（如 `/əˈbaʊt/`），来自 dictionaryapi.dev（scripts/fetch-ipa.mjs），1405/1574 条有值，词组多缺失，缺失时 UI 不显示 |

---

## 三、用户状态与进度

### 状态结构（Zustand + localStorage，persist version 3）

```
activeProfileId 当前孩子的 profile id
profileList     [{ id, name }]（所有孩子档案，至少 1 个）
profileData     Record<id, ProfileData>（非当前孩子的数据快照，不含当前孩子）
syncAccounts    Record<id, SyncAccount>（云同步账号，按 profile 绑定，可空）
── 以下为当前孩子的 ProfileData，直接放在顶层（页面代码无感知）──
dailyGoal       每日目标单词数，默认 20，可选 10/20/30/50
currentSession  { date, wordIds[], currentIndex, completed, results{ wordId → { speak, speakScore, spelled } } }
progress        Record<wordId, WordProgress>
errorBank       number[]（错题 ID 列表）
dailyLog        Record<YYYY-MM-DD, number>（每天答题次数，用于打卡/统计）
```

### 多孩子档案（profile）
- 首页顶部「谁在学？」切换器：切换 / 添加 / 重命名 / 删除孩子档案
- 每个孩子的进度、错题本、每日目标、session 完全独立；切换时当前数据存入
  `profileData`，目标孩子的数据换入顶层
- 删除有二次确认；最后一个档案不可删除；删除当前档案自动切到第一个剩余档案
- 迁移：persist version 0（单用户旧数据）自动包装成第一个档案「孩子 1」；
  version 1 → 2 补空 `syncAccounts`；version 2 → 3 把去重时移除的重复词条 ID 并入保留 ID
  （`remapProfileData`：进度取状态更高/更近学习的一条，错题本与 session 去重），云端旧快照在合并时同样处理

### 云同步（P3，自建 /api/sync 后端）

- **实现方式**：自建 Cloudflare Pages Functions + D1（`functions/api/sync/` +
  `src/services/sync.ts`）。最初用 LeanCloud REST API，2026-07 其国际版停止注册
  后改为自建；错误码沿用 LeanCloud 约定（202 用户名占用 / 210 密码不对 /
  211 会话失效），前端提示文案不变
- **配置**：无需任何环境变量（同源 API）；D1 绑定在 `wrangler.toml`
  （`DB` → `ket-words-sync`），建表见 `migrations/`
- **账号模型**：按 profile 绑定用户名+密码账号（用户名 ≥3 位 + 密码 ≥6 位，
  家长创建）；密码 PBKDF2-SHA256 加盐存储；session token / user id 存在
  `syncAccounts[profileId]`；同一账号不能绑到本机两个孩子；删除档案时一并删除绑定
- **云端数据**：每个账号一行 `profiles` 记录（`user_id` 主键），字段 `data`
  （整份 ProfileData 快照 JSON）、`profile_name`、`client_updated_at`；
  仅凭本人 session token 可读写
- **同步流程**：拉取 → 合并 → 应用本地 → 回推（`syncProfile`）。触发时机：应用启动
  （所有已绑定档案）、切换档案、本地学习数据变化后防抖 3 秒、网络恢复（online 事件）、
  面板「立即同步」按钮
- **合并策略（无损，`mergeProfileData`，有测试）**：
  - `progress` 按词取 `lastStudied` 较新一方（相同取本地）
  - `dailyLog` 按天取最大值；`errorBank` 取并集（某设备上已清掉的错题可能短暂回来，
    再练对即再次清除——好过丢错题）
  - `currentSession` 取今天且 `currentIndex` 较大的一方；`dailyGoal` 取本地
- **会话失效**（LeanCloud 错误码 211）：账号标记 `invalid`，UI 提示重新输入密码登录，
  本地数据不受影响
- **UI**：「谁在学？」面板底部「云同步」区块，对当前档案操作：未绑定时登录/注册表单；
  已绑定时显示账号、上次同步时间、「立即同步」与「解绑」（二次确认，解绑只删本机绑定，
  不删云端数据）

### WordProgress 结构

```
wordId          单词 ID
status          'new' | 'learning' | 'mastered'
correctCount    累计答对次数
wrongCount      累计答错次数
lastStudied     最后学习时间戳
consecutiveWrong 连续答错次数（答对清零）；≥2 时拼写题显示首字母提示
srsLevel        间隔重复等级（0–5，索引复习间隔表；mastered 后有意义）
dueDate         下次复习日期 YYYY-MM-DD（本地时区）；null = 已巩固（毕业）
speakFailCount  跟读未过关/跳过的累计次数（R14，可选字段）
lastSpeakScore  最近一次跟读的云评分；null = 跳过（可选字段）
```

### 计分口径（R14）
- **一词两题**：跟读与拼写各算一次作答。跟读没过关或跳过 → `updateProgress(false)`
  （`wrongCount` +1、`consecutiveWrong` +1、已掌握词的复习间隔重置、进错题本），拼写再算一次。
  因此 `dailyLog` 和统计页正确率里，一个词一天最多贡献两次；统计页有一行文字说明
- 跟读结果另外记在 `speakFailCount` / `lastSpeakScore`（`recordSpeak`），不影响 SRS，
  供"最常读错的词"等后续统计使用

### 打卡与连续天数
- 每次答题（今日学习/错题/选择题）给当天 `dailyLog` 计数 +1，按 profile 独立
- 连续打卡 streak：从今天（今天还没学则从昨天）往前数连续有记录的天数
- 首页显示「🔥 连续打卡 N 天」；统计页「最近 14 天」卡片同时显示 streak

### 掌握规则与间隔重复（SRS）
- 累计答对 **3 次** → 状态变为 `mastered`，进入复习梯度，**1 天后**首次复习
- 复习间隔：**1 / 3 / 7 / 15 / 30 天**（艾宾浩斯式）
  - 到期复习答对 → 升一级，按下一档间隔安排复习
  - 复习答错（任何练习中答错均算）→ 重置回等级 0，明天再复习
  - 未到期时提前答对（如选择题练习撞到）→ 不推进等级，避免跳档
- 通过 30 天复习 → `dueDate = null`，标记「已巩固」，不再回流
- 迁移：SRS 上线前已 mastered 的旧记录无 `dueDate` 字段，视为「今天到期」自然回流

---

## 四、每日选词算法

### 难度分类（按基础拼写总字母数，忽略空格与消歧括号）

| 难度 | 字母数 | 示例 | 词库数量 |
|------|--------|------|---------|
| 简单 | ≤ 4 | `be`, `big`, `able` | 478 个 |
| 中等 | 5–7 | `table`, `friend`, `bus stop` | 750 个 |
| 困难 | ≥ 8 | `beautiful`, `ice cream` | 346 个 |

词组按所有单词的字母总数计（`ice cream` = 8 字母 → 困难），不再只看第一个词。

### 动态权重

根据已掌握单词数占总词库的比例 `p`（0→1），三种难度的抽取比例动态变化：

| 进度 p | 简单 | 中等 | 困难 |
|--------|------|------|------|
| 0%（刚开始） | 65% | 30% | 5% |
| 25% | 55% | 33% | 12% |
| 50% | 40% | 38% | 22% |
| 75% | 27% | 38% | 35% |
| 100%（接近完成） | 10% | 35% | 55% |

权重公式：
- `wEasy = max(10%, 65% − 55% × p)`
- `wHard = min(55%, 5% + 50% × p)`
- `wMedium = 100% − wEasy − wHard`

### 随机打乱

- 每个难度桶内部独立随机打乱（Fisher-Yates），保证每次选词不固定在同一批字母
- 从三个桶按权重取词后，再整体随机打乱，确保 session 内不是简单→中等→困难的固定顺序
- 某桶词量不足时，缺口自动由其他桶补齐

### 选词优先级
- 每日名额分三级：**到期复习词**（最逾期排前）>**学习中的词**（已开始未掌握，避免长期悬置）> 按下述权重抽的新词
- 三部分合并后整体打乱，孩子无感知区别

### Session 管理
- 每天第一次点"开始今日学习"时调用选词算法，将选中的 wordId 列表存入 `currentSession`
- 当天内再次进入时直接恢复同一 session（不重新选词）
- 所有单词练习完后标记 `completed: true`，当日按钮变为"今日已完成 ✓"

---

## 五、功能模块

### 5.0 应用外壳
- 词库 JSON 为独立异步 chunk，App 以「加载中...」门控直到就绪；页面按路由 lazy 拆分
- 未知路径显示 404 页（🤔 + 返回首页）；全局 React Error Boundary（😵 + 回到首页）

### 5.1 首页（/）

- 顶部「谁在学？」profile 切换器（当前孩子名字胶囊，点开可切换/添加/重命名/删除）
- 展示"已掌握 / 待学习"两个数字卡片
- 四个功能入口按钮：
  - **开始今日学习**：进入当日 session（今日完成后置灰）
  - **错题练习**：带红色角标显示错题数量（无错题时置灰）
  - **选择题练习**：随机 10 题多选练习
  - **学习统计**：进度概览 + 每日目标设置
- 底部显示当前每日目标数；有到期复习时显示「今日待复习 N 个」
- 离线时「开始今日学习」「错题练习」置灰并提示需要联网（发音评分是必经环节）；选择题与统计照常可用

---

### 5.2 今日学习（/study）

四个阶段依次进行：

#### 阶段一：展示（show）
- 卡片顶部标签：`复习`（已掌握、到期回流）/ `学习中` / `新词`，有学习记录时带「上次 N 天前」（R8）
- 显示单词、IPA 音标（有值时）、词性（中文）、中文释义、英文例句（目标词或其变形高亮，见 `forms`）、例句翻译
- 进入页面自动播放朗读：**先单词、后例句**连读（预生成英式神经语音，见第六章）
- 右侧喇叭按钮可手动重播（同样是单词 + 例句）
- 按钮文字根据设备能力动态变化：支持录音显示"练习发音 →"，否则直接"开始拼写 →"

#### 阶段二：发音练习（speak）——整句跟读 + 云评分（严格模式）
- 仅在设备支持录音（`getUserMedia` + `MediaRecorder`）时进入；不支持则直接拼写
- 显示单词 + **完整例句**（目标词高亮，含中文翻译），练习的是**整句朗读**
- 喇叭按钮播放单词 + 例句；大圆形麦克风按钮开始录音（点击瞬间解锁页面共用的
  AudioContext，iOS 必需，R6）
- 录音中：按钮变红（方块停止图标）+ 脉冲动画，再点一下停止；30 秒自动停止；
  同一条音频流实时送腾讯智聆评分（第七章）
- 录音完成后：总分进度条（≥90 绿 / ≥60 黄 / 其余红）+ 单词逐个着色 + 鼓励语；
  "我的录音"/"标准发音"回放对比；"再录一遍"；**拿到分数后才出现"继续拼写"**
- 通过线 `PASS_SCORE = 90`（`src/lib/speak.ts`）：≥90 过关；低于 90 继续时该词记一次错并进错题本
  （见"计分口径"）
- 跳过按钮默认隐藏，只在麦克风/录音出错或 30 秒内没完成一次录音时出现；跳过同样记错进错题本
- 没拿到分数（网络、服务异常、未配置）的一次算失败并提示重录，连续 3 次则说明原因、
  中断本次学习回首页；当天评测配额用完（429）显示专门提示并回首页
- 历史：最初用 Web Speech API 做识别评分（Levenshtein 相似度 ≥70 通过），目标设备
  （国产安卓无 Google 服务、iOS 主屏 PWA）上系统识别引擎不可用，2026-07-19 改为录音回放对比，
  同日接入腾讯 SOE 云评分，再按家长反馈改为严格模式（评分必经、不可随意跳过）

#### 阶段三：拼写测试（quiz）
- 隐藏单词，仅显示中文释义 + 例句中文翻译
- 该词 `consecutiveWrong ≥ 2` 时显示提示：每个单词露首字母、其余下划线（如 `i__ c____`）
- 文本框输入英文单词（大写字母不敏感）
- 判定规则（`checkSpelling`）：
  - 消歧注释不需输入：`design (DRAWING)` 输入 `design` 即可
  - 内联可选字母两种拼法都对：`blond(e)` 接受 `blond` / `blonde`
  - 同释义+同词性的同义词也算对：题面只有中文释义无法区分，如「飞机」输入 `plane` 或 `aeroplane` 都对
- 展示规则（`displayWord`）：界面隐藏消歧注释（`design (DRAWING)` 显示为 `design`），内联可选字母保留（`blond(e)` 原样显示）
- 支持 Enter 键提交
- "提交答案"按钮在输入为空时置灰

#### 阶段四：结果（result）
- 答对：绿色卡片 + ✅，自动播放 TTS（单词 + 例句）
- 答错：红色卡片 + ❌，显示用户输入的错误内容，自动播放 TTS（单词 + 例句）
- 无论对错，展示完整单词信息（单词、例句）
- 更新 progress：答对 +1 correctCount，答错 +1 wrongCount；答错时加入错题本
- 按钮：最后一词显示"完成学习 🎉"，其余显示"下一个 →"

#### 完成页面（总结，R7）
- 🎉 "今日学习完成！" + "共 N 个单词 · 拼写对 X 个 · 跟读过关 Y 个"
- "明天待复习 N 个"卡片（统计到明天为止到期、未毕业的已掌握词；0 个时提示明天是新词）；
  今天进错题本的词数
- 本次每个词一行：单词 + 释义，右侧跟读分数胶囊（通过绿 / 未过黄 / 跳过灰）和拼写 ✅/❌；
  点任意一行重新朗读单词 + 例句。数据来自 `currentSession.results`（每词的 speak / speakScore / spelled，
  跟读与拼写阶段分别写入），R7 之前保存的 session 没有该字段，只列单词
- "返回首页"按钮；触发 `completeDailySession()`（通过 useEffect，非 render 内调用）

---

### 5.3 错题练习（/error-bank）

- 从错题本取出所有单词（进入页面时快照），顺序来自加入错题本的先后顺序
- 流程与今日学习一致：（支持录音时）整句跟读 → 拼写 → 结果 → 下一个
- 题目：显示中文释义 + 例句中文翻译；`consecutiveWrong ≥ 2` 时显示首字母提示
- 跟读阶段复用 SentenceSpeak 组件（严格模式同 5.2）；跟读没过关或跳过 → 记一次错，本轮不能移出错题本
- 跟读过关且拼写答对 → 自动从错题本移除，显示绿色"已从错题本移除 ✓"；
  拼写对但跟读没过 → 黄色"拼写正确，但跟读没过关，仍留在错题本"
- 答错 → 留在错题本，显示红色错误提示
- 结果页自动播放朗读（单词 + 例句），喇叭按钮重播相同内容
- 手动删除按钮（"删除错题"）：直接移除，不计入正确记录
- 错题本为空时显示 🌟 空状态页；离线时整页阻断（评分需要联网）
- 待办（ROADMAP R9）：每轮 10 个、进度持久化、列表视图

---

### 5.4 选择题练习（/practice）

- 每次随机从未掌握单词中抽取 **10 题**（所有单词已掌握则从全库随机）
- 每题 4 个选项（1 个正确 + 3 个干扰项）；干扰项**优先同词性**（不足时回退其他词性），
  并排除同释义词条（避免两个选项都对）与同拼写词条
- 题目：显示中文释义 + 例句中文翻译
- 选择后立即反馈：
  - 正确选项高亮绿色
  - 错误选择高亮红色
  - 其余选项变灰
  - 显示正确单词 + TTS 自动播放
- 答错时加入错题本，同时更新 progress
- 完成页面：显示得分 + 百分比进度条 + emoji（≥80% 🏆 / ≥60% 👍 / 其余 💪）
- 支持"再练一组"（刷新页面重新随机）

---

### 5.5 学习统计（/stats）

- **总体进度条**：已掌握 / 1574
- **最近 14 天**：每日答题数柱状图（主色柱、零学习日灰色矮柱、悬停显示日期和题数），
  卡片右上角显示「🔥 连续打卡 N 天」
- **六格数据卡**：
  - 已掌握（绿色）
  - 学习中（黄色）
  - 待复习（橙色，SRS 到期）
  - 已巩固（青绿色，通过全部复习）
  - 错题本数量（红色）
  - 正确率 = 总答对 / 总答题（蓝色）
- **难度分层掌握**：简单/中等/困难三条进度条（已掌握数 / 该档总数）
- **每日目标设置**：4 个快捷选项（10 / 20 / 30 / 50 个），当前值高亮

---

## 六、TTS（发音朗读）

- **优先播放预生成的神经语音**（`src/services/tts.ts` 的 `AudioFirstTTS`，2026-07-19 起）：
  `scripts/generate-audio.py` 用 edge-tts（`en-GB-SoniaNeural`，语速 -10%）为每个词的基础拼写
  和每条例句生成 mp3，文件名 = `sha1(text)` 前 16 位，放在 `public/audio/`（约 3100 个文件、
  44 MB，随仓库提交）；Service Worker 对 `/audio/*.mp3` 做 CacheFirst 运行时缓存（上限 4000 条），
  播放过一次即可离线
- 音频缺失或解码失败（`_redirects` 会把缺失文件改写成 index.html）时退回浏览器原生
  `speechSynthesis`（`en-GB`，语速 0.9）；非安全上下文（无 `crypto.subtle`）直接走回退
- `speakAll(texts[])`：多段顺序播放，学习/错题流程统一为**单词 + 例句**连读；选择题只读单词
  （保持答题节奏）；新的播放会中止上一次（主动中止不触发回退）
- 触发时机：进入展示阶段自动播放；结果页自动播放；各页面喇叭按钮手动触发；总结页点任一行朗读
- 词库改动后运行 `python3 scripts/generate-audio.py` 增量补齐；`npm run validate` 会提示缺失/多余的音频

---

## 七、发音练习（录音对比 + 腾讯智聆云评分）

- 使用 `getUserMedia` + `MediaRecorder` 录音（`src/services/recorder.ts`），
  回放自己的朗读与 TTS 标准发音对比
- 练习对象是**整句例句**（不是单词）：把目标词放进真实语境练习发音
- 容器格式按浏览器能力自选（`audio/mp4` → `audio/webm`），同一浏览器录的
  自己一定能放，无需转码；录音仅存内存（object URL），换词即释放，不落盘
- 停止方式：再点一下麦克风 / 30 秒自动停止 / 跳过或继续时静默取消并释放麦克风
- 权限被拒：提示去系统设置开启麦克风权限，可跳过
- 不支持录音的设备整个 speak 阶段不显示

### 云评分（腾讯智聆口语评测·新版，可选）

- 架构：前端 POST `/api/soe-url`（Cloudflare Pages Function，
  `functions/api/soe-url.ts`）拿**短时效签名 WSS URL**（HMAC-SHA1，有效期 5 分钟），
  浏览器**直连腾讯**流式送音频，密钥只存在服务端，音频不经过我们的服务器
- 采集：录音的同一条 MediaStream 由 Web Audio 分路（`src/services/soe.ts`），
  降采样为 16kHz 单声道 16bit PCM 分块发送；WSS 未连上前的音频先排队不丢失；
  停止录音后发 `{"type":"end"}`，等待 final 结果（10 秒兜底超时）
- 参数：`server_engine_type=16k_en`、`eval_mode=1`（整句）、`score_coeff=1.0`（儿童宽松模式）
- 展示：总分进度条（≥80 绿 / ≥60 黄 / 其余红）+ 单词逐个着色 + 鼓励语；
  评分中显示"正在打分…"
- 评分是必经环节（2026-07-19 家长要求的严格模式）：没拿到分数的一次录音算失败、提示重录；
  连续 3 次拿不到分（未配置 501 / 网络 / 服务异常）则说明原因并中断本次学习，进度已保存；
  离线时学习与错题页整页阻断
- **鉴权与配额**（R1，2026-11）：`/api/soe-url` 必须带 `Authorization: Bearer <token>`——
  已绑定云同步的档案用其 session token，其余设备用 `POST /api/device` 签发的匿名设备令牌
  （存 localStorage `ket-words-device`，服务端 401 时自动重领一次）；`refText` 只接受词库里的例句；
  按主体（`u:<账号>` / `d:<设备>`）与来源 IP 在 D1 `soe_quota` 表按北京时间自然日计数，
  超过 `SOE_DAILY_LIMIT`（默认 300）或 `SOE_IP_DAILY_LIMIT`（默认 1500）返回 429，
  前端显示"今天的发音练习次数已用完"并结束本次学习；设备令牌签发每 IP 每天
  `SOE_DEVICE_IP_DAILY_LIMIT`（默认 20）个。建表见 `migrations/0002_soe_quota.sql`，
  D1 未绑定时接口直接 500（宁可不签也不签无限额的 URL）。建议另在 Cloudflare 控制台
  加 WAF 速率限制规则（如 `/api/*` 同 IP 每分钟 ≤ 30 次）作为最外层兜底
- 配置：`SOE_APP_ID` / `SOE_SECRET_ID` / `SOE_SECRET_KEY`，生产用
  `npx wrangler pages secret put <NAME> --project-name ket-words`，
  本地开发复制 `.dev.vars.example` 为 `.dev.vars`（已 gitignore，同 `SecretKey.csv`）
- 历史：曾用 Web Speech API 识别 + Levenshtein 评分，因目标设备上系统识别引擎
  不可用（国产安卓、iOS PWA），2026-07-19 弃用改为录音对比，同日接入云评分

---

## 八、UI 设计规范

- **主色**：紫罗兰 / 靛蓝（`oklch(0.58 0.22 285)`，相当于 `#7c3aed`）
- **强调色**：柔粉（`oklch(0.88 0.08 320)`）
- **字体**：Geist Variable（可变字体）
- **圆角**：基准 0.75rem，卡片用 `rounded-3xl`，按钮用 `rounded-2xl`
- **最大宽度**：`max-w-lg`（512px），居中，适配手机 / iPad 竖屏
- **深色模式**：已配置 CSS 变量，跟随系统
- 进度条颜色：主色（学习）/ 绿色（正确/通过）/ 黄色（部分正确）/ 红色（错题本）

---

## 九、PWA 与部署

- **Cloudflare Pages**，项目名 `ket-words`；push 到 `main` 自动部署（GitHub Actions 先跑 lint / test / build）
- **Pages Functions + D1**：`functions/api/sync/*`（云同步）、`functions/api/soe-url.ts` 与
  `functions/api/device.ts`（发音评测签名 + 配额）；D1 绑定 `DB` → `ket-words-sync`（`wrangler.toml`），
  建表脚本在 `migrations/`，新增后手动执行
  `npx wrangler d1 migrations apply ket-words-sync --remote`
- `public/_redirects`：所有路径回退到 `index.html`（SPA 路由支持）
- **Service Worker**：`vite-plugin-pwa` 生成，预缓存所有静态资源，离线可用
- **Web App Manifest**：
  - 名称：KET 单词 / KET单词
  - 主题色：`#7c3aed`
  - 背景色：`#faf9ff`
  - 显示模式：`standalone`
  - 方向：`portrait`
- **iOS 支持**：
  - `apple-mobile-web-app-capable`：可添加到主屏幕全屏运行
  - `apple-touch-icon`：192×192 紫色图标
  - `viewport-fit=cover`：适配刘海屏安全区
- **手动部署**（一般不需要）：`npm run build && npx wrangler pages deploy dist --project-name ket-words --commit-dirty=true`
- **密钥**：`SOE_APP_ID` / `SOE_SECRET_ID` / `SOE_SECRET_KEY` 用 `npx wrangler pages secret put` 设置；
  可选配额参数见 `.dev.vars.example`

---

## 十、待实现功能

待办、优先级与排期自 2026-11 起统一维护在 [ROADMAP.md](./ROADMAP.md)；本文只描述当前行为。

已完成并移出本表：云端发音评测（见「七、发音练习」，2026-07-19 接入腾讯智聆 SOE）。

已完成并移出本表：LeanCloud 云同步（见「三、云同步」，2026-07-18）、Bundle 拆分（词库已改为动态 chunk）、错题本加发音练习（错题练习结果页后已接整句跟读 speak 阶段，与 P5 一并实现，2026-07-17）。
