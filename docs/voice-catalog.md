# 斗地主语音资源清单

> 路径：`voice/man/` (男声) 和 `voice/woman/` (女声)，格式 `.ogg`
>
> 当前状态：**尚未集成到游戏代码中**，代码使用中文名 + `.mp3`（如 `playVoice('炸弹')` → `audio/voice/炸弹.mp3`），与这些拼音命名的 .ogg 文件没有对应关系。

---

## 命名规则

| 前缀/模式 | 含义 | 示例 |
|---|---|---|
| 无前缀 | 男声专用 或 男女通用 | `buyao1.ogg`, `sandaiyi.ogg` |
| `n` 前缀 | 女声专用 | `nbuyao1.ogg`, `nsandaiyi.ogg` |
| `special_` 前缀 | 特效音（仅女声目录） | `special_bomb.ogg` |
| 数字后缀 | 同类型多变体 | `buyao1.ogg` / `buyao2.ogg` / `buyao3.ogg` |

数字含义（牌面值）：
- `1` = A, `2`~`10` = 2~10, `11` = J, `12` = Q, `13` = K
- `14` = 小王, `15` = 大王（仅单牌 dan 有14、15）

---

## 男声 (`voice/man/`) — 53 个文件

### 出牌语音

| 文件 | 拼音 | 中文含义 | 牌型 |
|---|---|---|---|
| `dan1.ogg` ~ `dan15.ogg` (×15) | dān | 单牌 | 单张，1=A, 14=小王, 15=大王 |
| `dui1.ogg` ~ `dui13.ogg` (×13) | duì | 对子 | 一对 |
| `tuple1.ogg` ~ `tuple13.ogg` (×13) | tiáo | 三条 | 三张同牌 |
| `shunzi.ogg` | shùn zǐ | 顺子 | 五张以上连续单牌 |
| `liandui.ogg` | lián duì | 连对 | 三对以上连续对子 |
| `feiji.ogg` | fēi jī | 飞机 | 两组以上连续三条 |
| `sandaiyi.ogg` | sān dài yī | 三带一 | 三条 + 一张 |
| `sidaier.ogg` | sì dài èr | 四带二 | 四张 + 两张单牌 |
| `sidailiangdui.ogg` | sì dài liǎng duì | 四带两对 | 四张 + 两对 |
| `dani1.ogg` | dà nǐ | 大你 | 管上家的单牌 |

### 炸弹/火箭

| 文件 | 拼音 | 中文含义 |
|---|---|---|
| `zhadan.ogg` | zhà dàn | 炸弹（四张同牌） |
| `wangzha.ogg` | wáng zhà | 王炸 / 火箭（大小王） |

### 操作语音

| 文件 | 拼音 | 中文含义 |
|---|---|---|
| `buyao1.ogg` | bù yào | 不要 / 过 |
| `baojing1.ogg` | bào jǐng | 报警（剩2张） |
| `baojing2.ogg` | bào jǐng | 报警（剩1张） |

---

## 女声 (`voice/woman/`) — 68 个文件

### 出牌语音（n 前缀）

| 文件 | 拼音 | 中文含义 | 牌型 |
|---|---|---|---|
| `n1.ogg` ~ `n15.ogg` (×15) | nǚ dān | 单牌 | 单张 |
| `ndui1.ogg` ~ `ndui13.ogg` (×13) | nǚ duì | 对子 | 一对 |
| `ntuple1.ogg` ~ `ntuple13.ogg` (×13) | nǚ tiáo | 三条 | 三张同牌 |
| `nshunzi.ogg` | nǚ shùn zǐ | 顺子 | 连续单牌 |
| `nliandui.ogg` | nǚ lián duì | 连对 | 连续对子 |
| `nfeiji.ogg` | nǚ fēi jī | 飞机 | 连续三条 |
| `nsandaiyi.ogg` | nǚ sān dài yī | 三带一 | 三条 + 一 |
| `nsandaiyidui.ogg` | nǚ sān dài yī duì | 三带一对 | 三条 + 一对 |
| `nsidaier.ogg` | nǚ sì dài èr | 四带二 | 四张 + 两单 |
| `nsidailiangdui.ogg` | nǚ sì dài liǎng duì | 四带两对 | 四张 + 两对 |
| `ndani1.ogg` | nǚ dà nǐ | 大你 | 管上家单牌 |

### 炸弹/火箭（n 前缀）

| 文件 | 拼音 | 中文含义 |
|---|---|---|
| `nzhadan.ogg` | nǚ zhà dàn | 炸弹 |
| `nwangzha.ogg` | nǚ wáng zhà | 王炸 / 火箭 |

