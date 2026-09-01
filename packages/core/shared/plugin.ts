/**
 * plugin.ts — 插件系统核心接口定义
 *
 * 这个文件是整个平台的"合同"——所有游戏都必须实现这里的接口。
 * 类比 Java：这相当于定义了一组 abstract class / interface。
 *
 * 架构概述：
 *   服务器端：每个游戏实现 GameServerPlugin（处理逻辑、验证、状态转换）
 *   客户端：每个游戏实现 GameClientPlugin（UI 渲染 + 可选的 Canvas 渲染器）
 *   通信：客户端通过 onAction(event, payload) 发送操作，服务器通过 handleEvent 处理
 *
 * 数据流：
 *   客户端点击 → onAction('play', {cards}) → 服务器 handleEvent → 校验 → 更新 state
 *   → getClientState 生成该玩家的视角 → 通过 Socket.IO 推送 stateUpdate → 客户端 UI 重新渲染
 *
 * 【如何添加新游戏】：
 *   1. 在 games/ 目录下创建游戏文件夹
 *   2. 定义 types.ts（游戏状态类型）
 *   3. 实现 engine.ts（初始状态、发牌等）
 *   4. 实现 rules.ts（规则校验）
 *   5. 实现 plugin.ts（实现 GameServerPlugin 接口）
 *   6. 实现 ui/ 目录（React 组件 + 可选 Canvas 渲染器）
 *   7. 在 server/src/index.ts 中注册插件
 *   8. 在 client/src/main.tsx 中注册客户端插件
 */
import type { Card, DeckConfig } from './card'

/**
 * 游戏状态（服务器端完整状态）。
 * 每个游戏自己定义具体结构，这里只声明一个宽松的索引类型。
 * 类比 Java：相当于 Object 或泛型 T，具体类型由各游戏的 types.ts 定义。
 *
 * 例：斗地主的 LandlordState 包含 players、bottomCards、currentPhase、winner 等。
 */
export interface GameState {
  [key: string]: any
}

/**
 * 客户端状态（该玩家视角的状态）。
 * 由 GameServerPlugin.getClientState() 从完整状态中"脱敏"生成。
 * 例如：其他玩家的手牌只显示数量，不显示具体牌面。
 */
export interface ClientState {
  [key: string]: any
}

/**
 * 广播消息结构。服务器处理完事件后，可以通过 broadcast 数组向客户端推送额外消息。
 *
 * @property event - Socket.IO 事件名（如 'game:voice'、'game:effect'）
 * @property data  - 事件携带的数据
 * @property target - 推送目标：
 *   - 'all'    → 房间内所有人（默认）
 *   - 'others' → 除当前玩家外的其他人
 *   - 'self'   → 仅当前玩家
 *
 * 使用场景：出牌时播放语音（others 不需要听到自己的出牌语音），触发特效等。
 */
export interface BroadcastMessage {
  event: string
  data: any
  target?: 'all' | 'others' | 'self'
}

/**
 * handleEvent 的返回值。服务器框架根据此结果决定后续行为。
 *
 * @property state        - 更新后的游戏状态（必须返回，即使没变也返回原 state）
 * @property broadcast    - 可选的广播消息列表
 * @property error        - 非空字符串表示操作失败，会发送 game:error 给客户端
 * @property checkEndNow  - 是否立即检查游戏结束（默认 true）。设为 false 可延迟检查，
 *                          例如需要等动画播放完再判定胜负时。
 */
export interface EventResult {
  state: GameState
  broadcast?: BroadcastMessage[]
  error?: string
  checkEndNow?: boolean
}

/**
 * React 游戏组件的 props 类型。所有游戏的 UI 组件都接收这组 props。
 *
 * @property state        - 该玩家视角的客户端状态（由 getClientState 生成）
 * @property playerId     - 当前玩家的 ID
 * @property onAction     - 向服务器发送游戏操作的函数。
 *                          例：onAction('play', { cards: selectedCards })
 *                          服务器会调用 handleEvent(state, playerId, 'play', { cards })
 * @property playerNames  - playerId → 昵称 的映射表，用于显示玩家昵称而非"玩家1/2/3"
 */
export interface GameComponentProps {
  state: ClientState
  playerId: string
  onAction: (event: string, payload: any) => void
  playerNames?: Record<string, string>
}

/**
 * 游戏插件的基础信息（服务器和客户端共用）。
 *
 * @property id          - 游戏唯一标识，如 'landlord'、'huiming'、'nimmt'
 * @property name        - 游戏显示名称，如 '欢乐斗地主'
 * @property description - 游戏简介
 * @property minPlayers  - 最少玩家数
 * @property maxPlayers  - 最多玩家数
 * @property deckConfig  - 牌组配置（花色、点数、大小王数量等）
 */
export interface GamePlugin {
  id: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  deckConfig: DeckConfig
}

