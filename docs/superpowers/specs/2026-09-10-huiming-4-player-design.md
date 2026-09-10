# 晦明多人化（2~4 人）— 设计文档

- 日期：2026-09-10
- 主题：把晦明从写死的 2 人扩展为 2~4 人混战，规则本身不变
- 状态：已获用户确认（方案 A：就地泛化）

## 背景与目标

晦明当前虽然已经在插件元数据里声明了 `minPlayers: 2, maxPlayers: 4`，但游戏引擎整体是按 2 人写死的：`HuimingState.players` 是二元组，`currentTurn` 是 `0 | 1`，回合切换写死 `1 - currentTurn`，平局判定只比较 `players[0]` 和 `players[1]`，客户端视图只暴露单个对手。

后果：房间层允许创建 3~4 人的晦明房间并开局（`socket-framework.ts:416` 只校验 `players.length < minPlayers`），但 `initHuimingGame(players[0], players[1])` 会静默丢弃第 3、4 名玩家，被丢弃的玩家永远收到「不是你的回合」，无法参与游戏。

目标：让 2、3、4 人都能正常开局并完整进行，**规则本身不做任何修改**。2 人局必须与现状完全一致。

## 设计决策

1. **对战形式**：4 人混战（FFA），各自为战，先达成胜利条件者单独获胜。
2. **胜利条件**：保持不变 —— 集齐某花色 6 张（Joker 万能）。棋盘仍为 5×5、牌堆仍为 25 张、素材与渲染路径不动。接受「4 人局触发该条件的概率较低、多数对局会走到牌堆取空后的比大小」这一后果。
3. **实现路径**：方案 A —— 就地泛化。保留唯一一套引擎/规则/插件，把 2 人假设替换为 N 人循环，2 人局走同一代码路径。
4. **人数范围**：通用 N 人实现，支持 2、3、4 人，不新增按人数分支的配置。

## 一、数据模型（`games/huiming/types.ts`）

| 字段 | 现在 | 改为 |
|------|------|------|
| `HuimingState.players` | `[HuimingPlayer, HuimingPlayer]` | `HuimingPlayer[]` |
| `HuimingState.currentTurn` | `0 \| 1` | `number` |
| `HuimingClientState.myPlayerIndex` | `0 \| 1` | `number` |
| `HuimingClientState.currentTurn` | `0 \| 1` | `number` |
| `HuimingClientState.opponentId` | `string` | 删除 |
| `HuimingClientState.opponentHandCount` | `number` | 删除 |
| `HuimingClientState.opponents` | — | 新增 `{ index: number; id: string; handCount: number }[]` |

`opponents` 按座位序排列、不含自己；带 `index` 是为了让 UI 能判断「当前轮到哪个对手」。对手手牌的具体牌面依旧不下发，只给数量。

`players` 数组下标继续充当座位号，`currentTurn` 是该数组的下标。

## 二、引擎（`games/huiming/engine.ts`）

- `initHuimingGame(p1: string, p2: string)` → `initHuimingGame(players: string[])`：按数组生成 `HuimingPlayer[]`，`currentTurn` 初始为 `0`，其余初始状态不变（每人 0 手牌、1 次暗取、`canPlace = true`）。
- `grantDarkPickCharges(game)`：由「给 `players[0]`、`players[1]` 各加一次」改为「遍历 `game.players` 各加一次」。这是规则 2「双方玩家都将获得一次」在 N 人下的直接推广（所有玩家各获得一次）。
- `flipNeighbors` / `checkAllFaceDown` / `countRemainingCards` / `takeCard` / `placeCard` 均与人数无关，不改。
- 棋盘仍为 5×5、`HUIMING_DECK_CONFIG` 不变。

## 三、规则校验（`games/huiming/rules.ts`）

**不改动。** `checkWinner(player)` 针对单个玩家、`countMaxSuit(hand)` 针对单个手牌列表，本来就与人数无关。反复检查确认没有 2 人假设。

