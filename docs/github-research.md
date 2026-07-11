# GitHub 开源斗地主案例调研与本项目采用方案

> 调研日期：2026-07-11（Asia/Shanghai）  
> 调研方式：只读检查 GitHub 仓库主页、GitHub 仓库元数据、README、依赖清单、目录树、许可证文件及关键源码。星标数与最近推送时间是调研时快照，不把星标数单独等同于代码质量。

## 1. 结论先行

本项目不直接改造任意一个开源仓库，而是独立实现浏览器单机版。最值得借鉴的三个样本各自解决不同问题：

1. [datamllab/rlcard](https://github.com/datamllab/rlcard) 用于校对规则引擎的职责拆分、合法动作枚举、回合状态和测试边界。
2. [kwai/DouZero](https://github.com/kwai/DouZero) 用于借鉴“先生成全部合法动作，再对候选动作评分”的 AI 管线，以及地主、地主上家、地主下家的角色差异。
3. [svzdev/doudizhu](https://github.com/svzdev/doudizhu) 用于借鉴经典牌桌布局、选牌/发牌动效、音效触发点和完整对局状态机。

另外核验了 Vue、Cocos、纯 JavaScript 规则库和权重式 AI 等四个交叉样本。最终代码应当自研，尤其不能复制许可证不明的代码或任何来源不清、仅允许学习使用的牌面、美术、语音素材。

## 2. 候选仓库总览（7 个）

### 2.1 基本情况、维护状态与许可证

| 仓库 | 定位与规模信号 | 主要技术栈 / 状态管理 | 最近推送（GitHub `pushed_at`） | 许可证核验 | 结论 |
|---|---|---|---|---|---|
| [svzdev/doudizhu](https://github.com/svzdev/doudizhu) | 完整 HTML5 联网斗地主；519★、218 forks | React 17 + Phaser 3 + Redux；Python/Tornado + WebSocket + SQLAlchemy/aiomysql + MySQL。前端 Redux 与 Phaser 场景并存，服务端由 `Room`/`Player` 保存权威状态 | 2026-06-17 | 仓库没有独立 `LICENSE`，GitHub API 未识别许可证；README 只有 MIT 徽章 | 可深挖设计，不复制代码或资产 |
| [datamllab/rlcard](https://github.com/datamllab/rlcard) | 学术/工程化卡牌环境；3,509★、750 forks、875 commits；含斗地主测试 | Python + NumPy；`Game`、`Round`、`Dealer`、`Player`、`Judger` 对象管理状态，环境输出结构化 observation | 2024-06-26 | [MIT](https://github.com/datamllab/rlcard/blob/master/LICENSE.md) | 规则和测试架构的首要参考 |
| [kwai/DouZero](https://github.com/kwai/DouZero) | ICML 2021 斗地主 AI；4,614★、650 forks | Python + PyTorch + NumPy；`GameEnv`/`InfoSet` 保存牌局，DMC 自博弈训练，三个位置分别建模 | 2024-06-26 | [Apache-2.0](https://github.com/kwai/DouZero/blob/main/LICENSE) | AI 管线参考，不引入模型运行时 |
| [voocel/ddz-vue](https://github.com/voocel/ddz-vue) | 多人实时 Vue 客户端；27★、9 forks；README 声称含 AI/托管/重连 | Vue 2 + Vuex 3 + Router + Axios + WebSocket + Element UI；实际 Vuex 只注册 `user` 模块，游戏状态主要落在房间组件和服务端消息 | 2021-01-19 | 无 `LICENSE`，GitHub API 未识别许可证 | 只参考组件拆分和音效触发点 |
| [dixonzhang/cocos-doudizhu](https://github.com/dixonzhang/cocos-doudizhu) | 早期可视化原型；78★、54 forks | Cocos Creator 1.3 + JavaScript；Node/Express + Socket.IO；全局 `Grobal`、Cocos 组件与服务端对象混合保存状态 | 2017-05-02 | 无 `LICENSE` | 只参考拖选交互，不照搬旧 API/架构 |
| [linzhipeng/doudizhu](https://github.com/linzhipeng/doudizhu) | 小型 JS 斗地主算法包；57★、23 forks | 单文件 CommonJS；模块级牌堆状态，函数直接洗牌、发牌、识别、比较和排序 | 2017-04-21 | 根目录 [LICENSE 为 MIT](https://github.com/linzhipeng/doudizhu/blob/master/LICENSE)，但 `package.json` 写 ISC，存在元数据冲突 | 可作规则交叉样本，不作为实现底座 |
| [ZhouWeikuan/DouDiZhu](https://github.com/ZhouWeikuan/DouDiZhu) | 完整 Cocos2d-x/Lua/C++ 客户端和权重 AI；320★、113 forks | Cocos2d-x + Lua + C++，Skynet/Protobuf 思路；桌状态、Lua UI 与 C++ AI 分层 | 2019-06-03 | 代码 [Apache-2.0](https://github.com/ZhouWeikuan/DouDiZhu/blob/master/LICENSE)；README 明确图片、声音归作者/公司且不得商业使用或再发布 | 只借鉴 AI 思路，绝不复制资源 |

注：GitHub 仓库的 `updated_at` 会被星标、议题等活动刷新，不能代表源码仍在维护；因此上表采用更能反映代码变化的 `pushed_at`。这些仓库均未标记 archived，但除 `svzdev/doudizhu` 外，核心代码最近推送均已超过两年。

### 2.2 牌、规则、AI 与表现层对照

| 仓库 | 牌结构 / 发牌 / 排序 | 牌型识别与比较 | AI | UI、动画、音效 | 关键目录 |
|---|---|---|---|---|---|
| svzdev/doudizhu | 实体牌 ID 1–54；服务端随机洗牌后 17×3，余 3 张底牌；点数序列为 `3…A,2,*,\$`，手牌按点数排序 | `rule.py` + JSON 规则表负责牌型、比较、提示；服务端再次检查“牌在手中”“不能领出时 pass”“是否压过上手” | 规则式 `find_best_shot` / `find_best_follow`，房间可补机器人 | Phaser 牌桌、Tween 发牌与底牌移动、点击/拖动抬牌；含背景、发牌、叫分、胜负音频 | `client/src/game`、`server/api/game`、`server/api/game/extra`、`client/public/assets` |
| RLCard | `Card` 对象建 54 张牌；紧凑字符串 `345…2BR` 表示动作；17×3 + 3；按 `CARD_RANK` 比较排序 | `Judger` 从手牌枚举所有合法组合；预生成 `CARD_TYPE`/`TYPE_CARD`；跟牌只保留同型同长度更大牌及炸弹/王炸 | 内置朴素规则 agent，也能接 DMC/CFR/DQN 等；斗地主规则 agent 会考虑队友是否刚出牌 | 斗地主核心无图形 UI/动画/音效 | `rlcard/games/doudizhu`、`rlcard/models/doudizhu_rule_models.py`、`tests/games/test_doudizhu_*` |
| DouZero | 整数点数：3–14、17 表示 2、20/30 表示双王；洗牌后地主 20 张、两农民各 17 张；动作是排序整数数组 | `move_detector` 识别 15 类（含错误类），`move_generator` 枚举候选，`move_selector` 按上手类型/长度/主值过滤，并加入炸弹/王炸 | 三个位置各一套 LSTM+全连接价值网络；对每个合法动作编码并取预测值最大者 | 无产品 UI、动画或音效；仓库中的图片仅为项目 Logo | `douzero/env`、`douzero/dmc`、`douzero/evaluation` |
| ddz-vue | UI 卡对象含 `label`；排序顺序 `3…K,A,2,0`，用 `0` 表示王，具体花色/王别依赖其他字段和服务端 | `poker.js` 用相同点数计数识别单/对/三/炸/王炸/顺子/连对/飞机等；完整合法性和比较仍依赖配套服务端 | README 声称服务端为权重式 AI；客户端没有独立、完整 AI | 房间组件齐全；含叫/抢/不出/炸弹/飞机/胜负等大量音频，`Fade.vue` 和爆炸图片承担表现 | `src/views/room`、`src/utils/poker.js`、`src/store`、`src/assets` |
| cocos-doudizhu | `Poker{colourType,num,value,sortValue}`；服务端 Fisher–Yates 洗 54 张，17×3 + 3；花色小数只用于稳定展示排序 | 先把各点数张数编码成 `a/b/c/d` 模式，再映射到单、对、三、四带、顺子、连对、飞机、炸弹并比较主值 | 无成熟单机 AI，侧重多人房间 | Cocos 场景/Prefab；支持点击、拖拉选牌、双击复位；资产仅牌图，未见完整音效系统 | `assets/Scene`、`assets/Script`、`server/poker_manager.js`、`server/poker_play.js` |
| linzhipeng/doudizhu | 0–53 的牌 ID；提供洗牌、17×3 + 3、普通排序和权重排序；排序会原地修改输入 | `getCardType` 返回 `cardType`、类型权重、主牌权重；`beat` 比较两手牌；覆盖经典常见牌型 | 无 AI | 只有 `demo.html`，无正式牌桌、动画或音效 | `doudizhu.js`、`demo.html` |
| ZhouWeikuan/DouDiZhu | 1–54 实体牌 ID（另有地方玩法花牌）；点数/花色映射清晰，C++ 维护手牌与历史 | C++ `AINode`/`LordCards` 枚举牌型和提示，按“出完需要的手数、剩余牌权重”等计算 | 权重分解 + 缓存；区分地主、上家、下家、队友/敌人、尾牌和炸弹时机 | 场景、Spine 特效、男女语音、背景音乐非常完整，但艺术资源不允许复用 | `code/src/app`、`code/frameworks/runtime-src/Classes`、`code/res` |

## 3. 深挖一：RLCard——规则引擎和测试结构

### 3.1 目录和职责

[斗地主目录](https://github.com/datamllab/rlcard/tree/master/rlcard/games/doudizhu) 把职责拆为：

- [`dealer.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/dealer.py)：建牌、洗牌、17 张分发和底牌归属。
- [`game.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/game.py)：初始化、`step`、终局、状态读取和回退入口。
- [`round.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/round.py)：当前玩家、最大出牌者、公开牌、出牌轨迹和回退。
- [`player.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/player.py)：手牌、角色、可行动作、出牌/撤销。
- [`judger.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/judger.py)：从当前手牌枚举所有可出组合并判断终局。
- [`utils.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/utils.py)：点数顺序、动作空间、牌型映射、包含关系和“能压过上手”的过滤。

这种拆分很适合本项目：规则函数不依赖 DOM，UI 只消费状态和派发动作，因此规则可被单元测试覆盖。

### 3.2 状态流

`Game.init_game()` 创建三个 Player、Round 和 Judger；`Game.step(action)` 让 Round 推进一步，更新当前最大出牌者，Judger 删除已经不可能从剩余手牌组成的合法动作，随后生成下一位玩家可见的状态。状态包括本人手牌、其他人牌数、公开底牌、历史动作、已出牌和合法动作。`trace` 与每步移除牌的记录还支持 `step_back()`。

本项目应借鉴“单一对局状态 + 纯动作变更”，但无需实现研究环境的回退训练接口。浏览器版只需保留用于复盘/调试的不可变历史快照。

### 3.3 发牌和排序的关键限制

RLCard 确实使用完整 54 张牌，按 `3 < 4 < … < A < 2 < 小王 < 大王` 排序，并给三位玩家各 17 张、地主追加 3 张。然而 [`dealer.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/dealer.py) 当前直接把 `players[0]` 设为地主，真实叫分逻辑被注释掉。

因此不能照搬其开局流程。本项目必须自行实现经典叫地主阶段：三人依次选择不叫/1/2/3 分，最高叫分者为地主；无人叫分则重新洗牌；3 分立即结束叫分。

### 3.4 牌型识别和比较

Judger 先按点数计数，再系统枚举：

- 单张、对子、三张、炸弹、王炸；
- 三带一、三带一对；
- 5–12 张顺子、3–10 组连对、2–6 组三顺；
- 飞机带单、飞机带对；
- 四带二单、四带二对。

序列遇到 `2/小王/大王` 会停止。跟牌时，[`get_gt_cards`](https://github.com/datamllab/rlcard/blob/master/rlcard/games/doudizhu/utils.py) 从上手的牌型和主值出发，返回同型更大的牌，并追加炸弹、王炸；王炸之后只可 pass。这验证了本项目比较函数应返回结构化信息 `{type, mainRank, length, cards}`，不能只用一个“总权重”粗暴比较。

### 3.5 AI 和测试

[`doudizhu_rule_models.py`](https://github.com/datamllab/rlcard/blob/master/rlcard/models/doudizhu_rule_models.py) 的朴素 AI 领出时偏向包含最小牌的组合，跟牌时选同型最小可压动作；当农民面对队友刚出的牌时倾向 pass。这个角色意识值得保留，但其后备逻辑会随机选合法动作，强度不适合作为最终体验。

RLCard 有独立的 [斗地主环境测试](https://github.com/datamllab/rlcard/blob/master/tests/envs/test_doudizhu_env.py)、[对局测试](https://github.com/datamllab/rlcard/blob/master/tests/games/test_doudizhu_game.py) 和 [Judger 测试](https://github.com/datamllab/rlcard/blob/master/tests/games/test_doudizhu_judger.py)。本项目采用表驱动测试覆盖合法/非法牌型、同型不同长度、2/王进入顺子、炸弹跨型、王炸、连续两次 pass 和非法动作状态不变等边界。

### 3.6 可借鉴与不可照搬

可借鉴：职责拆分、合法动作生成、结构化观察、历史轨迹、规则测试矩阵。  
不可照搬：固定 27,472 动作的研究编码、解压 JSON 动作全集、硬编码 0 号地主、训练/回退接口、Python 运行时。

## 4. 深挖二：DouZero——合法候选到动作评分的 AI 管线

### 4.1 牌和状态表示

[`generate_eval_data.py`](https://github.com/kwai/DouZero/blob/main/generate_eval_data.py) 构造的牌值是：3–14 表示 3 到 A，17 表示 2，20/30 表示小王/大王；普通点数各四张，双王各一张。洗牌后地主直接取 20 张、两名农民各 17 张，`three_landlord_cards` 记录地主 20 张中的第 18–20 张。

[`GameEnv`](https://github.com/kwai/DouZero/blob/main/douzero/env/game.py) 保存三方手牌、当前行动位置、最后有效出牌者、各方最后动作、完整动作历史、已出牌、剩余张数和炸弹数；`InfoSet` 再为当前玩家生成可观察信息。领出玩家固定按 `landlord → landlord_down → landlord_up` 循环。

和 RLCard 一样，这个核心环境跳过叫地主，所以只适合出牌阶段参考。

### 4.2 规则管线

DouZero 把规则拆得非常清楚：

1. [`move_generator.py`](https://github.com/kwai/DouZero/blob/main/douzero/env/move_generator.py) 从手牌枚举单、对、三、炸、王炸、三带、顺子、连对、飞机、四带等全部候选。
2. [`move_detector.py`](https://github.com/kwai/DouZero/blob/main/douzero/env/move_detector.py) 把任意动作识别为具体类型、主点数和序列长度，非法动作进入 `TYPE_15_WRONG`。
3. [`move_selector.py`](https://github.com/kwai/DouZero/blob/main/douzero/env/move_selector.py) 根据对手动作的类型、主值和长度筛出可压动作；炸弹和王炸走特殊通道。

这比“AI 自己随便拼牌再验证”可靠。最终项目也应让人类提示和电脑 AI 共用同一个合法动作生成器，从源头避免 AI 出非法牌。

### 4.3 模型如何选牌

[`deep_agent.py`](https://github.com/kwai/DouZero/blob/main/douzero/evaluation/deep_agent.py) 对每一个合法候选动作构造一条特征，送入对应位置的模型，最后用 `argmax` 选择预测价值最高的动作。模型在 [`models.py`](https://github.com/kwai/DouZero/blob/main/douzero/dmc/models.py) 中按地主、地主上家、地主下家分为三套网络：历史动作经过 128 维 LSTM，其余局面与候选动作特征进入多层全连接网络，输出该动作的价值。

真正值得采用的不是神经网络本身，而是接口：

```text
局面状态 -> generateLegalMoves() -> score(move, state, role, difficulty) -> 选最高分动作
```

本项目可用快速、可解释的启发式替代模型：减少剩余出牌手数、避免无必要拆炸弹/王炸、优先一次走完、阻断只剩 1–2 张牌的敌人、农民不无故压队友、危急局面允许拆牌。难度通过评分项和随机温度调整，而不是下载数百 MB 权重。

### 4.4 为什么不直接接入 DouZero

- 依赖 PyTorch、模型权重和 Python 服务，不符合“打开浏览器即可运行”。
- 训练默认面向 GPU/多进程，自带大量本项目不需要的训练设施。
- 核心出牌环境不负责叫地主、完整产品结算、UI、动画和音效。
- 模型很强但不透明，低难度和“像经典休闲游戏”的可控体验反而较难调。

可借鉴：规则三段式、位置专用策略、历史动作特征、合法候选逐一评分。  
不可照搬：PyTorch 网络、训练脚本、预训练权重、GPU/多进程设施和固定研究数据格式。

## 5. 深挖三：svzdev/doudizhu——完整牌桌与联网状态机

### 5.1 技术栈和目录

[`client/package.json`](https://github.com/svzdev/doudizhu/blob/master/client/package.json) 显示前端使用 React 17、Phaser 3.16、Redux 4；README 显示后端为 Python/Tornado/MySQL。目录按 `client`、`server`、`screenshot` 分开：

- `client/src/game/game.js`：Phaser 场景、服务器消息到动画/交互的编排。
- `client/src/game/player.js`：手牌、抬牌、提示、发牌和整理牌面。
- [`client/src/game/store.js`](https://github.com/svzdev/doudizhu/blob/master/client/src/game/store.js)：桌、玩家、手牌位置和牌面帧的 Redux reducer。
- [`client/src/game/net.js`](https://github.com/svzdev/doudizhu/blob/master/client/src/game/net.js)：WebSocket 协议和 JSON 收发。
- [`server/api/game/room.py`](https://github.com/svzdev/doudizhu/blob/master/server/api/game/room.py)：房间权威状态、发牌、抢地主、出牌、倍数、春天和结算。
- [`server/api/game/player.py`](https://github.com/svzdev/doudizhu/blob/master/server/api/game/player.py)：玩家状态机、超时、断线和手牌变更。
- [`server/api/game/rule.py`](https://github.com/svzdev/doudizhu/blob/master/server/api/game/rule.py)：牌型、比较、提示和机器人启发式。

### 5.2 状态机与服务端校验

玩家状态大致为 `INIT → WAITING → CALL_SCORE → PLAYING → GAME_OVER`。房间记录 `whose_turn`、`landlord_seat`、`last_shot_seat`、`last_shot_poker`、`shot_round`、计时器和多种倍数。服务端出牌时依次验证：所选牌确实在手中、牌型合法、不是领出者时必须压过上手、上一位有效出牌者不能 pass。出完手牌后再计算胜负、春天/反春天与分数。

这个“UI 先反馈、规则层最终裁决”的思想可借鉴；本项目是单机版，无需网络双重校验，但仍应让所有输入统一经过 `canPlay`，不能让按钮事件直接改数组。

### 5.3 UI、选牌、动画和音效

[`player.js`](https://github.com/svzdev/doudizhu/blob/master/client/src/game/player.js) 把选中的牌上移，支持拖过多张牌连续选择；发牌使用 Tween 和逐张延迟；地主底牌先展示，再移动到地主手中并重新排序。素材目录含背景音乐、房间音乐、发牌、叫分、胜负等音频。

适合本项目采用的表现节奏：

- 初始 54 张牌背居中，约 0.8–1.2 秒完成发牌；
- 人类手牌重叠扇开，点击/拖动上移 12–18 px；
- 底牌翻开后短暂停顿，再并入地主手牌；
- 出炸弹、王炸、飞机时播放一次短特效和音效；
- AI 思考设置 350–900 ms 的人为延迟，避免瞬间出牌显得机械。

### 5.4 代码质量与许可证风险

该仓库有明显的演进痕迹：README 的 clone 地址仍是旧所有者 `mailgyc/doudizhu`；Redux reducer 中存在数组/对象初始形态不一致、可疑的 `filter` 条件等代码；前端同时保留 React/Redux 与 Phaser 内部可变状态，容易形成双状态源。它适合观察产品流程，不适合直接作为现代单机项目底座。

更关键的是，根目录没有许可证文件，GitHub API 的 `license` 为 `null`。README 的 MIT 图片徽章不是等同于完整、明确的许可证文本，素材也没有单独授权说明。因此本项目只能借鉴抽象交互，不复制源码、牌图或音频。

可借鉴：经典布局、状态阶段、服务端式统一校验、选牌和发牌节奏、音效触发清单。  
不可照搬：账号/大厅/MySQL/联网房间、React 与 Phaser 双状态源、旧依赖、源码和资产。

## 6. 其他交叉样本的具体价值

### 6.1 voocel/ddz-vue

[`package.json`](https://github.com/voocel/ddz-vue/blob/master/package.json) 和 [房间组件目录](https://github.com/voocel/ddz-vue/tree/master/src/views/room) 证明它是 Vue 2 + Vuex + WebSocket 的组件化客户端，房间拆成 `Room`、`HandCard`、`OutCard`、`Action`、`User`、`Music`、`Settle` 等。这个组件边界值得参考。

但 [`store/index.js`](https://github.com/voocel/ddz-vue/blob/master/src/store/index.js) 实际只装配用户模块，游戏状态并未形成统一 Vuex 对局模块；[`poker.js`](https://github.com/voocel/ddz-vue/blob/master/src/utils/poker.js) 只承担部分客户端牌型识别，完整比较、AI 和权威状态位于另一个服务端仓库。加之没有许可证，本项目不复制其组件或音频，只借鉴“手牌区/出牌区/操作区/结算层”的视觉分区。

### 6.2 dixonzhang/cocos-doudizhu

[`poker_manager.js`](https://github.com/dixonzhang/cocos-doudizhu/blob/master/server/poker_manager.js) 使用对象牌、Fisher–Yates 洗牌和 17×3+3 分发；[`poker_play.js`](https://github.com/dixonzhang/cocos-doudizhu/blob/master/server/poker_play.js) 通过相同点数张数模式识别常见牌型；[`playing.js`](https://github.com/dixonzhang/cocos-doudizhu/blob/master/assets/Script/playing.js) 实现选牌、双击复位、抢地主与出牌按钮。README 还明确列出拖拉选牌。

它依赖 Cocos Creator 1.3、全局变量、`eval` 和旧 Socket.IO 事件，2017 年后无源码推送且无许可证。只能借鉴拖选手势，不应照搬实现。

### 6.3 linzhipeng/doudizhu

[`README`](https://github.com/linzhipeng/doudizhu/blob/master/README.md) 展示了非常直接的 API：`getShuffleCards`、`dealCards`、`getCardType`、`beat`、`weightSort`。这提示本项目规则模块也应提供小而稳定的 API，而不是把规则散落在 UI 事件中。

不足是单文件、模块级可变牌堆、排序原地修改、没有有效测试脚本，且 LICENSE(MIT) 与 package.json(ISC) 不一致。用它交叉核对牌型命名即可，不采用其内部实现。

### 6.4 ZhouWeikuan/DouDiZhu

它最有价值的是 README 对权重 AI 的完整解释：把手牌拆成若干“手”，用缓存减少重复拆分；提示动作不仅看当前牌大小，还比较出牌后剩余手牌的权重；农民策略会区分队友/敌人、地主上下家和尾牌。代码入口包括 [`YunChengAI.cpp`](https://github.com/ZhouWeikuan/DouDiZhu/blob/master/code/frameworks/runtime-src/Classes/YunChengAI.cpp) 与 [`LuaYunCheng.cpp`](https://github.com/ZhouWeikuan/DouDiZhu/blob/master/code/frameworks/runtime-src/Classes/LuaYunCheng.cpp)。

但仓库含整套旧 Cocos2d-x、Lua/Protobuf/原生平台工程，体积和构建复杂度很高，而且实现的是带地方规则的“运城斗地主”，并非完全等同于经典玩法。README 明确声明图片和声音不得商业使用或再发布；这些资产即使和 Apache-2.0 代码放在同一仓库，也不能复制进本项目。

## 7. 许可证与资产风险结论

1. MIT 或 Apache-2.0 允许在满足保留版权/许可证等条件下复用代码，但本项目仍选择独立实现，减少兼容和归因负担。
2. `svzdev/doudizhu`、`voocel/ddz-vue`、`dixonzhang/cocos-doudizhu` 没有明确根许可证；公开可读不等于获得复制、修改、再分发权。
3. `linzhipeng/doudizhu` 的 LICENSE 与 package 元数据冲突；若真要复用，必须保留 LICENSE 并进一步确认作者意图。
4. 代码许可证通常不自动覆盖商标、人物、牌背、美术、字体、音乐和语音。`ZhouWeikuan/DouDiZhu` 已明确把资源排除在 Apache 授权之外。
5. 本项目不下载或复制任何仓库的牌图、角色图、Logo、音乐、语音和特效；视觉和音效必须自制、程序生成，或使用另有明确可再分发许可证的素材并单独记录来源。

## 8. 本项目最终采用的设计

### 8.1 规则与牌数据

- 牌对象采用 `{id, suit, rank}`；`id` 唯一，规则比较只看数值 `rank`，花色仅负责显示与区分实体牌。
- 牌序固定为 `3 < 4 < … < K < A < 2 < 小王 < 大王`；顺子、连对、飞机不得包含 2 或王。
- 使用本地 Fisher–Yates 洗牌，三人各 17 张、3 张底牌；叫地主完成后把底牌并入地主并重新排序。
- `analyzeHand(cards)` 返回结构化牌型；`canBeat(next, previous)` 只比较同型、同长度和主点数，炸弹/王炸走明确的特殊规则。
- `generateLegalMoves(hand, previous)` 是提示、人类校验和 AI 的唯一合法动作来源。

### 8.2 对局状态机

```text
MENU -> BIDDING -> PLAYING -> FINISHED
```

发牌和底牌揭晓是阶段切换时的视觉反馈，不额外阻塞规则状态机。状态包含三方手牌、角色、底牌、当前玩家、上一手有效牌/玩家、连续 pass 数、出牌历史、叫分、炸弹数和胜负。任何 UI 交互只调用 `GameState` 动作；DOM 和 AI 都不直接修改手牌数组。异步 AI 还会校验 `roundId` 与 `revision`，防止重开后的旧计时器继续落子。

### 8.3 AI

沿用 DouZero 的管线但不用神经网络：

1. 生成全部合法动作；
2. 对每个动作模拟出牌后的剩余手牌；
3. 评分剩余手数、孤张、大牌控制力、炸弹保护、一次走完、对手剩余张数与农民协作；
4. 三档难度共用合法候选生成器，仅调整结构保护、威胁判断、队友协作和炸弹惩罚等可解释权重。

角色策略至少包括：地主阻止任一农民走完；农民通常不压队友；地主只剩 1 张时优先控制单牌，剩 2 张时避免轻易送对子；能一次走完时立即出完；普通局面不随意拆炸弹，危急局面可拆牌或用炸弹。

### 8.4 UI、动画与音效

- 采用浏览器原生 DOM/CSS 或现有项目框架，不引入 Phaser/Cocos 运行时。
- 经典绿色牌桌，左右两名电脑、底部玩家、顶部底牌与阶段信息，中部为上一手牌区，操作按钮固定在玩家手牌上方。
- CSS transition/keyframes 完成发牌、选牌抬起、出牌滑入、炸弹震动、胜负结算；尊重 `prefers-reduced-motion`。
- 音效只使用自制/程序生成的短提示音，设置中支持音乐、音效和静音；不得复用调研仓库中的音频。
- 布局兼容常见桌面、移动横屏与窄竖屏，关键按钮触摸目标不小于约 44 px；手牌支持点击选择、再次点击取消和键盘方向键移动焦点。

### 8.5 测试与验收

- 对每种牌型分别准备合法、非法、边界和比较用例。
- 自动化验证合法候选、三档 AI、固定种子完整对局、牌数守恒、轮次死锁和重复牌 ID。
- 对无人叫分重发、3 分立即结束、两次 pass 重置轮次、非法动作状态不变和立即结算做专项测试。
- 真实浏览器验收主菜单、弹窗、发牌、点击选牌、提示、出牌、不出、完整胜负、重新开始、声音开关、窄屏和刷新后的安全状态。

## 9. 一句话的借鉴边界

借鉴 RLCard 的规则分层，借鉴 DouZero 的“合法候选 + 角色评分”，借鉴 svzdev/doudizhu 的经典对局节奏和牌桌交互；不复制任何仓库的产品代码、旧联网架构或美术音频资产。
