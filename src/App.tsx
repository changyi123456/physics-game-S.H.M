import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  challengeMap,
  challenges,
  createEmptyFinished,
  createInitialUnlocked,
  createInitialValues,
  evaluateChallenge,
  nextChallengeId,
  resetChallengeValues,
  type ChallengeId,
  type ControlDefinition,
  type ControlKey,
  type GameSettings,
} from './game/astrolabeModel'
import { PhaserStage } from './game/PhaserStage'

type SavedGame = {
  activeId: ChallengeId
  values: Record<ControlKey, number>
  unlocked: Record<ChallengeId, boolean>
  finished: Record<ChallengeId, boolean>
  fragments: Record<ChallengeId, boolean>
  deductionAnswers: Record<ChallengeId, number | null>
  finalDeductionAnswer: number | null
}

type ViewMode = 'intro' | 'hub' | 'sim'
type SceneMode = 'intro' | 'hub'
type HubPanel = 'quest' | 'chapters' | 'fragments' | 'codex' | 'achievements' | 'final' | null
type CodexCard = {
  id: string
  name: string
  note: string
  functionText: string
  challengeId?: ChallengeId
}
type Achievement = {
  id: string
  name: string
  note: string
  condition: 'start' | 'first-clear' | 'three-clear' | 'all-clear' | 'active-sync'
}
type StoryFragment = {
  title: string
  text: string
  hint: string
  reveal: string
}
type DeductionCheck = {
  prompt: string
  options: string[]
  answerIndex: number
  success: string
  fail: string
}
type NpcDialogue = {
  before: string
  solved: string
  fragment: string
}
type StagePosition = {
  x: number
  y: number
}
type GateStagePosition = StagePosition & {
  scale: number
  z: number
}

const saveKey = 'periodic-motion-rpg-v5'
const firstChallenge = challenges[0]
const heroArtUrl = `${import.meta.env.BASE_URL}hero-rpg.svg`
const observerName = '觀測員艾菈'

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const gateStagePositions: Record<ChallengeId, GateStagePosition> = {
  orbit: { x: 18, y: 32, scale: 0.78, z: 2 },
  force: { x: 49, y: 38, scale: 0.9, z: 2 },
  refcircle: { x: 80, y: 31, scale: 0.78, z: 2 },
  spring: { x: 30, y: 14, scale: 1.02, z: 4 },
  pendulum: { x: 68, y: 14, scale: 1.02, z: 4 },
}

const gatePositionForChallenge = (id: ChallengeId): StagePosition => {
  const position = gateStagePositions[id]
  return { x: position.x, y: Math.max(6, position.y - 8) }
}

const observerStagePosition: StagePosition = { x: 86, y: 16 }

const stepDigits = (step: number) => {
  const [, decimal = ''] = String(step).split('.')
  return decimal.length
}

const snapControlValue = (control: ControlDefinition, rawValue: number) => {
  const clamped = Math.min(control.max, Math.max(control.min, rawValue))
  const snapped = control.min + Math.round((clamped - control.min) / control.step) * control.step
  return Number(Math.min(control.max, Math.max(control.min, snapped)).toFixed(stepDigits(control.step)))
}

const sceneOnlyControls: Record<ChallengeId, ControlKey[]> = {
  orbit: ['shotScore'],
  force: [],
  refcircle: [],
  spring: ['amplitude'],
  pendulum: ['angle'],
}

const caseIntro =
  '你醒在一座停止報時的城市。城中央的鐘塔沒有指針，卻每隔 3.14 秒傳來一次敲擊聲。前哨站的桌上放著一塊完好的蛋糕，奶油沒有融化，蠟燭卻已經燒到只剩五截黑芯。'

const caseNote =
  '不要慶祝。不要吹熄。找到第五個週期碎片以前，不要相信今天是誰的生日。'

const finalRevealLines = [
  '那塊蛋糕不是生日蛋糕。它是週期城的啟動信標。',
  '五名研究員把事故記憶拆成五個節點，讓城市不要一次想起真相。',
  '第六個人沒有缺席。第六個人是你。',
  '你每次醒來都以為自己第一次抵達前哨，其實你是唯一能重新啟動循環的人。',
  '「不要相信今天是誰的生日」的意思是：今天不是生日，是你第無數次回來確認自己是否願意再忘一次。',
]

const finalDeductionCheck: DeductionCheck = {
  prompt: '五枚碎片湊齊後，最合理的真相推理是什麼？',
  options: [
    '鐘塔裡還有一個從未現身的旁觀者，他偷走了生日卡。',
    '蛋糕只是某種冷凍裝置，所以奶油不會融化。',
    '第六個人就是每次重啟後失去記憶的玩家，蛋糕是循環啟動信標。',
    '五名研究員其實都沒有進入事故現場。',
  ],
  answerIndex: 2,
  success: '鐘塔第六次報時。桌邊的空椅移開了，椅背上刻著你的名字。',
  fail: '鐘塔沒有報時。這個答案還沒解釋五個碎片為什麼都指向「重啟」。',
}

const storyFragments: Record<ChallengeId, StoryFragment> = {
  orbit: {
    title: '第一碎片：第六張椅子',
    text: '碎片上刻著一張餐桌。桌邊有六張椅子，卻只有五個影子。第一支蠟燭旁寫著：他每次都坐在同一個位置。',
    hint: '椅子數量不是人數，影子也不是缺席證明。',
    reveal: '餐桌、六椅、五影。這比讀數更像供詞。',
  },
  force: {
    title: '第二碎片：回到蛋糕前',
    text: '監視畫面裡，有人試著離開鐘塔大廳，卻總沿著弧線回到蛋糕前。字幕只剩一句：不是門鎖住了，是世界把他拉回來。',
    hint: '路徑像逃亡，但結果像召回。',
    reveal: '那不是自願留下，是某種規則把人拉回中心。',
  },
  refcircle: {
    title: '第三碎片：兩種離開',
    text: '同一個人同時出現在圓周與直線上。碎片背面寫著：你看到的離開，只是另一種重複。',
    hint: '同一件事可能在兩個視角裡被誤認成兩個事件。',
    reveal: '如果投影能欺騙視線，監視畫面也可能把一次事故切成兩段。',
  },
  spring: {
    title: '第四碎片：忘記作為保護',
    text: '錄音裡有人說：如果他忘記，就讓他回到開始；如果他想起，就讓城市停下。最後傳來蛋糕刀落地的聲音。',
    hint: '失憶不是懲罰，可能是某種安全裝置。',
    reveal: '有人設計了重啟，也有人自願把真相壓回黑箱。',
  },
  pendulum: {
    title: '第五碎片：第六席',
    text: '生日卡上沒有名字，只有一句話：第六個人沒有缺席。他就是負責重新開始的人。',
    hint: '負責重啟的人，不一定記得自己做過這件事。',
    reveal: '最後一席不是空的。只是每一次醒來，你都忘了自己曾坐在那裡。',
  },
}

