/**
 * juice.ts — 遊戲體感工具（音效 + 觸覺 + 畫面粒子）
 *
 * 設計目標：在「沒有任何音檔」的前提下，用 WebAudio 即時合成所有 SFX，
 * 並提供輕量的 DOM 粒子爆發，讓每個關鍵互動都有回饋（juice）。
 *
 * 物理→程式邏輯：
 *   - 每個音效都是一段「振盪器 + 增益包絡」。增益用指數衰減模擬真實樂器的能量耗散。
 *   - BGM 是兩個微微失諧（detune）的正弦波疊加，產生緩慢的「拍頻」(beat frequency)，
 *     聽起來像低頻嗡鳴／環境氛圍，對應週期城停止報時的空寂感。
 */

type SfxName =
  | 'hover'
  | 'click'
  | 'back'
  | 'unlock'    // 進入關卡 / 開門
  | 'success'   // 過關（上行琶音）
  | 'fragment'  // 解開碎片（閃光和弦）
  | 'error'     // 推理錯誤（低頻嗡鳴）
  | 'final'     // 終局揭曉（莊嚴和弦）

// 五關各自的場景互動音效（每關音色不同）
export type SceneSfxName =
  | 'orbit-grab' | 'orbit-launch' | 'orbit-hit'        // 重力彈射：拉弓 / 發射 / 命中
  | 'spring-grab' | 'spring-release'                   // 彈簧：抓取 / 彈放 boing
  | 'pendulum-grab' | 'pendulum-release'               // 單擺：抓取 / 擺放
  | 'tick-orbit' | 'tick-force' | 'tick-refcircle' | 'tick-spring' | 'tick-pendulum' // 各關滑桿微調

const STORAGE_KEY = 'periodic-motion-muted-v1'

// ── 「週期城」主題音樂資料 ──────────────────────────────────────
// A 小調家族 4 和弦循環（pad 三音）：憂鬱、克制，像停擺的鐘。
const PAD_CHORDS = [
  [220.0, 261.63, 329.63], // Am  (A3 C4 E4)
  [174.61, 220.0, 261.63], // F   (F3 A3 C4)
  [261.63, 329.63, 392.0], // C   (C4 E4 G4)
  [164.81, 196.0, 246.94], // Em  (E3 G3 B3)
]
// A 小調五聲音階（高八度）—— 飄忽的鐘琴旋律用。
const MELODY_SCALE = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0]

class JuiceEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private bgmGain: GainNode | null = null
  private bgmFilter: BiquadFilterNode | null = null
  private bgmDelay: DelayNode | null = null
  private bgmStop: OscillatorNode[] = [] // 全部需停止的振盪器（pad + 低音 + LFO）
  private padOscs: OscillatorNode[] = [] // 6 個 pad 音（換和弦時 retune）
  private subOsc: OscillatorNode | null = null
  private bgmTimer: ReturnType<typeof setInterval> | null = null
  private nextChordTime = 0
  private nextChimeTime = 0
  private nextMelodyTime = 0
  private chordIndex = 0
  private chimeToggle = false
  private muted = false
  private bgmOn = false

  constructor() {
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      this.muted = false
    }
  }

  /** WebAudio 必須在使用者手勢後才能啟動，故延遲建立 context。 */
  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.9
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  isMuted() {
    return this.muted
  }

  /** 切換靜音，回傳新的靜音狀態。 */
  toggleMute(): boolean {
    this.muted = !this.muted
    try {
      window.localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05)
    }
    if (this.muted) this.stopBgm()
    else if (this.bgmOn) this.startBgm()
    return this.muted
  }

  /** 合成單一音符：oscillator + 指數衰減包絡。 */
  private tone(
    freq: number,
    start: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    ctx: AudioContext,
    out: AudioNode,
    glideTo?: number,
  ) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    gain.connect(out)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  playSfx(name: SfxName) {
    if (this.muted) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const out = this.master

    switch (name) {
      case 'hover':
        this.tone(880, t, 0.08, 'sine', 0.08, ctx, out)
        break
      case 'click':
        this.tone(523.25, t, 0.1, 'triangle', 0.16, ctx, out, 740)
        break
      case 'back':
        this.tone(392, t, 0.12, 'triangle', 0.14, ctx, out, 262)
        break
      case 'unlock':
        // 開門：兩段上行 + 一抹金屬泛音
        this.tone(330, t, 0.16, 'sawtooth', 0.1, ctx, out, 494)
        this.tone(988, t + 0.06, 0.22, 'sine', 0.09, ctx, out)
        break
      case 'success': {
        // 過關：大調琶音 C-E-G-C（上行能量釋放）
        const notes = [523.25, 659.25, 783.99, 1046.5]
        notes.forEach((f, i) => this.tone(f, t + i * 0.09, 0.5, 'triangle', 0.16, ctx, out))
        this.tone(130.81, t, 0.7, 'sine', 0.12, ctx, out) // 低音支撐
        break
      }
      case 'fragment': {
        // 碎片解封：明亮閃光和弦 + 高頻晶光
        const chord = [659.25, 987.77, 1318.5]
        chord.forEach((f) => this.tone(f, t, 0.6, 'sine', 0.12, ctx, out))
        this.tone(2093, t + 0.04, 0.4, 'sine', 0.06, ctx, out)
        break
      }
      case 'error':
        // 錯誤：小二度不諧和 + 下滑
        this.tone(174.61, t, 0.32, 'sawtooth', 0.12, ctx, out, 110)
        this.tone(185, t, 0.32, 'square', 0.06, ctx, out, 116)
        break
      case 'final': {
        // 終局：莊嚴小調和弦堆疊
        const chord = [261.63, 311.13, 392, 523.25]
        chord.forEach((f, i) => this.tone(f, t + i * 0.12, 1.4, 'sine', 0.14, ctx, out))
        break
      }
    }
  }

  /** 滑桿微調音：依關卡給不同音色（極短、低音量、需在 React 端節流）。 */
  playSliderTick(level: string) {
    this.playScene(('tick-' + level) as SceneSfxName)
  }

  /** 五關場景互動音效，每關音色獨立。 */
  playScene(name: SceneSfxName) {
    if (this.muted) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const out = this.master

    switch (name) {
      // ── 重力彈射（青・重力）──────────────────────────────
      case 'tick-orbit':
        this.tone(660, t, 0.06, 'sine', 0.05, ctx, out)
        break
      case 'orbit-grab': // 拉弓：低頻上揚的張力聲
        this.tone(170, t, 0.2, 'sawtooth', 0.1, ctx, out, 280)
        break
      case 'orbit-launch': // 發射：上揚 twang + 下沉 whoosh
        this.tone(880, t, 0.18, 'triangle', 0.16, ctx, out, 220)
        this.tone(240, t, 0.32, 'sawtooth', 0.1, ctx, out, 70)
        break
      case 'orbit-hit': // 命中封印靶：低頻撞擊 + 明亮 ping
        this.tone(130, t, 0.32, 'sine', 0.22, ctx, out, 52)
        this.tone(1400, t + 0.01, 0.16, 'sine', 0.1, ctx, out)
        break

      // ── 向心力（緋紅・旋轉）──────────────────────────────
      case 'tick-force': // 兩音快速旋繞感
        this.tone(440, t, 0.05, 'triangle', 0.06, ctx, out)
        this.tone(580, t + 0.045, 0.05, 'triangle', 0.05, ctx, out)
        break

      // ── 參考圓（天藍・投影波）────────────────────────────
      case 'tick-refcircle': // 帶微滑音的純正弦，像波形
        this.tone(520, t, 0.09, 'sine', 0.06, ctx, out, 588)
        break

      // ── 彈簧（青綠・彈性）────────────────────────────────
      case 'tick-spring':
        this.tone(720, t, 0.05, 'square', 0.045, ctx, out)
        break
      case 'spring-grab': // 機械卡榫聲
        this.tone(300, t, 0.05, 'square', 0.08, ctx, out, 220)
        break
      case 'spring-release': // 彈放：boing（下滑 + 回彈泛音）
        this.tone(540, t, 0.36, 'triangle', 0.16, ctx, out, 170)
        this.tone(360, t + 0.07, 0.26, 'sine', 0.08, ctx, out, 210)
        break

      // ── 單擺（琥珀・鐘錶）────────────────────────────────
      case 'tick-pendulum': // 木魚般的 tock
        this.tone(380, t, 0.05, 'square', 0.06, ctx, out, 300)
        break
      case 'pendulum-grab': // 輕柔抓取
        this.tone(260, t, 0.05, 'triangle', 0.07, ctx, out)
        break
      case 'pendulum-release': // 擺放：低頻擺動 whoosh + 鐘錶 tick
        this.tone(180, t, 0.3, 'sine', 0.1, ctx, out, 120)
        this.tone(900, t, 0.05, 'square', 0.05, ctx, out)
        break
    }
  }

  /**
   * 「週期城」主題 BGM —— 生成式環境音樂（無音檔）。
   * 結構：
   *   1. 連續 pad：A 小調 4 和弦循環（每 2π≈6.28 秒換一次），鋸齒波經低通濾波。
   *   2. 低音：跟隨和弦根音的正弦 sub。
   *   3. 鐘響：每 3.14 秒一次的鐘聲（呼應劇情「每隔 3.14 秒傳來敲擊」），tick/tock 交替。
   *   4. 鐘琴旋律：隨機從五聲音階點綴，走回授延遲產生空間殘響。
   *   5. 呼吸感：慢速 LFO 緩緩推動濾波截止頻率。
   */
  startBgm() {
    this.bgmOn = true
    if (this.muted) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    this.stopBgm()

    // 主增益（緩慢淡入）
    this.bgmGain = ctx.createGain()
    this.bgmGain.gain.value = 0
    this.bgmGain.gain.setTargetAtTime(0.09, ctx.currentTime, 3)
    this.bgmGain.connect(this.master)

    // 暖色低通濾波：讓鋸齒 pad 不刺耳
    this.bgmFilter = ctx.createBiquadFilter()
    this.bgmFilter.type = 'lowpass'
    this.bgmFilter.frequency.value = 900
    this.bgmFilter.Q.value = 0.7
    this.bgmFilter.connect(this.bgmGain)

    // 回授延遲：給鐘聲與旋律空間殘響
    this.bgmDelay = ctx.createDelay(1.5)
    this.bgmDelay.delayTime.value = 0.42
    const feedback = ctx.createGain()
    feedback.gain.value = 0.33
    this.bgmDelay.connect(feedback)
    feedback.connect(this.bgmDelay)
    this.bgmDelay.connect(this.bgmGain)

    // 連續 pad：3 和聲音 × 2 失諧 = 6 個鋸齒振盪器
    this.padOscs = []
    const firstChord = PAD_CHORDS[0]
    for (let v = 0; v < 3; v += 1) {
      for (let d = 0; d < 2; d += 1) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = firstChord[v]
        osc.detune.value = d === 0 ? -6 : 6
        const g = ctx.createGain()
        g.gain.value = 0.1
        osc.connect(g)
        g.connect(this.bgmFilter)
        osc.start()
        this.padOscs.push(osc)
        this.bgmStop.push(osc)
      }
    }

    // 低音 sub
    this.subOsc = ctx.createOscillator()
    this.subOsc.type = 'sine'
    this.subOsc.frequency.value = firstChord[0] / 2
    const subG = ctx.createGain()
    subG.gain.value = 0.42
    this.subOsc.connect(subG)
    subG.connect(this.bgmFilter)
    this.subOsc.start()
    this.bgmStop.push(this.subOsc)

    // 呼吸 LFO → 濾波截止頻率
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.05
    lfoGain.gain.value = 260
    lfo.connect(lfoGain)
    lfoGain.connect(this.bgmFilter.frequency)
    lfo.start()
    this.bgmStop.push(lfo)

    // 排程器（lookahead）
    const start = ctx.currentTime + 0.3
    this.nextChordTime = start
    this.nextChimeTime = start + 1.0
    this.nextMelodyTime = start + 4.0
    this.chordIndex = 0
    this.chimeToggle = false
    this.bgmTimer = setInterval(() => this.scheduleBgm(), 80)
  }

  /** lookahead 排程：把未來 0.25 秒內的音樂事件排進 WebAudio 時間軸。 */
  private scheduleBgm() {
    const ctx = this.ctx
    if (!ctx || !this.bgmFilter || !this.bgmDelay) return
    const horizon = ctx.currentTime + 0.25

    while (this.nextChordTime < horizon) {
      this.applyChord(this.chordIndex, this.nextChordTime)
      this.chordIndex += 1
      this.nextChordTime += 6.28 // 2π 秒換一次和弦
    }
    while (this.nextChimeTime < horizon) {
      this.playChime(this.nextChimeTime, this.chimeToggle)
      this.chimeToggle = !this.chimeToggle
      this.nextChimeTime += 3.14 // 呼應劇情：每 3.14 秒一次鐘響
    }
    while (this.nextMelodyTime < horizon) {
      if (Math.random() < 0.65) this.playBell(this.nextMelodyTime)
      this.nextMelodyTime += 3 + Math.random() * 5
    }
  }

  /** 平滑換和弦：把 6 個 pad 音與低音 ramp 到新和弦。 */
  private applyChord(index: number, t: number) {
    const chord = PAD_CHORDS[index % PAD_CHORDS.length]
    this.padOscs.forEach((osc, i) => {
      const tone = chord[Math.floor(i / 2)]
      osc.frequency.cancelScheduledValues(t)
      osc.frequency.setValueAtTime(Math.max(osc.frequency.value, 1), t)
      osc.frequency.exponentialRampToValueAtTime(tone, t + 2.2)
    })
    if (this.subOsc) {
      this.subOsc.frequency.cancelScheduledValues(t)
      this.subOsc.frequency.setValueAtTime(Math.max(this.subOsc.frequency.value, 1), t)
      this.subOsc.frequency.exponentialRampToValueAtTime(chord[0] / 2, t + 2.2)
    }
  }

  /** 鐘響：三個泛音的鐘聲，tick(高)/tock(低) 交替，部分送進延遲產生回音。 */
  private playChime(t: number, low: boolean) {
    const ctx = this.ctx
    if (!ctx || !this.bgmFilter || !this.bgmDelay) return
    const base = low ? 196.0 : 261.63 // G3 / C4
    ;[1, 2.01, 2.99].forEach((mult, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = base * mult
      const peak = 0.16 / (i + 1)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4 - i * 0.3)
      osc.connect(g)
      g.connect(this.bgmFilter!)
      g.connect(this.bgmDelay!)
      osc.start(t)
      osc.stop(t + 1.6)
    })
  }

  /** 鐘琴旋律：從五聲音階取一音，三角波 + 八度泛音，走延遲。 */
  private playBell(t: number) {
    const ctx = this.ctx
    if (!ctx || !this.bgmDelay || !this.bgmFilter) return
    const note = MELODY_SCALE[Math.floor(Math.random() * MELODY_SCALE.length)]
    ;[1, 2].forEach((mult, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = i === 0 ? 'triangle' : 'sine'
      osc.frequency.value = note * mult
      const peak = i === 0 ? 0.09 : 0.035
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
      osc.connect(g)
      g.connect(this.bgmDelay!)
      g.connect(this.bgmFilter!)
      osc.start(t)
      osc.stop(t + 2.4)
    })
  }

  stopBgm() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = null
    }
    this.bgmStop.forEach((osc) => {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
    })
    this.bgmStop = []
    this.padOscs = []
    this.subOsc = null
    ;[this.bgmDelay, this.bgmFilter, this.bgmGain].forEach((node) => {
      if (node) {
        try {
          node.disconnect()
        } catch {
          /* ignore */
        }
      }
    })
    this.bgmDelay = null
    this.bgmFilter = null
    this.bgmGain = null
  }
}