### 操作语音（n 前缀）

| 文件 | 拼音 | 中文含义 |
|---|---|---|
| `nbuyao1.ogg` | nǚ bù yào | 不要 |
| `nbuyao4.ogg` | nǚ bù yào | 不要（变体） |
| `nbaojing1.ogg` | nǚ bào jǐng | 报警（剩2张） |
| `nbaojing2.ogg` | nǚ bào jǐng | 报警（剩1张） |
| `njiabei.ogg` | nǚ jiā bèi | 加倍 |

### 无前缀文件（女声目录内）

| 文件 | 拼音 | 中文含义 | 备注 |
|---|---|---|---|
| `buyao2.ogg` | bù yào | 不要（变体2） | 与男声 buyao1 对应 |
| `buyao3.ogg` | bù yào | 不要（变体3） | 多个变体随机播放 |
| `buyao4.ogg` | bù yào | 不要（变体4） | |
| `dani2.ogg` | dà nǐ | 大你（变体2） | 与男声 dani1 对应 |
| `dani3.ogg` | dà nǐ | 大你（变体3） | |
| `sandaiyi.ogg` | sān dài yī | 三带一 | 与 n 版本重复？ |

### 特效音（special_ 前缀）

| 文件 | 中文含义 | 使用场景 |
|---|---|---|
| `special_bomb.ogg` | 炸弹特效音 | 出炸弹时的音效 |
| `special_bomb_wangzha.ogg` | 王炸特效音 | 出王炸时的音效 |
| `special_flower.ogg` | 花牌特效 | 特殊牌型音效 |
| `special_multiply.ogg` | 翻倍特效 | 加倍/超级加倍 |
| `special_plane.ogg` | 飞机特效 | 出飞机时的音效 |
| `special_star.ogg` | 星星特效 | 特殊事件音效 |

---

## 男女对照表

| 功能 | 男声文件 | 女声文件 |
|---|---|---|
| 单牌 | `dan{1-15}.ogg` | `n{1-15}.ogg` |
| 对子 | `dui{1-13}.ogg` | `ndui{1-13}.ogg` |
| 三条 | `tuple{1-13}.ogg` | `ntuple{1-13}.ogg` |
| 顺子 | `shunzi.ogg` | `nshunzi.ogg` |
| 连对 | `liandui.ogg` | `nliandui.ogg` |
| 飞机 | `feiji.ogg` | `nfeiji.ogg` |
| 三带一 | `sandaiyi.ogg` | `nsandaiyi.ogg` |
| 三带一对 | ❌ 无 | `nsandaiyidui.ogg` |
| 四带二 | `sidaier.ogg` | `nsidaier.ogg` |
| 四带两对 | `sidailiangdui.ogg` | `nsidailiangdui.ogg` |
| 大你 | `dani1.ogg` | `ndani1.ogg` |
| 炸弹 | `zhadan.ogg` | `nzhadan.ogg` |
| 王炸 | `wangzha.ogg` | `nwangzha.ogg` |
| 不要 | `buyao1.ogg` | `nbuyao1.ogg` + `buyao{2-4}.ogg` |
| 报警 | `baojing{1-2}.ogg` | `nbaojing{1-2}.ogg` |
| 加倍 | ❌ 无 | `njiabei.ogg` |

---

## 当前代码引用 vs 实际文件

| 代码中的调用 | 期望文件 | 实际存在的文件 |
|---|---|---|
| `playVoice('不出')` | `audio/voice/不出.mp3` | ❌ 不存在，应映射到 `buyao*.ogg` |
| `playVoice('炸弹')` | `audio/voice/炸弹.mp3` | ❌ 不存在，应映射到 `zhadan.ogg` |
| `playVoice('王炸')` | `audio/voice/王炸.mp3` | ❌ 不存在，应映射到 `wangzha.ogg` |
| `playVoice('叫地主')` | `audio/voice/叫地主.mp3` | ❌ 不存在，无对应语音 |
| `playVoice('我赢了')` | `audio/voice/我赢了.mp3` | ❌ 不存在，无对应语音 |
| `playVoice('我输了')` | `audio/voice/我输了.mp3` | ❌ 不存在，无对应语音 |

---

## 待集成事项

1. **建立映射表**：中文事件名 → pinyin 文件名
2. **男女声选择**：玩家选择性别，或根据角色自动分配
3. **多变体随机**：`buyao1/2/3/4` 等多个变体随机播放
4. **特效音集成**：`special_*` 文件作为出牌音效叠加播放
5. **出牌语音补全**：当前代码只在炸弹/王炸/不出时播放语音，普通出牌（单牌/对子/顺子等）未触发语音