## 四、插件状态机（`games/huiming/plugin.ts`）

### 4.1 基础泛化

- `createInitialState(players)` → `initHuimingGame(players)`（传入整个数组）。
- `playerIdx` 的类型从 `as 0 | 1` 改为 `number`；新增 `-1` 保护，返回错误「玩家不在游戏中」（与 nimmt 插件一致）。
- 回合轮转统一为 `(currentTurn + 1) % game.players.length`。
- `getClientState`：`idx` 取 `findIndex`，`myPlayerIndex: idx`，`opponents` 由 `state.players.map((p, index) => ...).filter(o => o.index !== idx)` 生成。

### 4.2 需要规则补全的三处（原文只写了「双方」）

以下三处是原文规则在 N 人下未定义、需要补一个解释的地方：补全一是直接的措辞推广，补全二和补全三决定了 N 人局如何收场，均已向用户说明并获认可。

**补全一 —— 全暗补偿（规则 2）**
原文「双方玩家都将获得一次暗取能力」→ 所有玩家各获得一次。实现即 `grantDarkPickCharges` 遍历全员。

**补全二 —— 牌堆取空后的比大小（规则 8 前半段）**
原文「比较双方手牌中拥有最多同花色牌的数量，较多者获胜」。N 人实现：

1. 对每个玩家计算 `countMaxSuit(hand)`；
2. 取其中的最大值；
3. **唯一达到最大值者获胜**（`phase = 'ended'`，`winner` 设为该玩家 id）；
4. 若**多人并列最大**，判定为平局，进入续放轮（规则 8 后半段）。

2 人局下这与现有实现完全等价：现在就是 `p0Max !== p1Max` 时分胜负、相等时续放。

**补全三 —— 续放轮的先手（规则 8 后半段）**
原文「由上一轮的后手方优先」。2 人实现里体现为 `currentTurn = 1 - currentTurn`，而此刻 `currentTurn` 就是刚刚取走最后一张牌的玩家，所以等价于「最后取牌者的下一位」。N 人实现沿用同一语义：`currentTurn = (最后取牌者 + 1) % 玩家数`。

进入续放轮时：`round++`、`phase = 'placing'`、`hasTakenThisTurn = false`、所有玩家 `canPlace = true`。

### 4.3 取牌收尾的抽取（消除既有重复）

`take` 和 `darkPick` 两个分支现在包含完全相同的收尾代码（胜利判定 → 棋盘取空 → 比大小 → 轮转）。泛化后这段逻辑更长，两份拷贝容易分叉，因此抽出一个内部函数，两个分支共同调用：

```ts
/**
 * 取牌后的统一收尾：
 *   1. 集齐 6 张 → 该玩家获胜，游戏结束
 *   2. 棋盘还有牌 → 轮转下一位
 *   3. 棋盘取空 → 比大小：唯一最大者获胜，并列最大则进入续放轮
 */
function resolveAfterTake(game: HuimingState, playerIdx: number): void
```

这是本次改动中唯一的主动性整理，理由是避免同一段 N 人判定逻辑写两遍。

### 4.4 续放阶段（`place`）与空手牌跳过

续放阶段原有的「双方轮流放牌、放满为止」逻辑改成 N 人，并新增空手牌跳过：

- 新增内部函数 `findNextPlayerWithCards(game, from)`：从 `from` 的下一位开始环形查找第一个手牌非空的玩家索引，都不存在则返回 `-1`。
- 当前玩家手牌为空时：跳到 `findNextPlayerWithCards` 的结果；若为 `-1`（所有人都已无牌），则 `currentTurn` 设为 `(当前 + 1) % 人数`、`phase = 'taking'`、`hasTakenThisTurn = false`。
- 当前玩家有手牌时：`placeCard` 放牌，随后把所有玩家的 `canPlace` 重置为 `true`（续放不受规则 6 限制）；棋盘已满 → 回到 `taking`；否则跳到下一位有手牌的玩家。

