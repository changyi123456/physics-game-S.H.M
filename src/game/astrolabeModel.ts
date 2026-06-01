export type ChallengeId = 'orbit' | 'force' | 'refcircle' | 'spring' | 'pendulum'

export type ControlKey =
  | 'radius'
  | 'omega'
  | 'mass'
  | 'amplitude'
  | 'springK'
  | 'length'
  | 'gravity'
  | 'angle'

export type ControlDefinition = {
  key: ControlKey
  label: string
  unit: string
  min: number
  max: number
  step: number
  defaultValue: number
}

export type Metric = {
  key: string
  label: string
  value: string
  ready?: boolean
}

export type Objective = {
  label: string
  ready: boolean
}

export type ChallengeResult = {
  metrics: Metric[]
  objectives: Objective[]
  sync: number
  completed: boolean
  feedback: string
}

export type ChallengeDefinition = {
  id: ChallengeId
  order: number
  area: string
  title: string
  shortTitle: string
  npc: string
  sceneTone: string
  story: string
  successLine: string
  lore: string
  controls: ControlDefinition[]
  solveHint: string
}

export type GameSettings = {
  challengeId: ChallengeId
  values: Record<ControlKey, number>
  sync: number
  completed: boolean
  unlocked: Record<ChallengeId, boolean>
  finished: Record<ChallengeId, boolean>
}