const deductionChecks: Record<ChallengeId, DeductionCheck> = {
  orbit: {
    prompt: '「六張椅子、五個影子」最可能代表什麼？',
    options: ['有一張椅子只是裝飾', '有一個人不在同一個時間', '有一個人不會被光照出影子'],
    answerIndex: 1,
    success: '碎片微微發熱。你聽見椅腳拖過地面的聲音，像有人剛剛坐下。',
    fail: '碎片沒有反應。那不是怪談裡的失蹤，而是時間裡的錯位。',
  },
  force: {
    prompt: '為什麼畫面裡的人總會回到蛋糕前？',
    options: ['他不想離開', '出口被偽裝成牆', '他被某種規則召回到起點'],
    answerIndex: 2,
    success: '向心徽章亮起，所有逃離路線都疊回餐桌中央。',
    fail: '畫面倒轉了三秒。門沒有拒絕他，世界本身在收束。',
  },
  refcircle: {
    prompt: '「離開只是另一種重複」暗示什麼？',
    options: ['城市有兩個出口', '同一段事件被不同視角投影', '有人在替換監視畫面'],
    answerIndex: 1,
    success: '相位透鏡把兩段畫面疊合；你看見同一個人、同一把刀、同一塊蛋糕。',
    fail: '透鏡裡沒有第二條路。它只是在提醒你，視角會把一次事件偽裝成兩次。',
  },
  spring: {
    prompt: '「忘記」在錄音裡像什麼？',
    options: ['懲罰失敗者', '讓蛋糕保持新鮮的方法', '保護循環不崩壞的機制'],
    answerIndex: 2,
    success: '錄音恢復一秒：有人說「拜託，讓他不要想起來」。',
    fail: '匣芯震了一下。這段忘記不是報復，比懲罰更接近保護。',
  },
  pendulum: {
    prompt: '第六個人最可能是誰？',
    options: ['被困在蛋糕裡的人', '每次重啟後失去記憶的玩家', '從未出現過的旁觀者'],
    answerIndex: 1,
    success: '鐘樓敲了第六下。你的影子慢了一拍，然後坐進那張空椅。',
    fail: '鐘聲沒有回答。第六個人不是藏起來的人，而是一直負責重啟的人。',
  },
}

const npcDialogues: Record<ChallengeId, NpcDialogue> = {
  orbit: {
    before: '守衛把視線從蛋糕移開：「別問星象儀怎麼壞的。先問，為什麼它只記得六個座位。」',
    solved: '第一枚門鎖鬆開了。守衛低聲說：「你剛剛不是校準儀器，你是在替一個人找回座位。」',
    fragment: '餐桌、六椅、五影。這比讀數更像供詞。',
  },
  force: {
    before: '觀測員指著一段模糊影像：「他每次都跑向出口，卻每次都繞回蛋糕前。別急著相信門是問題。」',
    solved: '力場線全指向中心。觀測員說：「如果世界一直把他拉回來，那他不是兇手，也可能不是受害者。」',
    fragment: '逃離路徑不是自由意志，而是某種召回命令。',
  },
  refcircle: {
    before: '研究員把兩片影像疊在一起：「你看見的是兩個人，還是一個人被畫面拆成兩個方向？」',
    solved: '光幕安靜下來。研究員說：「有些離開只是投影，它看起來像遠走，其實仍在原地。」',
    fragment: '視角把一次事故切成兩段，真相因此變得像海龜湯。',
  },
  spring: {
    before: '工坊學徒守著錄音匣：「我只聽過一句話：如果他想起來，城市就會停下。」',
    solved: '匣芯回彈時發出蛋糕刀落地的聲音。學徒說：「忘記可能不是逃避，是有人替他留下的保險。」',
    fragment: '重啟不是失敗，失憶也不是懲罰。',
  },
  pendulum: {
    before: '鐘匠把沒有名字的生日卡交給你：「第六個人沒有缺席。這句話我不敢念第二次。」',
    solved: '鐘聲多響了一下。鐘匠說：「如果你聽見第六下，別回頭看影子。」',
    fragment: '第六席一直有人。只是每一次醒來，他都忘了自己坐過。',
  },
}

const codexCards: CodexCard[] = [
  {
    id: 'case-note',
    name: '前哨字條',
    note: `「${caseNote}」`,
    functionText: '可重新讀取事故開場文本。',
  },
  {
    id: 'orbit-key',
    name: '星盤鑰匙',
    note: '標出餐桌上從未被拍到正面的座位。',
    functionText: '提示第六張椅子不是空位，而是時間錯位。',
    challengeId: 'orbit',
  },
  {
    id: 'force-emblem',
    name: '向心徽章',
    note: '把所有逃離路線疊回同一點。',
    functionText: '提示「回到原點的人」不一定是自願。',
    challengeId: 'force',
  },
  {
    id: 'phase-lens',
    name: '相位透鏡',
    note: '把兩段時間疊在同一張畫面上。',
    functionText: '提示生日歌可能只唱了一次，卻被切成五段。',
    challengeId: 'refcircle',
  },
  {
    id: 'spring-core',
    name: '彈簧匣芯',
    note: '播放被壓縮的事故錄音。',
    functionText: '提示失憶可能是保護，而不是失敗。',
    challengeId: 'spring',
  },
  {
    id: 'pendulum-seal',
    name: '鐘擺封印',
    note: '讓鐘塔重新報時一次。',
    functionText: '提示最先知道循環重啟的人，也許就是重啟者。',
    challengeId: 'pendulum',
  },
]
const achievements: Achievement[] = [
  { id: 'apprentice', name: '前哨醒來', note: '讀取第一份事故檔案。', condition: 'start' },
  { id: 'first-node', name: '第一片沉默', note: '解封任一枚週期碎片。', condition: 'first-clear' },
  { id: 'pathfinder', name: '三段供詞', note: '取得三枚互相矛盾的碎片。', condition: 'three-clear' },
  { id: 'perfect-tune', name: '節點共鳴', note: '目前節點已可進行推理檢定。', condition: 'active-sync' },
  { id: 'clock-heart', name: '第六席', note: '湊齊五枚碎片並解開鐘塔真相。', condition: 'all-clear' },
]

function createEmptyFragments(): Record<ChallengeId, boolean> {
  return challenges.reduce(
    (fragments, challenge) => {
      fragments[challenge.id] = false
      return fragments
    },
    {} as Record<ChallengeId, boolean>,
  )
}

function createEmptyDeductionAnswers(): Record<ChallengeId, number | null> {
  return challenges.reduce(
    (answers, challenge) => {
      answers[challenge.id] = null
      return answers
    },
    {} as Record<ChallengeId, number | null>,
  )
}

function initialViewMode(): ViewMode {
  const hash = window.location.hash.replace('#', '')
  return hash === 'hub' || hash === 'sim' ? hash : 'intro'
}