这同时修掉一个既有隐患：2 人局中若某玩家在续放阶段先放完手牌，轮到他时 UI 没有任何可点的牌，流程会卡死。加上自动跳过后，服务端不再依赖玩家主动「空操作」来推进。

`taking` 阶段的放牌分支（规则 6：必须先放牌再取牌）与人数无关，不改。

## 五、客户端 UI（`games/huiming/ui/`）

- `HuimingGame.tsx`：把单个对手的 `PlayerInfo` 换成一行 N-1 个对手信息，每个显示名字（`playerNames[o.id] ?? '对手'`）、手牌数和回合高亮（`isTurn = s.currentTurn === o.index`）。新增容器 `.huiming-opponents`。
- 胜利文案：`s.winner === playerId ? '你赢了！' : \`${playerNames?.[s.winner] ?? '对手'} 获胜\``。删掉原来的 `opponentName` 变量。
- `isMyTurn = s.currentTurn === s.myPlayerIndex` 保持写法不变，改成数字比较后依然成立。
- `HuimingBoard.tsx`：**不改**（棋盘仍是 5×5，`cols={5}`）。
- `HuimingGame.tsx` 里移除了对 `opponentHandCount` / `opponentId` 的引用（这两个字段被删除）。
- `styles.css`：新增 `.huiming-opponents` 容器样式（横向排列、可换行），复用既有 `PlayerInfo` 外观。

## 六、测试（`games/huiming/__tests__/`）

现有 3 个测试文件里 `initHuimingGame('p1', 'p2')` 的调用（约 20 处）改为传数组 `['p1', 'p2']`。**所有 2 人局断言原样保留**，作为「2 人行为不变」的回归保障。

新增用例：

- `engine.test.ts`：4 人初始化（`players.length === 4`、`currentTurn === 0`）；`grantDarkPickCharges` 给全部 4 人各加一次。
- `plugin.test.ts`：
  - 4 人回合按 0→1→2→3→0 轮转一整圈；
  - 棋盘取空且某玩家 `countMaxSuit` 唯一最大 → 该玩家获胜；
  - 棋盘取空且多人并列最大 → 进入 `placing`，`round++`；
  - 4 人续放轮：空手牌玩家被自动跳过；全部放完 → 回到 `taking`；
  - `getClientState` 在 4 人局返回 3 个 `opponents`（含正确 `index` 与手牌数），且不泄露对手牌面；
  - 3 人局至少一条端到端用例，确认 3 人也能跑通（房间允许 2~4）。

## 七、文档

- `docs/huiming-rules.md`：「人数：2 人」→「2~4 人」；规则 2、8 中只写「双方」的措辞改为「所有玩家」，并补上并列最大如何处理、续放先手如何确定。
- `docs/huiming-rules-en.md`：同步上述改动。
- `games/huiming/plugin.ts` 与 `games/huiming/ui/client-plugin.ts` 的 `description`：「双人博弈」→「2~4 人博弈」。

## 不做的事

- 不改棋盘尺寸、不改牌堆构成、不改胜利阈值。
- 不引入「人数 → 参数」配置表（方案 B）。
- 不保留独立的 2 人代码分支（方案 C）。
- 不动 PixiJS/Canvas 渲染路径（晦明本来就走 DOM + `CardGrid`）。
- 不改房间层 `/` 大厅，平台已支持 landlord(3)、nimmt(6) 等多人游戏。
- 不改规则 6「每局每人限放一次」、规则 3「Joker 只能在明置时取走」等与人数无关的规则。

## 验收标准

1. `cd games/huiming && npx vitest run` 全绿，含新增 3/4 人用例。
2. `npm run test` 全绿；`client` 与 `server` 的 `tsc --noEmit` 无错误。
3. 2 人局行为与改动前一致（现有断言未修改语义，仅改调用形式）。
4. 手动验证：创建 4 人晦明房间 → 开局 → 四名玩家轮流取牌/暗取/放牌均被正确接受 → 非当前回合玩家操作被拒 → 牌堆取空后按补全二/三收场。