export type GameSettingsRef = {
  current: GameSettings
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const scoreWithin = (error: number, range: number) => clamp01(1 - error / range)
const fmt = (value: number, digits = 2) => value.toFixed(digits)

export const challenges: ChallengeDefinition[] = [
  {
    id: 'orbit',
    order: 1,
    area: '圓周廣場',
    title: '校準失控的星象儀',
    shortTitle: '星象儀',
    npc: '軌道守衛',
    sceneTone: '星盤、餐桌倒影與第六席訊號',
    story: '星象儀每轉回同一角度，前哨桌上的蛋糕就會短暫出現在反光裡。兩道鎖必須同時吻合，第一枚碎片才肯現身。',
    successLine: '星盤停止尖叫，反光裡的第六張椅子多亮了一秒。',
    lore: '重複不是牢籠，而是某人故意留下的路標。',
    solveHint: '提示解：R = 130px，ω = 2.00 rad/s。',
    controls: [
      { key: 'radius', label: '軌道半徑 R', unit: 'px', min: 90, max: 210, step: 1, defaultValue: 170 },
      { key: 'omega', label: '角速度 ω', unit: 'rad/s', min: 0.8, max: 4.4, step: 0.01, defaultValue: 3.4 },
    ],
  },
  {
    id: 'force',
    order: 2,
    area: '向心力塔',
    title: '重建看不見的拉力',
    shortTitle: '向心力',
    npc: '塔頂觀測員',
    sceneTone: '逃離路徑、紅色召回線與塔頂監視畫面',
    story: '塔頂保存著一段殘影：有人跑向出口，又像被看不見的線拖回蛋糕前。力場穩定時，影像會交出第二枚碎片。',
    successLine: '紅色召回線收束成一點，監視畫面終於不再抖動。',
    lore: '有些人不是選擇回來，而是一直被世界召回。',
    solveHint: '提示解：m = 4kg，R = 150cm，ω = 2.00 rad/s。',
    controls: [
      { key: 'mass', label: '質量 m', unit: 'kg', min: 1, max: 8, step: 0.1, defaultValue: 6 },
      { key: 'radius', label: '半徑 R', unit: 'cm', min: 80, max: 220, step: 1, defaultValue: 110 },
      { key: 'omega', label: '角速度 ω', unit: 'rad/s', min: 0.8, max: 4.2, step: 0.01, defaultValue: 3.1 },
    ],
  },
  {
    id: 'refcircle',
    order: 3,
    area: '參考圓實驗室',
    title: '解開影子的正弦碼',
    shortTitle: '參考圓',
    npc: '光影研究員',
    sceneTone: '雙重視角、投影光束與被切開的生日歌',
    story: '實驗室把同一段時間投成兩種畫面：一個人在圓上繞行，另一個人在直線上離開。兩段影像重合時，第三枚碎片會露出裂縫。',
    successLine: '投影與光幕重合，兩個「離開的人」變成同一個影子。',
    lore: '視角能把一次事故偽裝成兩次證詞。',
    solveHint: '提示解：R = 120px，ω 約 2.51 rad/s。',
    controls: [
      { key: 'amplitude', label: '振幅 R', unit: 'px', min: 70, max: 160, step: 1, defaultValue: 92 },
      { key: 'omega', label: '角速度 ω', unit: 'rad/s', min: 0.8, max: 4.4, step: 0.01, defaultValue: 1.4 },
    ],
  },
  {
    id: 'spring',
    order: 4,
    area: '彈簧工坊',
    title: '調校彈簧機械門',
    shortTitle: '彈簧',
    npc: '工坊學徒',
    sceneTone: '壓縮錄音、回彈鎖舌與蛋糕刀聲',
    story: '工坊裡的錄音匣被壓縮在彈簧門內。只有門鎖在正確節拍開合，錄音才會吐出「忘記」的真正用途。',
    successLine: '鎖舌一格格退開，錄音匣裡傳來蛋糕刀落地的聲音。',
    lore: '有些記憶被壓縮，不是為了藏起真相，而是為了讓真相別一次醒來。',
    solveHint: '提示解：m = 4kg，k 約 17.5N/m，振幅 110px。',
    controls: [
      { key: 'mass', label: '質量 m', unit: 'kg', min: 1, max: 10, step: 0.1, defaultValue: 7 },
      { key: 'springK', label: '彈性常數 k', unit: 'N/m', min: 4, max: 30, step: 0.1, defaultValue: 8 },
      { key: 'amplitude', label: '振幅 R', unit: 'px', min: 70, max: 150, step: 1, defaultValue: 136 },
    ],
  },
  {
    id: 'pendulum',
    order: 5,
    area: '單擺鐘樓',
    title: '讓鐘擺重新準時',
    shortTitle: '單擺',
    npc: '時鐘匠人',
    sceneTone: '無名生日卡、巨大鐘面與第六下鐘聲',
    story: '鐘樓保管著最後一張生日卡。擺錘每失準一次，卡上的名字就被擦掉一次。讓鐘聲回到兩秒，看看第六席到底留給誰。',
    successLine: '鐘聲準時落下，無名生日卡浮出第六行字。',
    lore: '最後一聲鐘不問誰缺席，只問誰負責重新開始。',
    solveHint: '提示解：g = 9.8m/s²，L 約 99cm，初始角小於 8°。',
    controls: [
      { key: 'length', label: '擺長 L', unit: 'cm', min: 55, max: 240, step: 1, defaultValue: 180 },
      { key: 'gravity', label: '重力 g', unit: 'm/s²', min: 1.6, max: 12, step: 0.1, defaultValue: 4.2 },
      { key: 'angle', label: '初始角 θ₀', unit: 'deg', min: 3, max: 30, step: 0.1, defaultValue: 18 },
    ],
  },
]

export const challengeMap = Object.fromEntries(
  challenges.map((challenge) => [challenge.id, challenge]),
) as Record<ChallengeId, ChallengeDefinition>

export const challengeIds = challenges.map((challenge) => challenge.id)

export function createInitialValues() {
  return challenges.reduce(
    (values, challenge) => {
      challenge.controls.forEach((control) => {
        if (values[control.key] === undefined) values[control.key] = control.defaultValue
      })
      return values
    },
    {} as Record<ControlKey, number>,
  )
}

export function createInitialUnlocked(): Record<ChallengeId, boolean> {
  return challenges.reduce(
    (unlocked, challenge, index) => {
      unlocked[challenge.id] = index === 0
      return unlocked
    },
    {} as Record<ChallengeId, boolean>,
  )
}

export function createEmptyFinished(): Record<ChallengeId, boolean> {
  return challenges.reduce(
    (finished, challenge) => {
      finished[challenge.id] = false
      return finished
    },
    {} as Record<ChallengeId, boolean>,
  )
}

export function nextChallengeId(id: ChallengeId): ChallengeId | undefined {
  const index = challengeIds.indexOf(id)
  return challengeIds[index + 1]
}

export function resetChallengeValues(id: ChallengeId, values: Record<ControlKey, number>) {
  const next = { ...values }
  challengeMap[id].controls.forEach((control) => {
    next[control.key] = control.defaultValue
  })
  return next
}

export function evaluateChallenge(
  id: ChallengeId,
  values: Record<ControlKey, number>,
): ChallengeResult {
  switch (id) {
    case 'orbit':
      return evaluateOrbit(values)
    case 'force':
      return evaluateForce(values)
    case 'refcircle':
      return evaluateRefcircle(values)
    case 'spring':
      return evaluateSpring(values)
    case 'pendulum':
      return evaluatePendulum(values)
  }
}

function finalize(metrics: Metric[], objectives: Objective[], feedback: string): ChallengeResult {
  const ready = objectives.filter((objective) => objective.ready).length
  const sync = Math.round((ready / objectives.length) * 100)
  return { metrics, objectives, sync, completed: ready === objectives.length, feedback }
}

function evaluateOrbit(values: Record<ControlKey, number>) {
  const radius = values.radius
  const omega = values.omega
  const period = (2 * Math.PI) / omega
  const speed = radius * omega
  const acceleration = radius * omega * omega
  const periodReady = Math.abs(period - 3.14) <= 0.08
  const speedReady = Math.abs(speed - 260) <= 18
  const sync = Math.round(
    (scoreWithin(Math.abs(period - 3.14), 1.2) * 0.56 +
      scoreWithin(Math.abs(speed - 260), 130) * 0.44) *
      100,
  )
  return {
    metrics: [
      { key: 'T', label: 'T', value: `${fmt(period)} s`, ready: periodReady },
      { key: 'v', label: 'v', value: `${speed.toFixed(0)} px/s`, ready: speedReady },
      { key: 'a', label: 'a', value: `${acceleration.toFixed(0)} px/s²` },
    ],
    objectives: [
      { label: '週期 T 接近 3.14 s', ready: periodReady },
      { label: '速率 v 接近 260 px/s', ready: speedReady },
    ],
    sync,
    completed: periodReady && speedReady,
    feedback: periodReady && speedReady
      ? '星盤同步完成，第一段桌邊影像開始回放。'
      : '星盤仍然失衡，桌面倒影只閃了一下。',
  }
}

function evaluateForce(values: Record<ControlKey, number>) {
  const r = values.radius / 100
  const omega = values.omega
  const mass = values.mass
  const acceleration = r * omega * omega
  const force = mass * acceleration
  const accReady = Math.abs(acceleration - 6) <= 0.25
  const forceReady = Math.abs(force - 24) <= 1.2
  return finalize(
    [
      { key: 'a', label: 'a', value: `${fmt(acceleration)} m/s²`, ready: accReady },
      { key: 'F', label: 'Fc', value: `${fmt(force)} N`, ready: forceReady },
      { key: 'r', label: 'r', value: `${fmt(r)} m` },
    ],
    [
      { label: '向心加速度接近 6.00 m/s²', ready: accReady },
      { label: '向心力接近 24.0 N', ready: forceReady },
    ],
    accReady && forceReady
      ? '平台力場穩定，監視影像不再跳格。'
      : '平台仍在外推，殘影還沒回到蛋糕前。',
  )
}

function evaluateRefcircle(values: Record<ControlKey, number>) {
  const period = (2 * Math.PI) / values.omega
  const ampReady = Math.abs(values.amplitude - 120) <= 5
  const periodReady = Math.abs(period - 2.5) <= 0.08
  return finalize(
    [
      { key: 'R', label: 'R', value: `${values.amplitude.toFixed(0)} px`, ready: ampReady },
      { key: 'T', label: 'T', value: `${fmt(period)} s`, ready: periodReady },
      { key: 'omega', label: 'ω', value: `${fmt(values.omega)} rad/s` },
    ],
    [
      { label: '投影振幅接近 120 px', ready: ampReady },
      { label: '波形週期接近 2.50 s', ready: periodReady },
    ],
    ampReady && periodReady
      ? '光影波形穩定，兩個離開的人疊成同一個身影。'
      : '投影尚未對齊，影子仍像兩段互相矛盾的證詞。',
  )
}

function evaluateSpring(values: Record<ControlKey, number>) {
  const period = 2 * Math.PI * Math.sqrt(values.mass / values.springK)
  const periodReady = Math.abs(period - 3) <= 0.08
  const ampReady = Math.abs(values.amplitude - 110) <= 5
  return finalize(
    [
      { key: 'T', label: 'T', value: `${fmt(period)} s`, ready: periodReady },
      { key: 'ratio', label: 'm/k', value: fmt(values.mass / values.springK, 3) },
      { key: 'R', label: 'R', value: `${values.amplitude.toFixed(0)} px`, ready: ampReady },
    ],
    [
      { label: '彈簧週期接近 3.00 s', ready: periodReady },
      { label: '振幅接近 110 px', ready: ampReady },
    ],
    periodReady && ampReady
      ? '彈簧機構同步，錄音匣開始吐出缺失的聲音。'
      : '齒輪還沒咬合，錄音只剩下雜訊和短促的金屬聲。',
  )
}

function evaluatePendulum(values: Record<ControlKey, number>) {
  const lengthM = values.length / 100
  const period = 2 * Math.PI * Math.sqrt(lengthM / values.gravity)
  const periodReady = Math.abs(period - 2) <= 0.05
  const angleReady = values.angle <= 8
  return finalize(
    [
      { key: 'T', label: 'T', value: `${fmt(period)} s`, ready: periodReady },
      { key: 'L', label: 'L', value: `${fmt(lengthM)} m` },
      { key: 'theta', label: 'θ₀', value: `${fmt(values.angle, 1)}°`, ready: angleReady },
    ],
    [
      { label: '鐘擺週期接近 2.00 s', ready: periodReady },
      { label: '初始角小於 8°', ready: angleReady },
    ],
    periodReady && angleReady
      ? '鐘擺節拍回正，無名生日卡露出最後一行。'
      : '鐘擺還沒準時，生日卡上的字仍被晃成一片。',
  )
}