function loadSavedGame(): SavedGame {
  const fallback: SavedGame = {
    activeId: firstChallenge.id,
    values: createInitialValues(),
    unlocked: createInitialUnlocked(),
    finished: createEmptyFinished(),
    fragments: createEmptyFragments(),
    deductionAnswers: createEmptyDeductionAnswers(),
    finalDeductionAnswer: null,
  }

  try {
    const raw = window.localStorage.getItem(saveKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<SavedGame>
    const activeId = parsed.activeId && challengeMap[parsed.activeId] ? parsed.activeId : fallback.activeId

    return {
      activeId,
      values: { ...fallback.values, ...parsed.values },
      unlocked: { ...fallback.unlocked, ...parsed.unlocked },
      finished: { ...fallback.finished, ...parsed.finished },
      fragments: { ...fallback.fragments, ...parsed.fragments },
      deductionAnswers: { ...fallback.deductionAnswers, ...parsed.deductionAnswers },
      finalDeductionAnswer: parsed.finalDeductionAnswer ?? fallback.finalDeductionAnswer,
    }
  } catch {
    return fallback
  }
}

function ClockworkScene({ mode }: { mode: SceneMode }) {
  return (
    <div className={`clockwork-scene ${mode}`} aria-hidden="true">
      <span className="sky-grain" />
      <span className="sky-line line-a" />
      <span className="sky-line line-b" />
      <span className="sky-line line-c" />
      <span className="sky-star star-a" />
      <span className="sky-star star-b" />
      <span className="sky-star star-c" />
      <span className="moon-disc"><i /></span>
      <span className="gear-ring gear-a" />
      <span className="gear-ring gear-b" />
      <span className="city-ridge ridge-back">
        <i className="spire s1" />
        <i className="spire s2" />
        <i className="spire s3" />
        <i className="spire s4" />
      </span>
      <span className="city-ridge ridge-front">
        <i className="spire s5" />
        <i className="spire s6" />
        <i className="spire s7" />
      </span>
      <span className="sky-bridge" />
      <span className="portal-arch" />
      <span className="rpg-character hero"><i /><b /></span>
      <span className="rpg-character mentor"><i /><b /></span>
      <span className="node-light node-a" />
      <span className="node-light node-b" />
      <span className="node-light node-c" />
      <span className="node-light node-d" />
      <span className="foreground-rail" />
    </div>
  )
}

function App() {
  const saved = useMemo(() => loadSavedGame(), [])
  const [viewMode, setViewMode] = useState<ViewMode>(() => initialViewMode())
  const [activeId, setActiveId] = useState<ChallengeId>(saved.activeId)
  const [values, setValues] = useState<Record<ControlKey, number>>(saved.values)
  const [unlocked, setUnlocked] = useState<Record<ChallengeId, boolean>>(saved.unlocked)
  const [finished, setFinished] = useState<Record<ChallengeId, boolean>>(saved.finished)
  const [fragments, setFragments] = useState<Record<ChallengeId, boolean>>(saved.fragments)
  const [deductionAnswers, setDeductionAnswers] =
    useState<Record<ChallengeId, number | null>>(saved.deductionAnswers)
  const [finalDeductionAnswer, setFinalDeductionAnswer] = useState<number | null>(saved.finalDeductionAnswer)
  const [loreOpen, setLoreOpen] = useState(false)
  const [hubPanel, setHubPanel] = useState<HubPanel>(null)
  const [doorPromptId, setDoorPromptId] = useState<ChallengeId | null>(null)
  const [hubObserverOpen, setHubObserverOpen] = useState(false)
  const [simObserverOpen, setSimObserverOpen] = useState(false)
  const [playerPosition, setPlayerPosition] = useState<StagePosition>(() => gatePositionForChallenge(saved.activeId))
  const settingsRef = useRef<GameSettings>({
    challengeId: saved.activeId,
    values: saved.values,
    sync: 0,
    completed: false,
    unlocked: saved.unlocked,
    finished: saved.finished,
  })

  const activeChallenge = challengeMap[activeId]
  const activeFragment = storyFragments[activeId]
  const activeCheck = deductionChecks[activeId]
  const activeDialogue = npcDialogues[activeId]
  const hiddenSceneControls = sceneOnlyControls[activeId]
  const visibleControls = activeChallenge.controls.filter((control) => !hiddenSceneControls.includes(control.key))
  const result = useMemo(() => evaluateChallenge(activeId, values), [activeId, values])
  const activeComplete = result.completed || finished[activeId]
  const activeDeductionAnswer = deductionAnswers[activeId]
  const activeDeductionSolved = fragments[activeId]
  const completedCount = challenges.filter((challenge) => finished[challenge.id]).length
  const fragmentCount = challenges.filter((challenge) => fragments[challenge.id]).length
  const progressPercent = Math.round((fragmentCount / challenges.length) * 100)
  const nextId = nextChallengeId(activeId)
  const allFragmentsFound = fragmentCount === challenges.length
  const finalDeductionSolved = finalDeductionAnswer === finalDeductionCheck.answerIndex
  const hasProgress = completedCount > 0 || fragmentCount > 0 || activeId !== firstChallenge.id
  const chapterStatus = challenges.map((challenge) => ({
    ...challenge,
    isActive: challenge.id === activeId,
    isDone: finished[challenge.id],
    hasFragment: fragments[challenge.id],
    isUnlocked: unlocked[challenge.id],
  }))
  const ownedItems = codexCards.filter((item) => !item.challengeId || fragments[item.challengeId])
  const achievementState = achievements.map((achievement) => {
    const achieved =
      achievement.condition === 'start' ||
      (achievement.condition === 'first-clear' && fragmentCount >= 1) ||
      (achievement.condition === 'three-clear' && fragmentCount >= 3) ||
      (achievement.condition === 'active-sync' && activeComplete) ||
      (achievement.condition === 'all-clear' && finalDeductionSolved)
    return { ...achievement, achieved }
  })
  const achievementCount = achievementState.filter((achievement) => achievement.achieved).length
  const playerScale = clampValue(1.08 - playerPosition.y / 92, 0.72, 1.04)
  const playerStageStyle = {
    '--player-x': `${playerPosition.x}%`,
    '--player-y': `${playerPosition.y}%`,
    '--player-scale': playerScale,
  } as React.CSSProperties
  const playerLayerStyle = { zIndex: Math.round(clampValue(12 - playerPosition.y / 5, 3, 11)) } as React.CSSProperties
  const observerStageStyle = {
    '--observer-x': `${observerStagePosition.x}%`,
    '--observer-y': `${observerStagePosition.y}%`,
  } as React.CSSProperties
  const gateStageStyle = (id: ChallengeId) => {
    const position = gateStagePositions[id]
    return {
      '--gate-x': `${position.x}%`,
      '--gate-y': `${position.y}%`,
      '--gate-scale': position.scale,
      zIndex: position.z,
    } as React.CSSProperties
  }
  const promptedChallenge = doorPromptId ? challengeMap[doorPromptId] : null
  const promptedStatus = doorPromptId ? chapterStatus.find((challenge) => challenge.id === doorPromptId) : null
  const promptedDialogue = doorPromptId ? npcDialogues[doorPromptId] : null
  const promptedFragment = doorPromptId ? storyFragments[doorPromptId] : null
  const finalObserverReady = allFragmentsFound && !finalDeductionSolved
  const hubObserverLine = finalDeductionSolved
    ? '你已經提交正確推理。鐘塔沒有把真相公布給所有人，只把第六席的空位留給願意問到底的人。'
    : finalObserverReady
      ? '五枚碎片已經互相對上了。不要再問門，也不要問鐘。最後一題，要問我。'
      : allFragmentsFound
        ? '五枚碎片已齊。你可以在這裡重新檢視最後推理。'
        : activeDeductionSolved
          ? activeDialogue.fragment
          : activeComplete
            ? activeDialogue.solved
            : '主城可以直接點地移動，也可以用鍵盤方向鍵走動。門會開往節點，但矛盾要回來問人。'
  const simObserverLine = activeDeductionSolved
    ? activeDialogue.fragment
    : activeComplete
      ? activeDialogue.solved
      : activeId === 'orbit'
        ? '別把它看成圓周運動。你在調的是一次發射、一口重力井，以及一個不會等你的目標。'
        : result.sync >= 70
          ? '同步率已經接近了。現在不要大改，從最敏感的參數慢慢修正。'
          : activeDialogue.before

  useEffect(() => {
    settingsRef.current = {
      challengeId: activeId,
      values,
      sync: result.sync,
      completed: activeComplete,
      unlocked,
      finished,
    }
  }, [activeComplete, activeId, finished, result.sync, unlocked, values])

  useEffect(() => {
    window.localStorage.setItem(
      saveKey,
      JSON.stringify({ activeId, values, unlocked, finished, fragments, deductionAnswers, finalDeductionAnswer }),
    )
  }, [activeId, deductionAnswers, finalDeductionAnswer, finished, fragments, unlocked, values])

  useEffect(() => {
    if (viewMode !== 'hub' || hubPanel || doorPromptId || hubObserverOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 7 : 4
      const deltas: Record<string, StagePosition> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: step },
        ArrowDown: { x: 0, y: -step },
      }
      const delta = deltas[event.key]
      if (!delta) return

      event.preventDefault()
      setPlayerPosition((current) => ({
        x: clampValue(current.x + delta.x, 7, 93),
        y: clampValue(current.y + delta.y, 6, 44),
      }))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [doorPromptId, hubObserverOpen, hubPanel, viewMode])

  const completeChallenge = (id: ChallengeId) => {
    setFinished((current) => ({ ...current, [id]: true }))
    const next = nextChallengeId(id)
    if (next) {
      setUnlocked((current) => ({ ...current, [next]: true }))
    }
  }

  const updateValue = (key: ControlKey, nextValue: number) => {
    const nextValues = { ...values, [key]: nextValue }
    const nextResult = evaluateChallenge(activeId, nextValues)
    setValues(nextValues)
    if (nextResult.completed) completeChallenge(activeId)
  }

  const updateValuesFromScene = (patch: Partial<Record<ControlKey, number>>) => {
    const id = settingsRef.current.challengeId
    const challenge = challengeMap[id]
    const nextValues = { ...settingsRef.current.values }
    let changed = false

    challenge.controls.forEach((control) => {
      const rawValue = patch[control.key]
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return

      const nextValue = snapControlValue(control, rawValue)
      if (nextValues[control.key] === nextValue) return

      nextValues[control.key] = nextValue
      changed = true
    })

    if (!changed) return

    const nextResult = evaluateChallenge(id, nextValues)
    settingsRef.current = {
      ...settingsRef.current,
      values: nextValues,
      sync: nextResult.sync,
      completed: nextResult.completed || settingsRef.current.completed,
    }
    setValues(nextValues)
    if (nextResult.completed) completeChallenge(id)
  }

  const resetActive = () => {
    setValues((current) => resetChallengeValues(activeId, current))
    setLoreOpen(false)
  }

  const chooseDeduction = (index: number) => {
    setDeductionAnswers((current) => ({ ...current, [activeId]: index }))
    if (index === activeCheck.answerIndex) {
      setFragments((current) => ({ ...current, [activeId]: true }))
      setLoreOpen(true)
    }
  }

  const chooseFinalDeduction = (index: number) => {
    setFinalDeductionAnswer(index)
  }

  const movePlayer = (nextPosition: StagePosition) => {
    setPlayerPosition({
      x: clampValue(nextPosition.x, 7, 93),
      y: clampValue(nextPosition.y, 6, 44),
    })
  }

  const movePlayerOnStage = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return

    const rect = event.currentTarget.getBoundingClientRect()
    movePlayer({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((rect.bottom - event.clientY) / rect.height) * 100,
    })
    setDoorPromptId(null)
  }

  const openObserverDialog = () => {
    movePlayer(observerStagePosition)
    setHubObserverOpen(true)
    setDoorPromptId(null)
    setHubPanel(null)
    setLoreOpen(false)
  }

  const openFinalRoute = () => {
    if (allFragmentsFound) {
      openObserverDialog()
      return
    }
    setHubPanel('final')
  }

  const openSimObserverDialog = () => {
    setSimObserverOpen(true)
    setLoreOpen(false)
  }

  const resetProgress = () => {
    const initialUnlocked = createInitialUnlocked()
    setViewMode('intro')
    setActiveId(firstChallenge.id)
    setValues(createInitialValues())
    setUnlocked(initialUnlocked)
    setFinished(createEmptyFinished())
    setFragments(createEmptyFragments())
    setDeductionAnswers(createEmptyDeductionAnswers())
    setFinalDeductionAnswer(null)
    setLoreOpen(false)
    setHubPanel(null)
    setDoorPromptId(null)
    setHubObserverOpen(false)
    setSimObserverOpen(false)
    setPlayerPosition(gatePositionForChallenge(firstChallenge.id))
  }

  const selectChallenge = (id: ChallengeId) => {
    if (!unlocked[id]) return
    setActiveId(id)
    setLoreOpen(false)
    setDoorPromptId(null)
    setHubObserverOpen(false)
    movePlayer(gatePositionForChallenge(id))
  }

  const openDoorPrompt = (id: ChallengeId) => {
    movePlayer(gatePositionForChallenge(id))
    setDoorPromptId(id)
    setHubPanel(null)
    setLoreOpen(false)
    setHubObserverOpen(false)
    if (unlocked[id]) setActiveId(id)
  }

  const enterDoorMission = (id: ChallengeId) => {
    if (!unlocked[id]) return
    setActiveId(id)
    setViewMode('sim')
    setLoreOpen(false)
    setHubPanel(null)
    setDoorPromptId(null)
    setHubObserverOpen(false)
    setSimObserverOpen(false)
  }

  const enterHub = () => {
    setViewMode('hub')
    setLoreOpen(false)
    setHubPanel(null)
    setDoorPromptId(null)
    setHubObserverOpen(false)
    setSimObserverOpen(false)
  }

  const enterMission = () => {
    if (!unlocked[activeId]) return
    setViewMode('sim')
    setLoreOpen(false)
    setHubPanel(null)
    setDoorPromptId(null)
    setHubObserverOpen(false)
    setSimObserverOpen(false)
  }

  const enterNext = () => {
    if (!activeComplete) return
    if (nextId) {
      setUnlocked((current) => ({ ...current, [nextId]: true }))
      setActiveId(nextId)
    }
    setViewMode('hub')
    setLoreOpen(false)
    setHubPanel(null)
    setDoorPromptId(null)
    setHubObserverOpen(false)
    setSimObserverOpen(false)
    if (nextId) movePlayer(gatePositionForChallenge(nextId))
  }

  if (viewMode === 'intro') {
    return (
      <main className="game-shell menu-shell">
        <ClockworkScene mode="intro" />

        <section className="intro-stage" aria-label="遊戲序章">
          <div className="intro-copy">
            <p className="eyebrow title-badge">事故文本 00</p>
            <h1>星鐘迴廊</h1>
            <p className="intro-lead">
              {caseIntro}
            </p>

            <div className="case-file">
              <span>前哨桌面留字</span>
              <strong>{caseNote}</strong>
            </div>

            <div className="save-ribbon">
              <span>碎片進度</span>
              <strong>{fragmentCount}/{challenges.length}</strong>
              <i style={{ '--progress': `${progressPercent}%` } as React.CSSProperties} />
            </div>

            <div className="intro-actions">
              <button className="menu-button primary" type="button" onClick={enterHub}>
                {hasProgress ? '繼續冒險' : '開始冒險'}
              </button>
              {hasProgress && (
                <button className="menu-button quiet" type="button" onClick={resetProgress}>
                  重開存檔
                </button>
              )}
            </div>
          </div>
          <div className="intro-holo" aria-hidden="true">
            <span className="intro-holo-ring ring-a" />
            <span className="intro-holo-ring ring-b" />
            <img src={heroArtUrl} alt="" />
            <span className="intro-holo-core" />
          </div>
        </section>
      </main>
    )
  }

  if (viewMode === 'hub') {
    return (
      <main className="game-shell menu-shell hub-shell idle-hub-shell">
        <ClockworkScene mode="hub" />

        <header className="idle-topbar">
          <div>
            <p className="eyebrow">主城據點</p>
            <strong>週期城・鐘塔前哨</strong>
          </div>
          <div className="idle-status" aria-label="角色狀態">
            <span>碎片 {fragmentCount}/{challenges.length}</span>
            <span>圖鑑 {ownedItems.length}/{codexCards.length}</span>
            <span>成就 {achievementCount}/{achievements.length}</span>
          </div>
          <div className="idle-progress">
            <span>真相同步 {fragmentCount}/{challenges.length}</span>
            <i style={{ '--progress': `${progressPercent}%` } as React.CSSProperties} />
          </div>
        </header>

        <section className="idle-stage" aria-label="主城移動區" style={playerStageStyle} onPointerDown={movePlayerOnStage}>
          <div className="chamber-back-wall" aria-hidden="true" />
          <div className="chamber-side-wall left" aria-hidden="true" />
          <div className="chamber-side-wall right" aria-hidden="true" />
          <div className="chamber-floor-plane" aria-hidden="true" />
          <div className="chamber-boundary boundary-back" aria-hidden="true" />
          <div className="chamber-boundary boundary-front" aria-hidden="true" />
          <div className="idle-ring ring-one" />
          <div className="idle-ring ring-two" />
          <div className="town-floor" aria-hidden="true" />
          <div className="mission-gates" aria-label="五個任務門">
            {chapterStatus.map((challenge) => (
              <button
                type="button"
                className={`mission-gate ${challenge.id} ${
                  challenge.isActive
                    ? 'active'
                    : challenge.hasFragment
                      ? 'done'
                      : challenge.isUnlocked
                        ? ''
                        : 'locked'
                }`}
                onClick={() => openDoorPrompt(challenge.id)}
                key={challenge.id}
                style={gateStageStyle(challenge.id)}
              >
                <span className={`gate-sigil ${challenge.id}`} aria-hidden="true" />
                <span className="gate-core" aria-hidden="true" />
                <strong>{challenge.shortTitle}</strong>
                <small>{challenge.hasFragment ? '碎片取得' : challenge.isDone ? '待推理' : challenge.isUnlocked ? '可進入' : '封鎖中'}</small>
              </button>
            ))}
          </div>
          <button
            className={finalObserverReady ? 'observer-npc final-ready' : 'observer-npc'}
            type="button"
            onClick={openObserverDialog}
            style={observerStageStyle}
          >
            <span className="observer-aura" aria-hidden="true" />
            <span className="observer-body" aria-hidden="true">
              <i />
              <b />
            </span>
            <strong>{observerName}</strong>
            <small>{finalObserverReady ? '最後推理' : '交談'}</small>
          </button>
          {finalObserverReady && <span className="observer-hint" style={observerStageStyle}>五枚碎片已齊，去問觀測員</span>}
          <div className="idle-player town-player" style={playerLayerStyle}>
            <span className="idle-player-aura" />
            <img className="idle-player-art" src={heroArtUrl} alt="" aria-hidden="true" />
            <span className="idle-player-rim" />
          </div>
          <div className="idle-nameplate">
            <span>見習調律師</span>
            <strong>第六席候補</strong>
          </div>
        </section>

        <aside className="idle-side-actions" aria-label="快捷系統">
          <button type="button" onClick={() => setHubPanel('chapters')}>
            <span>01</span>
            <strong>章節</strong>
          </button>
          <button type="button" onClick={() => setHubPanel('fragments')}>
            <span>{fragmentCount}/{challenges.length}</span>
            <strong>碎片</strong>
          </button>
          <button type="button" onClick={openFinalRoute}>
            <span>{finalDeductionSolved ? 'OK' : allFragmentsFound ? '!' : 'LOCK'}</span>
            <strong>終局</strong>
          </button>
        </aside>

        {hubObserverOpen && (
          <section className={finalObserverReady ? 'observer-dialog-layer final-ready' : 'observer-dialog-layer'} aria-label="觀測員對話">
            <button
              className="observer-dialog-backdrop"
              type="button"
              onClick={() => setHubObserverOpen(false)}
              aria-label="關閉觀測員對話"
            />
            <article className="observer-dialog-card">
              <div className="observer-dialog-portrait">
                <span className="observer-avatar" aria-hidden="true">
                  <i />
                  <b />
                </span>
              </div>
              <div className="observer-dialog-copy">
                <p className="eyebrow">{finalObserverReady ? '終局詢問' : '觀測員通訊'}</p>
                <h2>{observerName}</h2>
                <span>{finalObserverReady ? '她正等你把五份供詞交出來。' : '鐘塔前哨的記錄者。'}</span>
                <p>{hubObserverLine}</p>

                {allFragmentsFound ? (
                  <div className="observer-final-case">
                    <p className="eyebrow">{finalDeductionSolved ? '最終故事解鎖' : '最終推理'}</p>
                    <strong>{finalDeductionSolved ? '第六席的答案' : finalDeductionCheck.prompt}</strong>
                    {!finalDeductionSolved && (
                      <>
                        <div className="deduction-options final-options">
                          {finalDeductionCheck.options.map((option, index) => (
                            <button
                              className={
                                finalDeductionAnswer === index
                                  ? index === finalDeductionCheck.answerIndex
                                    ? 'correct'
                                    : 'wrong'
                                  : ''
                              }
                              type="button"
                              onClick={() => chooseFinalDeduction(index)}
                              key={option}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                        {finalDeductionAnswer !== null && (
                          <small>
                            {finalDeductionAnswer === finalDeductionCheck.answerIndex
                              ? finalDeductionCheck.success
                              : finalDeductionCheck.fail}
                          </small>
                        )}
                      </>
                    )}
                    {finalDeductionSolved && finalRevealLines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                ) : (
                  <div className="observer-final-case locked-final">
                    <p className="eyebrow">終局尚未開放</p>
                    <strong>還缺少 {challenges.length - fragmentCount} 枚週期碎片</strong>
                    <span>碎片齊全後，觀測員會在主城裡發出提示。</span>
                  </div>
                )}
              </div>
            </article>
          </section>
        )}

        {doorPromptId && promptedChallenge && promptedStatus && promptedDialogue && promptedFragment && (
          <section className={`door-dialog-layer sim-theme-${doorPromptId}`} aria-label="任務門對話">
            <button className="door-dialog-backdrop" type="button" onClick={() => setDoorPromptId(null)} aria-label="關閉任務門對話" />
            <article className={promptedStatus.isUnlocked ? 'door-dialog-card' : 'door-dialog-card locked'}>
              <div className="door-dialog-portrait">
                <img src={heroArtUrl} alt="" aria-hidden="true" />
              </div>
              <div className="door-dialog-copy">
                <p className="eyebrow">{promptedStatus.isUnlocked ? '節點接入' : '節點未供能'}</p>
                <h2>{promptedChallenge.shortTitle}</h2>
                <span>{promptedChallenge.area}</span>
                <p>
                  <strong>{promptedChallenge.npc}：</strong>
                  {promptedStatus.isUnlocked
                    ? promptedStatus.hasFragment
                      ? promptedDialogue.fragment
                      : promptedStatus.isDone
                        ? promptedDialogue.solved
                        : promptedDialogue.before
                    : '這扇門還沒有供能。先完成前一個週期節點，門上的紋路才會亮起。'}
                </p>
                <div className="door-dialog-clue">
                  <small>{promptedStatus.hasFragment ? promptedFragment.title : '門縫提示'}</small>
                  <strong>{promptedStatus.hasFragment ? promptedFragment.reveal : promptedFragment.hint}</strong>
                </div>
                <div className="door-dialog-actions">
                  <button
                    className="menu-button primary"
                    type="button"
                    onClick={() => enterDoorMission(promptedChallenge.id)}
                    disabled={!promptedStatus.isUnlocked}
                  >
                    {promptedStatus.isUnlocked ? '進入任務' : '尚未解鎖'}
                  </button>
                  <button
                    className="menu-button quiet"
                    type="button"
                    onClick={() => {
                      setDoorPromptId(null)
                      setHubPanel('quest')
                    }}
                  >
                    查看任務紀錄
                  </button>
                </div>
              </div>
            </article>
          </section>
        )}

        <nav className="hub-dock" aria-label="主城系統">
          <button className={hubPanel === 'quest' ? 'active' : ''} type="button" onClick={() => setHubPanel('quest')}>
            <span>任</span>
            <strong>主線</strong>
          </button>
          <button className={hubPanel === 'chapters' ? 'active' : ''} type="button" onClick={() => setHubPanel('chapters')}>
            <span>圖</span>
            <strong>章節</strong>
          </button>
          <button className={hubPanel === 'fragments' ? 'active' : ''} type="button" onClick={() => setHubPanel('fragments')}>
            <span>片</span>
            <strong>碎片</strong>
          </button>
          <button className={hubPanel === 'codex' ? 'active' : ''} type="button" onClick={() => setHubPanel('codex')}>
            <span>鑑</span>
            <strong>圖鑑</strong>
          </button>
          <button className={hubPanel === 'achievements' ? 'active' : ''} type="button" onClick={() => setHubPanel('achievements')}>
            <span>徽</span>
            <strong>成就</strong>
          </button>
        </nav>

        {hubPanel && (
          <section className="hub-panel-layer" aria-label="系統選單">
            <button className="hub-panel-backdrop" type="button" onClick={() => setHubPanel(null)} aria-label="關閉系統選單" />
            <div className="hub-system-panel">
              <div className="hub-panel-header">
                <div>
                  <p className="eyebrow">
                    {hubPanel === 'quest'
                      ? '主線任務'
                      : hubPanel === 'chapters'
                        ? '章節地圖'
                        : hubPanel === 'fragments'
                          ? '週期碎片'
                          : hubPanel === 'codex'
                            ? '提示圖鑑'
                            : hubPanel === 'achievements'
                              ? '成就徽章'
                              : '最終推理'}
                  </p>
                  <strong>
                    {hubPanel === 'quest'
                      ? activeChallenge.title
                      : hubPanel === 'chapters'
                        ? '五座週期節點'
                        : hubPanel === 'fragments'
                          ? `${fragmentCount}/${challenges.length} 份供詞`
                          : hubPanel === 'codex'
                            ? `線索卡 ${ownedItems.length}/${codexCards.length}`
                            : hubPanel === 'achievements'
                              ? `鐘塔徽章 ${achievementCount}/${achievements.length}`
                              : finalDeductionSolved
                                ? '第六席的答案'
                                : '提交最後一次推理'}
                  </strong>
                </div>
                <button className="icon-button" type="button" onClick={() => setHubPanel(null)} aria-label="關閉系統選單" title="關閉">
                  ×
                </button>
              </div>

              {hubPanel === 'quest' && (
                <div className="panel-scroll">
                  <p className="panel-story">{activeDialogue.before}</p>
                  <div className="hub-objectives">
                    {result.objectives.map((objective, index) => (
                      <span className={objective.ready || finished[activeId] ? 'ready' : ''} key={objective.label}>
                        {objective.ready || finished[activeId] ? '✓' : index + 1} {objective.label}
                      </span>
                    ))}
                  </div>
                  <div className="hub-actions">
                    <button className="menu-button primary" type="button" onClick={enterMission}>
                      進入節點
                    </button>
                    <button className="menu-button quiet" type="button" onClick={resetActive}>
                      重整裝置
                    </button>
                  </div>
                </div>
              )}

              {hubPanel === 'chapters' && (
                <div className="panel-scroll">
                  <div className="chapter-path">
                    {chapterStatus.map((chapter, index) => (
                      <button
                        type="button"
                        className={
                          chapter.isActive
                            ? 'chapter-node active'
                            : chapter.hasFragment
                              ? 'chapter-node done'
                              : chapter.isUnlocked
                                ? 'chapter-node'
                                : 'chapter-node locked'
                        }
                        onClick={() => selectChallenge(chapter.id)}
                        disabled={!chapter.isUnlocked}
                        key={chapter.id}
                      >
                        <span>{chapter.hasFragment ? '✓' : chapter.isDone ? '!' : index + 1}</span>
                        <strong>{chapter.shortTitle}</strong>
                        <small>{chapter.hasFragment ? '碎片取得' : chapter.isDone ? '待推理' : chapter.isUnlocked ? '可進入' : '封鎖中'}</small>
                      </button>
                    ))}
                  </div>
                  <div className="hub-missions panel-missions">
                    {chapterStatus.map((challenge) => (
                      <button
                        type="button"
                        className={
                          challenge.isActive
                            ? 'mission-card active'
                            : challenge.hasFragment
                              ? 'mission-card done'
                              : challenge.isUnlocked
                                ? 'mission-card'
                                : 'mission-card locked'
                        }
                        onClick={() => selectChallenge(challenge.id)}
                        disabled={!challenge.isUnlocked}
                        key={challenge.id}
                      >
                        <span className="mission-medal">{challenge.hasFragment ? '✓' : challenge.isDone ? '!' : challenge.order}</span>
                        <i className={`mission-sigil ${challenge.id}`} aria-hidden="true" />
                        <strong>{challenge.shortTitle}</strong>
                        <small>{challenge.hasFragment ? '碎片已解封' : challenge.isDone ? '等待推理檢定' : challenge.isUnlocked ? challenge.area : '尚未開放'}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hubPanel === 'fragments' && (
                <div className="panel-scroll">
                  <div className="fragment-grid">
                    {challenges.map((challenge) => {
                      const fragment = storyFragments[challenge.id]
                      const revealed = fragments[challenge.id]
                      return (
                        <article
                          className={
                            revealed
                              ? 'fragment-card revealed'
                              : challenge.id === activeId
                                ? 'fragment-card active'
                                : 'fragment-card'
                          }
                          key={challenge.id}
                        >
                          <span>{revealed ? '已解封' : `碎片 ${challenge.order}`}</span>
                          <strong>{revealed ? fragment.title : challenge.shortTitle}</strong>
                          <p>{revealed ? fragment.text : '碎片仍在節點深處。完成節點後，回答它留下的矛盾。'}</p>
                          <small>{revealed ? fragment.hint : '線索未明'}</small>
                        </article>
                      )
                    })}
                  </div>
                  {allFragmentsFound && (
                    <button className="menu-button primary panel-wide-action" type="button" onClick={openFinalRoute}>
                      去問觀測員
                    </button>
                  )}
                </div>
              )}

              {hubPanel === 'codex' && (
                <div className="panel-scroll item-grid">
                  {codexCards.map((item) => {
                    const owned = !item.challengeId || fragments[item.challengeId]
                    return (
                      <div className={owned ? 'item-slot owned' : 'item-slot locked'} key={item.id}>
                        <i aria-hidden="true" />
                        <strong>{owned ? item.name : '封存卡片'}</strong>
                        <span>{owned ? item.note : '解封對應碎片後取得。'}</span>
                        {owned && <em>{item.functionText}</em>}
                      </div>
                    )
                  })}
                </div>
              )}

              {hubPanel === 'achievements' && (
                <div className="panel-scroll achievement-list">
                  {achievementState.map((achievement) => (
                    <div className={achievement.achieved ? 'achievement earned' : 'achievement'} key={achievement.id}>
                      <span>{achievement.achieved ? '✓' : '•'}</span>
                      <div>
                        <strong>{achievement.name}</strong>
                        <small>{achievement.note}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {hubPanel === 'final' && (
                <div className="panel-scroll">
                  {!allFragmentsFound && (
                    <div className="final-reveal locked-final">
                      <p className="eyebrow">終局尚未開放</p>
                      <strong>還缺少 {challenges.length - fragmentCount} 枚週期碎片</strong>
                      <span>先回到節點完成碎片檢定，五份供詞齊全後才能提交最後推理。</span>
                    </div>
                  )}
                  {allFragmentsFound && (
                    <div className="final-reveal">
                      <p className="eyebrow">{finalDeductionSolved ? '最終故事解鎖' : '最終推理'}</p>
                      <strong>{finalDeductionSolved ? '第六席的答案' : finalDeductionCheck.prompt}</strong>
                      {!finalDeductionSolved && (
                        <>
                          <div className="deduction-options final-options">
                            {finalDeductionCheck.options.map((option, index) => (
                              <button
                                className={
                                  finalDeductionAnswer === index
                                    ? index === finalDeductionCheck.answerIndex
                                      ? 'correct'
                                      : 'wrong'
                                    : ''
                                }
                                type="button"
                                onClick={() => chooseFinalDeduction(index)}
                                key={option}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          {finalDeductionAnswer !== null && (
                            <small>
                              {finalDeductionAnswer === finalDeductionCheck.answerIndex
                                ? finalDeductionCheck.success
                                : finalDeductionCheck.fail}
                            </small>
                          )}
                        </>
                      )}
                      {finalDeductionSolved && finalRevealLines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    )
  }

  return (
    <main className={`game-shell sim-shell sim-theme-${activeId}${activeComplete ? ' sim-complete' : ''}`}>
      <PhaserStage settingsRef={settingsRef} onValuePatch={updateValuesFromScene} />

      <button className="chapter-chip back-chip" type="button" onClick={enterHub}>
        <span>返回主城</span>
        <strong>{activeChallenge.area}</strong>
      </button>

      <section className="quest-panel" aria-label="任務">
        <p className="eyebrow">事故節點 {String(activeChallenge.order).padStart(2, '0')}</p>
        <h1>{activeChallenge.title}</h1>
        <p className="scene-tone">{activeChallenge.sceneTone}</p>
        <p className="story">{activeDialogue.before}</p>
        <div className="objective-list">
          {result.objectives.map((objective, index) => (
            <div className={objective.ready ? 'objective done' : 'objective'} key={objective.label}>
              <span className="objective-mark">{objective.ready ? '✓' : index + 1}</span>
              <span>{objective.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sync-panel" aria-label="同步率">
        <div
          className={activeComplete ? 'sync-dial complete' : 'sync-dial'}
          style={{ '--sync': `${(activeComplete ? 100 : result.sync) * 3.6}deg` } as React.CSSProperties}
        >
          <span>{activeComplete ? 100 : result.sync}</span>
          <small>%</small>
        </div>
        <div>
          <p className="eyebrow">週期核心同步率</p>
          <strong>{activeComplete ? '完成' : result.sync >= 70 ? '接近' : '失衡'}</strong>
        </div>
      </section>

      <aside className="control-panel" aria-label="任務控制台">
        <div className="panel-header">
          <div>
            <p className="eyebrow">調律台</p>
            <h2>{activeChallenge.shortTitle}</h2>
          </div>
          <div className="panel-actions">
            <button className="icon-button" type="button" onClick={resetActive} aria-label="重置目前關卡" title="重置目前關卡">
              ↺
            </button>
            <button className="icon-button danger" type="button" onClick={resetProgress} aria-label="重置全部進度" title="重置全部進度">
              ×
            </button>
          </div>
        </div>

        {hiddenSceneControls.length > 0 && (
          <div className="scene-control-note">
            <strong>{activeId === 'orbit' ? '彈弓發射' : '場景操作'}</strong>
            <span>
              {activeId === 'orbit'
                ? '按住左側發射器往後拉，放開後讓探針被中央重力井偏折並擊中右側封印靶。'
                : activeId === 'spring'
                  ? '振幅滑桿已移除：按住彈簧方塊可拖動，按住期間時間暫停，放開後才開始模擬。'
                  : '角度滑桿已移除：按住擺錘可拖動，按住期間時間暫停，放開後才開始模擬。'}
            </span>
          </div>
        )}

        {visibleControls.map((control) => (
          <label className="slider-row" key={`${activeId}-${control.key}`}>
            <span>{control.label}</span>
            <output>
              {values[control.key].toFixed(control.step < 1 ? 2 : 0)}
              {control.unit}
            </output>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={values[control.key]}
              onChange={(event) => updateValue(control.key, Number(event.target.value))}
              aria-label={control.label}
            />
          </label>
        ))}

        <div className="readout-grid" aria-label="觀測讀數">
          {result.metrics.map((metric) => (
            <div className={metric.ready ? 'readout locked' : 'readout'} key={`${activeId}-${metric.key}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        <div className={activeComplete ? 'feedback complete' : 'feedback'}>
          <p>{activeComplete ? activeChallenge.successLine : result.feedback}</p>
          {!activeComplete && (
            <small>
              {activeId === 'orbit'
                ? '提示：像憤怒鳥一樣往反方向拉開發射器；短軌跡只顯示前段，真正路徑會被中央重力井彎折。'
                : activeChallenge.solveHint}
            </small>
          )}
          {activeComplete && nextId && <small>門已開啟：但碎片只會回應正確的推理。</small>}
          {activeComplete && !nextId && <small>最後的門已開啟，剩下的是那張沒有名字的生日卡。</small>}
        </div>

        {activeComplete && (
          <div className={activeDeductionSolved ? 'deduction-panel solved' : 'deduction-panel'}>
            <p className="eyebrow">碎片檢定</p>
            <strong>{activeCheck.prompt}</strong>
            <div className="deduction-options">
              {activeCheck.options.map((option, index) => (
                <button
                  className={
                    activeDeductionAnswer === index
                      ? index === activeCheck.answerIndex
                        ? 'correct'
                        : 'wrong'
                      : ''
                  }
                  type="button"
                  onClick={() => chooseDeduction(index)}
                  key={option}
                >
                  {option}
                </button>
              ))}
            </div>
            {activeDeductionAnswer !== null && (
              <small>
                {activeDeductionAnswer === activeCheck.answerIndex ? activeCheck.success : activeCheck.fail}
              </small>
            )}
          </div>
        )}

        <div className="story-actions">
          <button
            className="story-button"
            type="button"
            onClick={() => setLoreOpen((open) => !open)}
            disabled={!activeComplete || !activeDeductionSolved}
          >
            {activeDeductionSolved ? (loreOpen ? '收起週期碎片' : '讀取週期碎片') : '碎片尚未解封'}
          </button>
          <button
            className="story-button next"
            type="button"
            onClick={enterNext}
            disabled={!activeComplete}
          >
            {nextId ? '回主城接下一關' : '回主城結算'}
          </button>
        </div>
      </aside>

      <nav className="world-map" aria-label="章節地圖">
        {challenges.map((challenge) => {
          const isDone = finished[challenge.id]
          const hasFragment = fragments[challenge.id]
          const isUnlocked = unlocked[challenge.id]
          return (
            <button
              type="button"
              className={
                challenge.id === activeId
                  ? 'map-node active'
                  : hasFragment
                    ? 'map-node done'
                    : isUnlocked
                      ? 'map-node'
                      : 'map-node locked'
              }
              onClick={() => selectChallenge(challenge.id)}
              disabled={!isUnlocked}
              key={challenge.id}
            >
              <span>{hasFragment ? '✓' : isDone ? '!' : challenge.order}</span>
              <strong>{challenge.shortTitle}</strong>
            </button>
          )
        })}
      </nav>

      <section className={loreOpen ? 'lore-strip open' : 'lore-strip'} aria-live="polite">
        <p className="eyebrow">週期碎片</p>
        <strong>{activeDeductionSolved ? activeFragment.text : '碎片尚未解封。'}</strong>
        <span>
          {activeDeductionSolved ? activeFragment.reveal : '完成節點後，回答它留下的矛盾。'}
          {allFragmentsFound
            ? finalDeductionSolved
              ? ' 終局推理已完成，返回主城讀取最終故事。'
              : ' 五枚碎片已湊齊，返回主城點選觀測員。'
            : ` 已取得 ${fragmentCount}/${challenges.length} 枚碎片。`}
        </span>
      </section>

      <button className={activeComplete ? 'sim-observer-call complete' : 'sim-observer-call'} type="button" onClick={openSimObserverDialog}>
        <span className="observer-miniature" aria-hidden="true">
          <i />
          <b />
        </span>
        <strong>{observerName}</strong>
        <small>{activeComplete ? '檢視判讀' : '詢問提示'}</small>
      </button>

      {simObserverOpen && (
        <section className={`observer-dialog-layer sim-theme-${activeId}`} aria-label="模擬觀測員對話">
          <button
            className="observer-dialog-backdrop"
            type="button"
            onClick={() => setSimObserverOpen(false)}
            aria-label="關閉觀測員對話"
          />
          <article className="observer-dialog-card sim-dialog">
            <div className="observer-dialog-portrait">
              <span className="observer-avatar" aria-hidden="true">
                <i />
                <b />
              </span>
            </div>
            <div className="observer-dialog-copy">
              <p className="eyebrow">節點觀測</p>
              <h2>{observerName}</h2>
              <span>{activeChallenge.area}</span>
              <p>{simObserverLine}</p>
              <div className="observer-final-case">
                <p className="eyebrow">目前讀數</p>
                <strong>{activeComplete ? activeChallenge.successLine : result.feedback}</strong>
                <span>
                  {activeId === 'orbit'
                    ? '用滑鼠或觸控按住發射器向後拉，放開後讓探針穿過重力井。'
                    : activeChallenge.solveHint}
                </span>
              </div>
            </div>
          </article>
        </section>
      )}
    </main>
  )
}

export default App