/**
 * 服务器端游戏插件接口。每个游戏必须实现这四个方法。
 *
 * 类比 Java：这相当于一个 abstract class，游戏开发者需要继承并实现所有抽象方法。
 *
 * 调用链（以出牌为例）：
 *   1. 客户端 emit('game:action', { event: 'play', payload: { cards } })
 *   2. socket-framework.ts 收到 → 调用 plugin.handleEvent(state, playerId, 'play', { cards })
 *   3. handleEvent 内部调用 rules.ts 校验合法性
 *   4. 合法则更新 state（移除手牌、记录出牌等）
 *   5. 返回 EventResult（新状态 + 可选广播）
 *   6. socket-framework 调用 getClientState 为每个玩家生成视角，推送给客户端
 *   7. socket-framework 调用 checkGameEnd 判断是否结束
 */
export interface GameServerPlugin extends GamePlugin {
  /**
   * 创建初始游戏状态。房间开始游戏时调用一次。
   *
   * @param players - 玩家 ID 列表，按座位顺序
   * @returns 完整的初始游戏状态
   *
   * 调用处：socket-framework.ts → room:start 事件处理 → plugin.createInitialState()
   */
  createInitialState(players: string[]): GameState

  /**
   * 处理一个游戏事件。这是游戏逻辑的核心——所有的出牌、叫分、pass 等操作都经过这里。
   *
   * @param state    - 当前游戏状态（会被替换为返回的 state）
   * @param playerId - 发起操作的玩家 ID
   * @param event    - 事件名（如 'bid'、'play'、'pass'）
   * @param payload  - 事件数据（如 { cards }、{ score }）
   * @returns EventResult，包含新状态、可选广播、错误信息
   *
   * 调用处：socket-framework.ts → game:action 事件处理
   */
  handleEvent(state: GameState, playerId: string, event: string, payload: any): EventResult

  /**
   * 从完整状态生成某玩家的"视角"。用于隐藏其他玩家的私有信息。
   *
   * @param state    - 完整游戏状态
   * @param playerId - 目标玩家 ID
   * @returns 该玩家可见的客户端状态
   *
   * 例：斗地主中，其他玩家的手牌只返回数量（otherHandCounts），不返回具体牌面。
   *
   * 调用处：socket-framework.ts → broadcastState()，为每个玩家单独生成并推送
   */
  getClientState(state: GameState, playerId: string): ClientState

  /**
   * 检查游戏是否结束。
   *
   * @param state - 当前游戏状态
   * @returns 获胜者标识（如 'landlord'、'farmer'、playerId），null 表示未结束
   *
   * 调用处：socket-framework.ts → game:action 处理完毕后调用，若返回非 null 则触发 game:over
   */
  checkGameEnd(state: GameState): string | null
}

/**
 * 客户端游戏插件接口。定义了游戏在浏览器端的表现。
 *
 * @property GameComponent - React 组件，渲染游戏 UI（按钮、手牌、信息面板等）
 * @property assets        - 可选的静态资源映射（音效、图片等）
 * @property renderer      - 可选的 Canvas 渲染器工厂函数。
 *                           如果提供，GameCanvas 组件会用它替代 React DOM 渲染牌面。
 *                           目前只有斗地主使用了 PixiJS 渲染器。
 */
export interface GameClientPlugin extends GamePlugin {
  GameComponent: React.ComponentType<GameComponentProps>
  assets?: Record<string, string>
  renderer?: GameRendererFactory
}

/**
 * 渲染器工厂函数的上下文参数。
 *
 * @property onAction          - 向服务器发送操作（与 GameComponentProps.onAction 相同）
 * @property onSelectionChange - 通知 React 层选中的牌变了（用于同步按钮状态等）
 */
export interface RendererFactoryContext {
  onAction: (event: string, payload: any) => void
  onSelectionChange?: (selectedIds: Set<string>) => void
}

/**
 * Canvas 渲染器工厂函数类型。
 *
 * GameCanvas 组件在挂载时调用此函数创建渲染器。
 * 返回 null 表示 WebGL 不可用，GameCanvas 会回退到 React DOM 渲染。
 *
 * @param container - 挂载 canvas 的 DOM 容器元素
 * @param ctx       - 上下文（onAction 回调等）
 * @param app       - 已创建的 PIXI.Application 实例（避免重复创建）
 * @returns 渲染器对象（sync/destroy），或 null（回退到 CSS 渲染）
 *
 * 调用处：GameCanvas.tsx → useEffect 中调用 plugin.renderer(container, ctx, app)
 */
export type GameRendererFactory = (
  container: HTMLElement,
  ctx: RendererFactoryContext,
  app?: any  // PIXI.Application — 用 any 避免 core-shared 依赖 pixi 类型
) => Promise<{
  /** 同步游戏状态到渲染器。每次 stateUpdate 时调用 */
  sync: (state: any, selectedIds?: Set<string>) => void
  /** 窗口大小变化时调用，重新计算布局 */
  onResize?: () => void
  /** 销毁渲染器，释放所有资源（组件卸载时调用） */
  destroy: () => void
} | null>