export const juice = new JuiceEngine()

/* ──────────────────────────────────────────────────────────────
 * DOM 粒子爆發：在指定螢幕座標噴出能量碎片（用於過關 / 解封碎片）。
 * 不依賴 canvas，直接生成短命的 div，動畫結束自動移除。
 * ────────────────────────────────────────────────────────────── */

const ENERGY_COLORS = ['#38f2e6', '#ff3b6b', '#ffcf4a', '#b07bff', '#4aa8ff']

export function burstParticles(
  x: number,
  y: number,
  options: { count?: number; colors?: string[]; spread?: number; power?: number } = {},
) {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const { count = 22, colors = ENERGY_COLORS, spread = 360, power = 150 } = options
  const layer = document.createElement('div')
  layer.className = 'juice-burst-layer'
  layer.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:60;pointer-events:none;`
  document.body.appendChild(layer)

  for (let i = 0; i < count; i++) {
    const p = document.createElement('i')
    const angle = (spread * (Math.PI / 180)) * (Math.random() - 0.5) - Math.PI / 2
    const dist = power * (0.4 + Math.random() * 0.8)
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    const size = 4 + Math.random() * 7
    const color = colors[Math.floor(Math.random() * colors.length)]
    p.style.cssText = [
      'position:absolute',
      `width:${size}px`,
      `height:${size}px`,
      `background:${color}`,
      `box-shadow:0 0 10px ${color}`,
      'border-radius:50%',
      'left:0;top:0',
      `--dx:${dx}px`,
      `--dy:${dy}px`,
    ].join(';')
    p.style.animation = `juiceParticle ${0.7 + Math.random() * 0.5}s cubic-bezier(0.18,0.7,0.3,1) forwards`
    layer.appendChild(p)
  }

  window.setTimeout(() => layer.remove(), 1400)
}

/** 從一個 DOM 元素的中心點爆發粒子（方便綁在按鈕上）。 */
export function burstFromElement(el: Element | null, options?: Parameters<typeof burstParticles>[2]) {
  if (!el) return
  const rect = el.getBoundingClientRect()
  burstParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, options)
}
