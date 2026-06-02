import Phaser from 'phaser'
import { challengeMap, type ChallengeId, type ControlKey, type GameSettingsRef } from './astrolabeModel'

type Star = { x: number; y: number; size: number; phase: number; drift: number }
type TrailPoint = { x: number; y: number; life: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: number }
type ValuePatch = Partial<Record<ControlKey, number>>
type ValuePatchHandler = (patch: ValuePatch) => void
type DragMode =
  | 'orbit-launch'
  | 'spring-block'
  | 'pendulum-bob'
type DragState = {
  id: ChallengeId
  mode: DragMode
  startX: number
  startY: number
  x: number
  y: number
}
type ProbeTrailPoint = { x: number; y: number }
type SlingshotProbe = {
  x: number
  y: number
  vx: number
  vy: number
  launched: boolean
  hit: boolean
  trail: ProbeTrailPoint[]
}
type ChallengeTone = {
  primary: number
  secondary: number
  accent: number
  floor: number
}

const rad = (degrees: number) => (degrees * Math.PI) / 180
const challengeIndex: Record<ChallengeId, number> = {
  orbit: 0,
  force: 1,
  refcircle: 2,
  spring: 3,
  pendulum: 4,
}
const challengeOrder: ChallengeId[] = ['orbit', 'force', 'refcircle', 'spring', 'pendulum']
const challengeTones: Record<ChallengeId, ChallengeTone> = {
  orbit: { primary: 0x5eead4, secondary: 0xfbbf24, accent: 0x67e8f9, floor: 0x0b1f2a },
  force: { primary: 0xfb7185, secondary: 0x38bdf8, accent: 0xfbbf24, floor: 0x24111d },
  refcircle: { primary: 0x38bdf8, secondary: 0xf59e0b, accent: 0x5eead4, floor: 0x0c1d31 },
  spring: { primary: 0x5eead4, secondary: 0x22c55e, accent: 0xfbbf24, floor: 0x0d221d },
  pendulum: { primary: 0xfbbf24, secondary: 0x67e8f9, accent: 0xfb7185, floor: 0x211b0b },
}

export class AstrolabeScene extends Phaser.Scene {
  private settingsRef: GameSettingsRef
  private applyValuePatch: ValuePatchHandler
  private backdrop!: Phaser.GameObjects.Graphics
  private trail!: Phaser.GameObjects.Graphics
  private world!: Phaser.GameObjects.Graphics
  private vectors!: Phaser.GameObjects.Graphics
  private fx!: Phaser.GameObjects.Graphics
  private particles!: Phaser.GameObjects.Graphics
  private vignette!: Phaser.GameObjects.Graphics
  private stars: Star[] = []
  private trails: TrailPoint[] = []
  private sparks: Spark[] = []
  private angle = -Math.PI / 2
  private phase = 0
  private lastWidth = 0
  private lastHeight = 0
  private previousCompleted = false
  private previousId = ''
  private drag?: DragState
  private slingshot?: SlingshotProbe

  constructor(settingsRef: GameSettingsRef, applyValuePatch: ValuePatchHandler) {
    super('AstrolabeScene')
    this.settingsRef = settingsRef
    this.applyValuePatch = applyValuePatch
  }

  create() {
    this.cameras.main.setBackgroundColor('#070b18')
    this.backdrop = this.add.graphics()
    this.trail = this.add.graphics()
    this.world = this.add.graphics()
    this.vectors = this.add.graphics()
    this.fx = this.add.graphics()
    this.particles = this.add.graphics()
    this.vignette = this.add.graphics()
    this.input.setDefaultCursor('crosshair')
    this.input.on('pointerdown', this.handlePointerDown, this)
    this.input.on('pointermove', this.handlePointerMove, this)
    this.input.on('pointerup', this.handlePointerUp, this)
    this.input.on('pointerupoutside', this.handlePointerUp, this)
  }

  update(time: number, delta: number) {
    const width = this.cameras.main.width
    const height = this.cameras.main.height
    const settings = this.settingsRef.current
    const dt = Math.min(delta / 1000, 0.04)

    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.lastWidth = width
      this.lastHeight = height
      this.generateStars(width, height)
    }

    if (!this.previousId) {
      this.previousId = settings.challengeId
    } else if (settings.challengeId !== this.previousId) {
      this.previousId = settings.challengeId
      this.trails = []
      this.drag = undefined
      this.slingshot = undefined
      this.angle = -Math.PI / 2
      this.phase = 0
      this.cameras.main.flash(300, 56, 189, 248, true)
    }

    if (settings.completed && !this.previousCompleted) {
      this.cameras.main.flash(420, 251, 191, 36, true)
      this.cameras.main.shake(180, 0.0025)
    }
    this.previousCompleted = settings.completed

    if (!this.isTimedCaptureDrag()) this.phase += dt
    this.angle += this.activeOmega(settings) * dt
    this.updateSlingshotProbe(dt, width, height)

    this.drawBackdrop(width, height, time, settings.sync)
    this.trail.clear()
    this.world.clear()
    this.vectors.clear()
    this.fx.clear()
    this.particles.clear()
    this.vignette.clear()
    this.drawSimulationStage(width, height, time)

    switch (settings.challengeId) {
      case 'orbit':
        this.drawGravitySlingshot(width, height, time)
        break
      case 'force':
        this.drawForceTower(width, height, time)
        break
      case 'refcircle':
        this.drawReferenceCircle(width, height, time)
        break
      case 'spring':
        this.drawSpringWorkshop(width, height, time)
        break
      case 'pendulum':
        this.drawPendulumTower(width, height)
        break
    }
    this.drawInteractionOverlay(width, height, time)
    this.drawParticles(dt)
    if (settings.completed) this.drawCompletionBloom(width, height, time)
    this.drawRpgLayer(width, height, time)
    this.drawScreenVignette(width, height, time, settings.sync)
  }

  private activeOmega(settings = this.settingsRef.current) {
    return settings.values.omega || 2
  }

  private toneFor(id = this.settingsRef.current.challengeId) {
    return challengeTones[id]
  }

  private sceneCenter(width: number, height: number) {
    return {
      x: width < 820 ? width * 0.5 : width * 0.44,
      y: height < 680 ? height * 0.48 : height * 0.53,
      scale: Math.min(width / 1180, height / 760),
    }
  }

  private isTimedCaptureDrag() {
    return (
      this.drag?.id === this.settingsRef.current.challengeId &&
      (this.drag.mode === 'spring-block' || this.drag.mode === 'pendulum-bob')
    )
  }

  private currentSpringBlock(cx: number, cy: number, scale: number) {
    const values = this.settingsRef.current.values
    const period = 2 * Math.PI * Math.sqrt(values.mass / values.springK)
    const omega = (2 * Math.PI) / period
    const displacement = Math.cos(this.phase * omega) * values.amplitude * scale
    return { x: cx + displacement, y: cy, displacement, omega }
  }

  private currentPendulumBob(cx: number, cy: number, scale: number) {
    const values = this.settingsRef.current.values
    const pivotY = cy - 170 * scale
    const length = values.length * 0.82 * scale
    const frequency = Math.sqrt(values.gravity / (values.length / 100))
    const theta = rad(values.angle) * Math.cos(this.phase * frequency)
    return {
      x: cx + Math.sin(theta) * length,
      y: pivotY + Math.cos(theta) * length,
      pivotY,
      length,
      theta,
      frequency,
    }
  }

  private pendulumDragPosition(pointerX: number, pointerY: number, cx: number, pivotY: number, scale: number) {
    const length = this.settingsRef.current.values.length * 0.82 * scale
    const dx = pointerX - cx
    const dy = Math.max(1, pointerY - pivotY)
    const theta = Phaser.Math.Clamp(Math.atan2(dx, dy), -rad(30), rad(30))

    return {
      x: cx + Math.sin(theta) * length,
      y: pivotY + Math.cos(theta) * length,
      theta,
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    const width = this.cameras.main.width
    const height = this.cameras.main.height
    const x = pointer.x
    const y = pointer.y
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const mode = this.pickDragMode(this.settingsRef.current.challengeId, x, y, cx, cy, scale, width, height)

    if (!mode) return

    let dragX = x
    let dragY = y
    if (mode === 'spring-block') {
      const block = this.currentSpringBlock(cx, cy, scale)
      dragX = block.x
      dragY = block.y
    } else if (mode === 'pendulum-bob') {
      const bob = this.currentPendulumBob(cx, cy, scale)
      dragX = bob.x
      dragY = bob.y
    }

    this.drag = {
      id: this.settingsRef.current.challengeId,
      mode,
      startX: x,
      startY: y,
      x: dragX,
      y: dragY,
    }
    if (mode === 'orbit-launch') this.updateDragPatch(width, height)
    this.cameras.main.shake(70, 0.0008)
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.drag) return

    this.drag.x = pointer.x
    this.drag.y = pointer.y
    this.updateDragPatch(this.cameras.main.width, this.cameras.main.height)
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (!this.drag) return

    if (this.drag.mode === 'orbit-launch') {
      this.drag.x = pointer.x
      this.drag.y = pointer.y
      this.updateDragPatch(this.cameras.main.width, this.cameras.main.height)
      this.releaseSlingshotProbe()
    } else {
      this.drag.x = pointer.x
      this.drag.y = pointer.y
      this.updateDragPatch(this.cameras.main.width, this.cameras.main.height)
      this.commitTimedCapture(this.cameras.main.width, this.cameras.main.height)
    }
    this.drag = undefined
  }

  private pickDragMode(
    id: ChallengeId,
    x: number,
    y: number,
    cx: number,
    cy: number,
    scale: number,
    width: number,
    height: number,
  ): DragMode | undefined {
    if (x < 18 || x > width - 18 || y < 54 || y > height - 36) return undefined

    switch (id) {
      case 'orbit':
        return this.distance(x, y, this.launcherPosition(cx, cy, scale).x, this.launcherPosition(cx, cy, scale).y) < 78 * scale
          ? 'orbit-launch'
          : undefined
      case 'force':
        return undefined
      case 'refcircle':
        return undefined
      case 'spring':
        return this.distance(x, y, this.currentSpringBlock(cx, cy, scale).x, this.currentSpringBlock(cx, cy, scale).y) < 62 * scale
          ? 'spring-block'
          : undefined
      case 'pendulum':
        return this.distance(x, y, this.currentPendulumBob(cx, cy, scale).x, this.currentPendulumBob(cx, cy, scale).y) < 58 * scale
          ? 'pendulum-bob'
          : undefined
    }
  }

  private updateDragPatch(width: number, height: number) {
    if (!this.drag || this.drag.id !== this.settingsRef.current.challengeId) return

    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const drag = this.drag

    switch (drag.mode) {
      case 'orbit-launch': {
        const launcher = this.launcherPosition(cx, cy, scale)
        const pull = this.clampToRadius(drag.x, drag.y, launcher.x, launcher.y, 88 * scale)
        drag.x = pull.x
        drag.y = pull.y
        this.slingshot = {
          x: pull.x,
          y: pull.y,
          vx: 0,
          vy: 0,
          launched: false,
          hit: false,
          trail: [],
        }
        break
      }
      case 'spring-block':
        drag.x = Phaser.Math.Clamp(drag.x, cx - 150 * scale, cx + 150 * scale)
        drag.y = cy
        break
      case 'pendulum-bob':
        {
          const pivotY = cy - 170 * scale
          const dragged = this.pendulumDragPosition(drag.x, drag.y, cx, pivotY, scale)
          drag.x = dragged.x
          drag.y = dragged.y
        }
        break
    }
  }

  private commitTimedCapture(width: number, height: number) {
    if (!this.drag || this.drag.id !== this.settingsRef.current.challengeId) return

    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const drag = this.drag
    const values = this.settingsRef.current.values

    if (drag.mode === 'spring-block') {
      const period = 2 * Math.PI * Math.sqrt(values.mass / values.springK)
      const omega = (2 * Math.PI) / period
      const amplitude = Math.abs(drag.x - cx) / scale
      this.phase = drag.x >= cx ? 0 : Math.PI / omega
      this.emitValuePatch({ amplitude })
      return
    }

    if (drag.mode === 'pendulum-bob') {
      const pivotY = cy - 170 * scale
      const dx = drag.x - cx
      const dy = Math.max(24 * scale, drag.y - pivotY)
      const angle = Math.abs(Math.atan2(dx, dy)) * (180 / Math.PI)
      const frequency = Math.sqrt(values.gravity / (values.length / 100))
      this.phase = dx >= 0 ? 0 : Math.PI / frequency
      this.emitValuePatch({ angle })
    }
  }

  private emitValuePatch(rawPatch: ValuePatch) {
    const id = this.settingsRef.current.challengeId
    const patch: ValuePatch = {}
    let hasPatch = false

    ;(Object.entries(rawPatch) as [ControlKey, number | undefined][]).forEach(([key, value]) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return

      const control = challengeMap[id].controls.find((entry) => entry.key === key)
      if (!control) return

      patch[key] = Phaser.Math.Clamp(value, control.min, control.max)
      hasPatch = true
    })

    if (hasPatch) this.applyValuePatch(patch)
  }

  private distance(x1: number, y1: number, x2: number, y2: number) {
    return Math.hypot(x2 - x1, y2 - y1)
  }

  private launcherPosition(cx: number, cy: number, scale: number) {
    return { x: cx - 350 * scale, y: cy + 148 * scale }
  }

  private targetPosition(cx: number, cy: number, scale: number) {
    return { x: cx + 350 * scale, y: cy - 130 * scale }
  }

  private clampToRadius(x: number, y: number, cx: number, cy: number, radius: number) {
    const dx = x - cx
    const dy = y - cy
    const distance = Math.max(1, Math.hypot(dx, dy))
    const clamped = Math.min(distance, radius)
    return {
      x: cx + (dx / distance) * clamped,
      y: cy + (dy / distance) * clamped,
    }
  }

  private releaseSlingshotProbe() {
    if (!this.slingshot) return

    const { x: cx, y: cy, scale } = this.sceneCenter(this.cameras.main.width, this.cameras.main.height)
    const launcher = this.launcherPosition(cx, cy, scale)
    const pull = this.distance(this.slingshot.x, this.slingshot.y, launcher.x, launcher.y)

    if (pull < 8 * scale) return

    this.slingshot = {
      ...this.slingshot,
      vx: (launcher.x - this.slingshot.x) * 4.35,
      vy: (launcher.y - this.slingshot.y) * 4.35,
      launched: true,
      trail: [{ x: this.slingshot.x, y: this.slingshot.y }],
    }
    this.emitValuePatch({ shotScore: 0 })
  }

  private updateSlingshotProbe(dt: number, width: number, height: number) {
    if (this.settingsRef.current.challengeId !== 'orbit' || !this.slingshot?.launched || this.slingshot.hit) return

    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const dx = cx - this.slingshot.x
    const dy = cy - this.slingshot.y
    const distanceSquared = Math.max(1800 * scale, dx * dx + dy * dy)
    const distance = Math.sqrt(distanceSquared)
    const gravity = 1560000 * scale
    const ax = (dx / distance) * (gravity / distanceSquared)
    const ay = (dy / distance) * (gravity / distanceSquared)

    this.slingshot.vx += ax * dt
    this.slingshot.vy += ay * dt
    this.slingshot.x += this.slingshot.vx * dt
    this.slingshot.y += this.slingshot.vy * dt
    this.slingshot.trail.push({ x: this.slingshot.x, y: this.slingshot.y })
    this.slingshot.trail = this.slingshot.trail.slice(-90)

    const target = this.targetPosition(cx, cy, scale)
    if (this.distance(this.slingshot.x, this.slingshot.y, target.x, target.y) < 14 * scale) {
      this.slingshot.hit = true
      this.slingshot.launched = false
      this.emitSpark(target.x, target.y, 0xfbbf24, 40, 220 * scale, 4.2 * scale)
      this.cameras.main.flash(360, 251, 191, 36, true)
      this.emitValuePatch({ shotScore: 1 })
    }

    const margin = 180 * scale
    if (
      this.slingshot.x < -margin ||
      this.slingshot.x > width + margin ||
      this.slingshot.y < -margin ||
      this.slingshot.y > height + margin
    ) {
      this.slingshot = undefined
    }
  }

  private generateStars(width: number, height: number) {
    const count = Math.max(90, Math.floor((width * height) / 9000))
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.8 + 0.45,
      phase: Math.random() * Math.PI * 2,
      drift: Math.random() * 12 + 4,
    }))
  }

  private drawSimulationStage(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const tone = this.toneFor()
    const deckY = height < 680 ? height * 0.72 : height * 0.78
    const pulse = 0.5 + Math.sin(time / 520) * 0.5

    this.world.fillStyle(tone.primary, 0.03 + pulse * 0.02)
    this.world.fillEllipse(cx, cy + 8 * scale, 740 * scale, 540 * scale)
    this.world.lineStyle(1, tone.accent, 0.1)
    for (let i = 0; i < 4; i += 1) {
      const arcRadius = (214 + i * 54 + Math.sin(time / 1400 + i) * 4) * scale
      this.world.beginPath()
      this.world.arc(cx, cy, arcRadius, time / 2300 + i * 0.72, time / 2300 + i * 0.72 + 1.1, false)
      this.world.strokePath()
    }

    this.world.fillStyle(0x020617, 0.58)
    this.world.fillEllipse(cx, deckY + 14 * scale, 620 * scale, 128 * scale)
    this.world.lineStyle(2, tone.primary, 0.22 + pulse * 0.06)
    this.world.strokeEllipse(cx, deckY + 10 * scale, 580 * scale, 106 * scale)
    this.world.lineStyle(1, tone.secondary, 0.12)
    this.world.strokeEllipse(cx, deckY + 16 * scale, 440 * scale, 68 * scale)

    this.world.fillStyle(0x0f172a, 0.72)
    this.world.fillRoundedRect(cx - 245 * scale, deckY - 8 * scale, 490 * scale, 46 * scale, 12 * scale)
    this.world.lineStyle(2, tone.primary, 0.26)
    this.world.strokeRoundedRect(cx - 245 * scale, deckY - 8 * scale, 490 * scale, 46 * scale, 12 * scale)
    this.world.lineStyle(1, 0xf8fafc, 0.1)
    this.world.beginPath()
    this.world.moveTo(cx - 220 * scale, deckY + 1 * scale)
    this.world.lineTo(cx + 220 * scale, deckY + 1 * scale)
    this.world.strokePath()

    for (let i = 0; i < 5; i += 1) {
      const pillarX = cx - 210 * scale + i * 105 * scale
      this.world.fillStyle(0x0b1224, 0.58)
      this.world.fillRoundedRect(pillarX - 12 * scale, deckY - 118 * scale, 24 * scale, 110 * scale, 8 * scale)
      this.world.lineStyle(1, i === challengeIndex[this.settingsRef.current.challengeId] ? tone.secondary : 0x334155, 0.38)
      this.world.strokeRoundedRect(pillarX - 12 * scale, deckY - 118 * scale, 24 * scale, 110 * scale, 8 * scale)
    }

    if (this.settingsRef.current.challengeId !== 'orbit') {
      this.world.lineStyle(2, tone.primary, 0.13)
      for (let r = 180 * scale; r <= 360 * scale; r += 46 * scale) {
        this.world.strokeCircle(cx, cy, r)
      }

      this.world.lineStyle(1, tone.secondary, 0.12 + pulse * 0.05)
      for (let i = 0; i < 10; i += 1) {
        const a = time / 3200 + (Math.PI * 2 * i) / 10
        this.world.beginPath()
        this.world.moveTo(cx + Math.cos(a) * 118 * scale, cy + Math.sin(a) * 118 * scale)
        this.world.lineTo(cx + Math.cos(a) * 346 * scale, cy + Math.sin(a) * 346 * scale)
        this.world.strokePath()
      }
    } else {
      this.world.lineStyle(2, tone.primary, 0.11)
      for (let i = 0; i < 7; i += 1) {
        const y = cy - 210 * scale + i * 70 * scale
        this.world.beginPath()
        this.world.moveTo(cx - 380 * scale, y)
        this.world.lineTo(cx - 128 * scale, y + Math.sin(time / 900 + i) * 14 * scale)
        this.world.lineTo(cx + 128 * scale, y - Math.cos(time / 880 + i) * 18 * scale)
        this.world.lineTo(cx + 380 * scale, y + Math.sin(time / 920 + i) * 12 * scale)
        this.world.strokePath()
      }
    }

    this.drawChallengeSetDressing(cx, cy, scale, time, tone)
  }

  private drawChallengeSetDressing(cx: number, cy: number, scale: number, time: number, tone: ChallengeTone) {
    const phase = time / 1000
    switch (this.settingsRef.current.challengeId) {
      case 'orbit':
        this.world.lineStyle(2, tone.secondary, 0.16)
        for (let i = 0; i < 5; i += 1) {
          const y = cy - 170 * scale + i * 68 * scale
          this.drawCubicPath(
            cx - 350 * scale,
            y,
            cx - 160 * scale,
            y + Math.sin(phase + i) * 36 * scale,
            cx + 110 * scale,
            y - Math.cos(phase + i) * 46 * scale,
            cx + 350 * scale,
            y + Math.sin(phase * 0.7 + i) * 24 * scale,
          )
        }
        break
      case 'force':
        this.world.lineStyle(3, tone.primary, 0.16)
        for (let i = 0; i < 4; i += 1) {
          const x = cx - 260 * scale + i * 170 * scale
          this.world.beginPath()
          this.world.moveTo(x, cy + 150 * scale)
          this.world.lineTo(x + Math.sin(phase + i) * 22 * scale, cy - 190 * scale)
          this.world.strokePath()
        }
        break
      case 'refcircle':
        this.world.fillStyle(0x020617, 0.46)
        this.world.fillRoundedRect(cx + 170 * scale, cy - 190 * scale, 230 * scale, 250 * scale, 12 * scale)
        this.world.lineStyle(1, tone.primary, 0.18)
        for (let i = 0; i < 7; i += 1) {
          this.world.beginPath()
          this.world.moveTo(cx + 190 * scale, cy - 160 * scale + i * 32 * scale)
          this.world.lineTo(cx + 380 * scale, cy - 160 * scale + i * 32 * scale)
          this.world.strokePath()
        }
        break
      case 'spring':
        for (let i = 0; i < 4; i += 1) {
          this.drawGear(cx + (170 + i * 36) * scale, cy + (-140 + (i % 2) * 52) * scale, 18 * scale, phase * (0.6 + i * 0.1), tone.secondary)
        }
        break
      case 'pendulum':
        this.world.lineStyle(3, tone.secondary, 0.16)
        this.world.strokeRoundedRect(cx - 164 * scale, cy - 245 * scale, 328 * scale, 430 * scale, 120 * scale)
        this.world.lineStyle(1, tone.primary, 0.16)
        for (let i = 0; i < 9; i += 1) {
          const a = (Math.PI * 2 * i) / 9 - Math.PI / 2
          this.world.beginPath()
          this.world.moveTo(cx + Math.cos(a) * 132 * scale, cy - 35 * scale + Math.sin(a) * 132 * scale)
          this.world.lineTo(cx + Math.cos(a) * 152 * scale, cy - 35 * scale + Math.sin(a) * 152 * scale)
          this.world.strokePath()
        }
        break
    }
  }

  private drawBackdrop(width: number, height: number, time: number, sync: number) {
    const tone = this.toneFor()
    this.backdrop.clear()
    this.backdrop.fillStyle(0x050814, 1)
    this.backdrop.fillRect(0, 0, width, height)

    for (let i = 0; i < 14; i += 1) {
      const y = (height / 14) * i
      const alpha = 0.035 + i * 0.006
      this.backdrop.fillStyle(i < 7 ? 0x090f22 : tone.floor, alpha)
      this.backdrop.fillRect(0, y, width, height / 14 + 2)
    }

    const breath = 0.5 + Math.sin(time / 1400) * 0.5
    this.backdrop.fillStyle(tone.primary, 0.028 + sync / 3000)
    this.backdrop.fillEllipse(width * 0.62, height * 0.46, width * (0.66 + breath * 0.06), height * 0.58)
    this.backdrop.fillStyle(tone.secondary, 0.018 + sync / 4200)
    this.backdrop.fillEllipse(width * 0.82, height * 0.72, width * 0.42, height * 0.36)
    this.backdrop.fillStyle(tone.accent, 0.024 + sync / 5200)
    this.backdrop.fillEllipse(width * 0.26, height * 0.28, width * 0.42, height * 0.32)
    this.backdrop.fillStyle(0x020617, 0.46)
    this.backdrop.fillRect(0, height * 0.76, width, height * 0.24)

    for (let i = 0; i < 4; i += 1) {
      const rayX = width * (0.08 + i * 0.26) + Math.sin(time / 2100 + i) * 22
      this.backdrop.fillStyle(i % 2 === 0 ? tone.primary : tone.secondary, 0.03 + sync / 7000)
      this.backdrop.beginPath()
      this.backdrop.moveTo(rayX, 0)
      this.backdrop.lineTo(rayX + width * 0.18, 0)
      this.backdrop.lineTo(rayX + width * 0.02, height)
      this.backdrop.lineTo(rayX - width * 0.16, height)
      this.backdrop.closePath()
      this.backdrop.fillPath()
    }

    this.backdrop.lineStyle(1, 0x12314e, 0.2)
    for (let x = 40; x < width; x += 40) {
      this.backdrop.beginPath()
      this.backdrop.moveTo(x, 0)
      this.backdrop.lineTo(x, height)
      this.backdrop.strokePath()
    }
    for (let y = 44; y < height; y += 44) {
      this.backdrop.beginPath()
      this.backdrop.moveTo(0, y)
      this.backdrop.lineTo(width, y)
      this.backdrop.strokePath()
    }

    this.backdrop.lineStyle(1, tone.primary, 0.14)
    for (let i = 0; i < 3; i += 1) {
      const y = height * (0.35 + i * 0.15)
      this.backdrop.beginPath()
      for (let x = -40; x <= width + 40; x += 24) {
        const wave = Math.sin(x / 160 + time / 1600 + i) * (10 + i * 3)
        if (x === -40) this.backdrop.moveTo(x, y + wave)
        else this.backdrop.lineTo(x, y + wave)
      }
      this.backdrop.strokePath()
    }

    this.stars.forEach((star) => {
      const shimmer = 0.28 + Math.sin(time / 520 + star.phase) * 0.18 + sync / 500
      const driftX = Math.sin(time / (900 + star.drift * 30) + star.phase) * star.drift
      this.backdrop.fillStyle(0xc9f4ff, Phaser.Math.Clamp(shimmer, 0.12, 0.58))
      this.backdrop.fillCircle(star.x + driftX, star.y, star.size)
    })

    for (let i = 0; i < 4; i += 1) {
      const waveY = height * (0.23 + i * 0.16)
      this.backdrop.lineStyle(1, i % 2 === 0 ? 0x38bdf8 : 0xf59e0b, 0.08 + sync / 1800)
      this.backdrop.beginPath()
      for (let x = 0; x <= width; x += 18) {
        const y = waveY + Math.sin(x / 110 + time / 1300 + i) * (12 + i * 4)
        if (x === 0) this.backdrop.moveTo(x, y)
        else this.backdrop.lineTo(x, y)
      }
      this.backdrop.strokePath()
    }

    this.backdrop.lineStyle(2, tone.accent, 0.05 + sync / 3600)
    for (let i = 0; i < 5; i += 1) {
      const y = height * (0.18 + i * 0.13)
      this.backdrop.beginPath()
      this.backdrop.moveTo(width * -0.08, y + Math.sin(time / 1800 + i) * 18)
      this.backdrop.lineTo(width * 1.08, y + Math.cos(time / 2100 + i) * 18)
      this.backdrop.strokePath()
    }

    const baseY = height * 0.82
    this.backdrop.fillStyle(0x020617, 0.8)
    for (let i = 0; i < 9; i += 1) {
      const towerW = (28 + (i % 3) * 16) * Math.min(width / 1180, 1.2)
      const towerH = (70 + ((i * 37) % 110)) * Math.min(height / 760, 1.1)
      const x = width * 0.53 + i * towerW * 1.42
      this.backdrop.fillRoundedRect(x, baseY - towerH, towerW, towerH, 6)
      this.backdrop.fillStyle(tone.secondary, 0.06)
      for (let y = baseY - towerH + 18; y < baseY - 10; y += 18) {
        this.backdrop.fillRect(x + 5, y, towerW - 10, 2)
      }
      this.backdrop.fillStyle(0x020617, 0.8)
    }
  }

  private drawGravitySlingshot(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const launcher = this.launcherPosition(cx, cy, scale)
    const target = this.targetPosition(cx, cy, scale)
    const probe = this.slingshot ?? {
      x: launcher.x,
      y: launcher.y,
      vx: 0,
      vy: 0,
      launched: false,
      hit: false,
      trail: [],
    }
    const pulse = 0.5 + Math.sin(time / 280) * 0.5

    this.world.fillStyle(0x020617, 0.74)
    this.world.fillRoundedRect(launcher.x - 68 * scale, launcher.y + 34 * scale, 136 * scale, 30 * scale, 8 * scale)
    this.world.fillRoundedRect(target.x - 46 * scale, target.y + 34 * scale, 92 * scale, 24 * scale, 8 * scale)
    this.world.lineStyle(2, 0x67e8f9, 0.18)
    this.drawCubicPath(
      launcher.x + 48 * scale,
      launcher.y + 48 * scale,
      cx - 126 * scale,
      cy + 116 * scale,
      cx + 112 * scale,
      cy - 116 * scale,
      target.x - 48 * scale,
      target.y + 48 * scale,
    )

    this.world.fillStyle(0x020617, 0.82)
    this.world.fillCircle(cx, cy, 44 * scale)
    this.world.fillStyle(0x38bdf8, 0.1 + pulse * 0.05)
    this.world.fillCircle(cx, cy, 94 * scale)
    for (let i = 0; i < 7; i += 1) {
      const turn = time / 620 + i * 0.72
      const arm = 38 * scale + i * 11 * scale
      this.world.lineStyle(2, i % 2 === 0 ? 0x67e8f9 : 0xfbbf24, 0.18 + pulse * 0.08)
      this.world.beginPath()
      for (let step = 0; step < 22; step += 1) {
        const t = step / 21
        const a = turn + t * 1.55
        const r = arm + t * 42 * scale
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r * 0.68
        if (step === 0) this.world.moveTo(x, y)
        else this.world.lineTo(x, y)
      }
      this.world.strokePath()
    }
    this.drawCoreGlow(cx, cy, 28 * scale, 0x38bdf8)

    this.drawSlingshotRig(launcher.x, launcher.y, scale, time)
    this.drawRiftTarget(target.x, target.y, scale, time, this.settingsRef.current.completed)

    if (probe.trail.length > 1) {
      probe.trail.forEach((point, index) => {
        const age = index / Math.max(1, probe.trail.length - 1)
        this.trail.fillStyle(0x67e8f9, 0.05 + age * 0.2)
        this.trail.fillCircle(point.x, point.y, 2 * scale + age * 4 * scale)
      })
    }

    if (!probe.launched && !probe.hit) {
      this.world.lineStyle(4, 0xfbbf24, 0.28)
      this.world.beginPath()
      this.world.moveTo(launcher.x - 24 * scale, launcher.y + 14 * scale)
      this.world.lineTo(probe.x, probe.y)
      this.world.lineTo(launcher.x + 24 * scale, launcher.y + 14 * scale)
      this.world.strokePath()
    }

    if (this.drag?.mode === 'orbit-launch') {
      this.drawSlingshotPrediction(probe.x, probe.y, (launcher.x - probe.x) * 4.35, (launcher.y - probe.y) * 4.35, cx, cy, scale)
    }

    this.drawPolishedOrb(
      this.world,
      probe.hit ? target.x : probe.x,
      probe.hit ? target.y : probe.y,
      11 * scale,
      probe.hit ? 0xfbbf24 : 0x67e8f9,
      0xfef3c7,
      time,
      1.2,
    )
    if (probe.launched) this.emitSpark(probe.x, probe.y, 0x67e8f9, 1, 42 * scale, 2 * scale)
  }

  private drawSlingshotRig(x: number, y: number, scale: number, time: number) {
    const pulse = 0.5 + Math.sin(time / 240) * 0.5

    this.world.fillStyle(0xfbbf24, 0.05 + pulse * 0.03)
    this.world.fillEllipse(x, y + 6 * scale, 112 * scale, 90 * scale)
    this.world.fillStyle(0x020617, 0.48)
    this.world.fillEllipse(x, y + 38 * scale, 104 * scale, 22 * scale)

    this.world.fillStyle(0x0f172a, 0.92)
    this.world.fillRoundedRect(x - 34 * scale, y + 8 * scale, 68 * scale, 30 * scale, 8 * scale)
    this.world.fillStyle(0xfbbf24, 0.22)
    this.world.fillRoundedRect(x - 26 * scale, y + 14 * scale, 52 * scale, 8 * scale, 4 * scale)
    this.world.lineStyle(2, 0xf8fafc, 0.28)
    this.world.strokeRoundedRect(x - 34 * scale, y + 8 * scale, 68 * scale, 30 * scale, 8 * scale)

    this.world.lineStyle(8, 0xfbbf24, 0.82)
    this.world.beginPath()
    this.world.moveTo(x - 25 * scale, y + 18 * scale)
    this.world.lineTo(x - 16 * scale, y - 15 * scale)
    this.world.moveTo(x + 25 * scale, y + 18 * scale)
    this.world.lineTo(x + 16 * scale, y - 15 * scale)
    this.world.strokePath()

    this.world.lineStyle(3, 0xf8fafc, 0.36)
    this.world.beginPath()
    this.world.moveTo(x - 25 * scale, y + 18 * scale)
    this.world.lineTo(x - 16 * scale, y - 15 * scale)
    this.world.moveTo(x + 25 * scale, y + 18 * scale)
    this.world.lineTo(x + 16 * scale, y - 15 * scale)
    this.world.strokePath()

    this.world.fillStyle(0x020617, 0.94)
    this.world.fillCircle(x - 16 * scale, y - 15 * scale, 8 * scale)
    this.world.fillCircle(x + 16 * scale, y - 15 * scale, 8 * scale)
    this.world.fillStyle(0x67e8f9, 0.72 + pulse * 0.2)
    this.world.fillCircle(x - 16 * scale, y - 15 * scale, 4 * scale)
    this.world.fillCircle(x + 16 * scale, y - 15 * scale, 4 * scale)

    this.world.lineStyle(2, 0x67e8f9, 0.28 + pulse * 0.18)
    this.world.strokeCircle(x, y + 22 * scale, 20 * scale)
    this.world.fillStyle(0x67e8f9, 0.12 + pulse * 0.08)
    this.world.fillCircle(x, y + 22 * scale, 10 * scale)
  }

  private drawRiftTarget(x: number, y: number, scale: number, time: number, completed: boolean) {
    const pulse = 0.5 + Math.sin(time / 180) * 0.5
    const primary = completed ? 0xfbbf24 : 0x67e8f9
    const accent = completed ? 0xfef3c7 : 0xfbbf24

    this.world.fillStyle(primary, 0.05 + pulse * 0.04)
    this.world.fillCircle(x, y, 32 * scale)
    this.world.lineStyle(2, primary, 0.18 + pulse * 0.16)
    this.world.strokeCircle(x, y, 21 * scale + pulse * 2 * scale)

    this.world.fillStyle(0x020617, 0.9)
    this.world.beginPath()
    this.world.moveTo(x, y - 20 * scale)
    this.world.lineTo(x + 18 * scale, y)
    this.world.lineTo(x, y + 20 * scale)
    this.world.lineTo(x - 18 * scale, y)
    this.world.lineTo(x, y - 20 * scale)
    this.world.fillPath()
    this.world.lineStyle(3, accent, 0.68)
    this.world.strokePath()

    this.world.fillStyle(primary, 0.22 + pulse * 0.12)
    this.world.beginPath()
    this.world.moveTo(x, y - 11 * scale)
    this.world.lineTo(x + 9 * scale, y)
    this.world.lineTo(x, y + 11 * scale)
    this.world.lineTo(x - 9 * scale, y)
    this.world.lineTo(x, y - 11 * scale)
    this.world.fillPath()

    this.world.lineStyle(2, 0xf8fafc, 0.42)
    this.world.beginPath()
    this.world.moveTo(x - 28 * scale, y)
    this.world.lineTo(x - 17 * scale, y)
    this.world.moveTo(x + 17 * scale, y)
    this.world.lineTo(x + 28 * scale, y)
    this.world.moveTo(x, y - 28 * scale)
    this.world.lineTo(x, y - 17 * scale)
    this.world.moveTo(x, y + 17 * scale)
    this.world.lineTo(x, y + 28 * scale)
    this.world.strokePath()

    this.world.fillStyle(completed ? 0xfbbf24 : 0x020617, 0.95)
    this.world.fillCircle(x, y, 4 * scale)
  }

  private drawForceTower(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const values = this.settingsRef.current.values
    const radius = values.radius * 0.78 * scale
    const px = cx + Math.cos(this.angle) * radius
    const py = cy + Math.sin(this.angle) * radius
    this.pushTrail(px, py, 0xfb7185)
    this.emitSpark(px, py, 0xfb7185, 2, 60 * scale, 2.8 * scale)

    this.drawAstrolabe(cx, cy, radius, time, 0xfb7185)
    this.world.lineStyle(5, 0x64748b, 0.35)
    this.world.strokeRoundedRect(cx - 170 * scale, cy + 112 * scale, 340 * scale, 46 * scale, 14 * scale)
    this.world.fillStyle(0x0f172a, 0.72)
    this.world.fillRoundedRect(cx - 166 * scale, cy + 116 * scale, 332 * scale, 38 * scale, 12 * scale)

    this.drawPolishedOrb(this.world, px, py, 13 * scale, 0x38bdf8, 0xfb7185, time, 1.25)
    this.drawArrow(px, py, cx, cy, 0xfb7185)

    const pull = Phaser.Math.Clamp(values.mass / 8 + values.omega / 4, 0.2, 1)
    for (let i = 0; i < 7; i += 1) {
      const r = (40 + i * 18 + Math.sin(time / 350 + i) * 2) * scale
      this.fx.lineStyle(2, 0xfb7185, 0.06 + pull * 0.06)
      this.fx.strokeCircle(cx, cy, r)
    }
  }

  private drawReferenceCircle(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const values = this.settingsRef.current.values
    const radius = values.amplitude * scale
    const px = cx + Math.cos(this.angle) * radius
    const py = cy + Math.sin(this.angle) * radius
    const projectionY = cy + 160 * scale
    this.emitSpark(px, py, 0x38bdf8, 1, 38 * scale, 2.3 * scale)

    this.drawAstrolabe(cx, cy, radius, time, 0x38bdf8)
    this.world.lineStyle(6, 0x38bdf8, 0.08)
    this.world.beginPath()
    this.world.moveTo(px, py)
    this.world.lineTo(px, projectionY)
    this.world.strokePath()
    this.world.lineStyle(2, 0x94a3b8, 0.38)
    this.world.beginPath()
    this.world.moveTo(px, py)
    this.world.lineTo(px, projectionY)
    this.world.strokePath()
    this.drawPolishedOrb(this.world, px, py, 9 * scale, 0x38bdf8, 0xf8fafc, time, 1)
    this.drawPolishedOrb(this.world, px, projectionY, 10 * scale, 0xf59e0b, 0xfef3c7, time + 400, 1.05)

    const graphX = cx + 230 * scale
    const graphY = cy - 95 * scale
    const graphW = 260 * scale
    const graphH = 190 * scale
    this.world.lineStyle(1, 0x94a3b8, 0.25)
    this.world.strokeRect(graphX - 20 * scale, graphY - graphH / 2, graphW + 40 * scale, graphH)
    this.world.fillStyle(0x38bdf8, 0.035)
    this.world.fillRoundedRect(graphX - 20 * scale, graphY - graphH / 2, graphW + 40 * scale, graphH, 8 * scale)
    this.world.lineStyle(3, 0xf59e0b, 0.86)
    this.world.beginPath()
    for (let i = 0; i <= graphW; i += 8 * scale) {
      const t = i / graphW
      const y = graphY + Math.cos(t * Math.PI * 4 - this.angle) * 62 * scale
      if (i === 0) this.world.moveTo(graphX + i, y)
      else this.world.lineTo(graphX + i, y)
    }
    this.world.strokePath()
  }

  private drawSpringWorkshop(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    let x = this.currentSpringBlock(cx, cy, scale).displacement
    const baseX = cx - 210 * scale
    const y = cy

    if (this.drag?.mode === 'spring-block') {
      x = Phaser.Math.Clamp(this.drag.x - cx, -150 * scale, 150 * scale)
    }

    this.emitSpark(cx + x, y, 0x5eead4, 1, 36 * scale, 2.6 * scale)

    this.world.lineStyle(5, 0x64748b, 0.42)
    this.world.beginPath()
    this.world.moveTo(baseX, y - 90 * scale)
    this.world.lineTo(baseX, y + 90 * scale)
    this.world.strokePath()
    this.drawSpring(baseX, y, cx + x - 44 * scale, y, 18, 20 * scale, 0x5eead4)
    this.world.fillStyle(0x020617, 0.36)
    this.world.fillEllipse(cx + x, y + 52 * scale, 102 * scale, 20 * scale)
    this.world.fillStyle(0xf8fafc, 0.96)
    this.world.fillRoundedRect(cx + x - 42 * scale, y - 42 * scale, 84 * scale, 84 * scale, 10 * scale)
    this.world.fillStyle(0x5eead4, 0.12)
    this.world.fillRoundedRect(cx + x - 34 * scale, y - 34 * scale, 68 * scale, 68 * scale, 8 * scale)
    this.drawPolishedOrb(this.world, cx + x, y, 18 * scale, 0xf59e0b, 0xfef3c7, time, 1.1)

    for (let i = 0; i < 3; i += 1) {
      const gx = cx + 180 * scale + i * 42 * scale
      const gy = y - 20 * scale + (i % 2) * 44 * scale
      this.drawGear(gx, gy, 22 * scale, time / (420 + i * 90), this.settingsRef.current.completed ? 0xfbbf24 : 0x64748b)
    }
  }

  private drawPendulumTower(width: number, height: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const bob = this.currentPendulumBob(cx, cy, scale)
    const pivotY = bob.pivotY
    let bobX = bob.x
    let bobY = bob.y

    if (this.drag?.mode === 'pendulum-bob') {
      bobX = this.drag.x
      bobY = this.drag.y
    }

    this.emitSpark(bobX, bobY, 0xfbbf24, 1, 44 * scale, 2.4 * scale)

    this.world.lineStyle(2, 0x64748b, 0.38)
    for (let r = 90 * scale; r <= 210 * scale; r += 30 * scale) this.world.strokeCircle(cx, pivotY + 160 * scale, r)
    this.world.fillStyle(0x0f172a, 0.8)
    this.world.fillCircle(cx, pivotY + 160 * scale, 225 * scale)
    this.world.lineStyle(4, 0xfbbf24, 0.52)
    this.world.beginPath()
    this.world.moveTo(cx, pivotY)
    this.world.lineTo(bobX, bobY)
    this.world.strokePath()
    this.drawPolishedOrb(this.world, bobX, bobY, 20 * scale, 0xf59e0b, 0xfef3c7, this.phase * 1000, 1.15)
    this.drawPolishedOrb(this.world, cx, pivotY, 8 * scale, 0x5eead4, 0xf8fafc, this.phase * 1000, 0.8)
    this.drawArrow(bobX, bobY, bobX, bobY + 76 * scale, 0xfb7185)
  }

  private drawInteractionOverlay(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const tone = this.toneFor()

    switch (this.settingsRef.current.challengeId) {
      case 'orbit': {
        const launcher = this.launcherPosition(cx, cy, scale)
        const target = this.targetPosition(cx, cy, scale)
        this.drawReticle(launcher.x, launcher.y, 10 * scale, tone.secondary, time)
        this.drawReticle(target.x, target.y, 6 * scale, tone.accent, time, 0.45)
        break
      }
      case 'force':
        break
      case 'refcircle':
        break
      case 'spring': {
        const block = this.currentSpringBlock(cx, cy, scale)
        this.fx.lineStyle(2, tone.secondary, 0.28)
        this.fx.beginPath()
        this.fx.moveTo(cx - 110 * scale, cy - 88 * scale)
        this.fx.lineTo(cx - 110 * scale, cy + 88 * scale)
        this.fx.moveTo(cx + 110 * scale, cy - 88 * scale)
        this.fx.lineTo(cx + 110 * scale, cy + 88 * scale)
        this.fx.strokePath()
        this.drawReticle(cx + 110 * scale, cy, 11 * scale, tone.secondary, time)
        this.drawReticle(block.x, block.y, 18 * scale, tone.primary, time, 0.56)
        break
      }
      case 'pendulum': {
        const bob = this.currentPendulumBob(cx, cy, scale)
        const pivotY = bob.pivotY
        const length = 99 * 0.82 * scale
        const theta = rad(8)
        const targetX = cx + Math.sin(theta) * length
        const targetY = pivotY + Math.cos(theta) * length
        this.fx.lineStyle(2, tone.secondary, 0.3)
        this.fx.beginPath()
        this.fx.arc(cx, pivotY, length, Math.PI / 2 - theta, Math.PI / 2 + theta, false)
        this.fx.strokePath()
        this.drawReticle(targetX, targetY, 11 * scale, tone.secondary, time)
        this.drawReticle(bob.x, bob.y, 18 * scale, tone.primary, time, 0.56)
        break
      }
    }

    this.drawDragPreview(cx, cy, scale, time)
  }

  private drawDragPreview(cx: number, cy: number, scale: number, time: number) {
    const drag = this.drag
    if (!drag || drag.id !== this.settingsRef.current.challengeId) return

    const tone = this.toneFor()
    this.drawReticle(drag.x, drag.y, 12 * scale, tone.accent, time, 0.9)

    switch (drag.mode) {
      case 'orbit-launch':
        this.drawArrow(drag.x, drag.y, this.launcherPosition(cx, cy, scale).x, this.launcherPosition(cx, cy, scale).y, tone.accent, 0.62)
        break
      case 'spring-block':
        this.drawArrow(cx, cy, drag.x, cy, tone.secondary, 0.58)
        this.fx.lineStyle(3, tone.secondary, 0.42)
        this.fx.beginPath()
        this.fx.moveTo(drag.x, cy - 72 * scale)
        this.fx.lineTo(drag.x, cy + 72 * scale)
        this.fx.strokePath()
        break
      case 'pendulum-bob': {
        const pivotY = cy - 170 * scale
        this.fx.lineStyle(4, tone.secondary, 0.66)
        this.fx.beginPath()
        this.fx.moveTo(cx, pivotY)
        this.fx.lineTo(drag.x, drag.y)
        this.fx.strokePath()
        break
      }
    }
  }

  private drawCubicPath(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    segments = 28,
  ) {
    this.world.beginPath()
    this.world.moveTo(x0, y0)
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments
      const mt = 1 - t
      const x = mt ** 3 * x0 + 3 * mt ** 2 * t * x1 + 3 * mt * t ** 2 * x2 + t ** 3 * x3
      const y = mt ** 3 * y0 + 3 * mt ** 2 * t * y1 + 3 * mt * t ** 2 * y2 + t ** 3 * y3
      this.world.lineTo(x, y)
    }
    this.world.strokePath()
  }

  private drawReticle(x: number, y: number, radius: number, color: number, time: number, alpha = 0.72) {
    const pulse = 0.5 + Math.sin(time / 180) * 0.5
    this.fx.lineStyle(2, color, alpha * (0.62 + pulse * 0.24))
    this.fx.strokeCircle(x, y, radius + pulse * 4)
    this.fx.lineStyle(1, 0xf8fafc, alpha * 0.42)
    this.fx.beginPath()
    this.fx.moveTo(x - radius * 1.7, y)
    this.fx.lineTo(x - radius * 0.7, y)
    this.fx.moveTo(x + radius * 0.7, y)
    this.fx.lineTo(x + radius * 1.7, y)
    this.fx.moveTo(x, y - radius * 1.7)
    this.fx.lineTo(x, y - radius * 0.7)
    this.fx.moveTo(x, y + radius * 0.7)
    this.fx.lineTo(x, y + radius * 1.7)
    this.fx.strokePath()
  }

  private drawSlingshotPrediction(
    x: number,
    y: number,
    vx: number,
    vy: number,
    cx: number,
    cy: number,
    scale: number,
  ) {
    let px = x
    let py = y
    let pvx = vx
    let pvy = vy
    const gravity = 1560000 * scale
    const dt = 0.026

    this.fx.lineStyle(3, 0x67e8f9, 0.34)
    this.fx.beginPath()
    this.fx.moveTo(px, py)
    for (let i = 0; i < 42; i += 1) {
      const dx = cx - px
      const dy = cy - py
      const distanceSquared = Math.max(1800 * scale, dx * dx + dy * dy)
      const distance = Math.sqrt(distanceSquared)
      pvx += (dx / distance) * (gravity / distanceSquared) * dt
      pvy += (dy / distance) * (gravity / distanceSquared) * dt
      px += pvx * dt
      py += pvy * dt
      this.fx.lineTo(px, py)
    }
    this.fx.strokePath()
  }


  private drawRpgLayer(width: number, height: number, time: number) {
    const settings = this.settingsRef.current
    const scale = Math.min(width / 1180, height / 760)
    const baseY = height < 680 ? height * 0.74 : height * 0.82
    const centerX = width < 820 ? width * 0.5 : width * 0.46
    const currentIndex = challengeIndex[settings.challengeId]
    const finishedCount = Object.values(settings.finished).filter(Boolean).length
    const open = settings.completed ? 1 : Math.max(0, (settings.sync - 65) / 35)
    const bob = Math.sin(time / 260) * 4 * scale

    this.fx.lineStyle(3, 0x5eead4, 0.16)
    this.fx.beginPath()
    this.fx.moveTo(centerX - 210 * scale, baseY + 32 * scale)
    this.fx.lineTo(centerX + 230 * scale, baseY + 32 * scale)
    this.fx.strokePath()

    for (let i = 0; i < 5; i += 1) {
      const nodeX = centerX - 200 * scale + i * 96 * scale
      const isUnlocked = settings.unlocked[challengeOrder[i]]
      const isFinished = settings.finished[challengeOrder[i]]
      this.fx.fillStyle(isFinished ? 0x5eead4 : isUnlocked ? 0xfbbf24 : 0x334155, isFinished || isUnlocked ? 0.88 : 0.58)
      this.fx.fillCircle(nodeX, baseY + 32 * scale, 8 * scale)
      if (i === currentIndex) {
        this.fx.lineStyle(2, 0xf8fafc, 0.8)
        this.fx.strokeCircle(nodeX, baseY + 32 * scale, 15 * scale + Math.sin(time / 180) * 2 * scale)
      }
    }

    const playerX = centerX - 200 * scale + currentIndex * 96 * scale
    const npcX = playerX - 50 * scale
    const gateX = playerX + 70 * scale
    const playerY = baseY + bob

    this.fx.fillStyle(0x0f172a, 0.8)
    this.fx.fillEllipse(playerX, baseY + 42 * scale, 64 * scale, 18 * scale)
    this.fx.fillStyle(0x5eead4, 0.16 + open * 0.12)
    this.fx.fillCircle(playerX, playerY - 20 * scale, 34 * scale)
    this.fx.fillStyle(0x0f172a, 0.92)
    this.fx.fillRoundedRect(playerX - 17 * scale, playerY - 31 * scale, 34 * scale, 44 * scale, 9 * scale)
    this.fx.fillStyle(0x14b8a6, 0.96)
    this.fx.fillRoundedRect(playerX - 13 * scale, playerY - 29 * scale, 26 * scale, 38 * scale, 8 * scale)
    this.fx.fillStyle(0xf8fafc, 0.95)
    this.fx.fillCircle(playerX, playerY - 36 * scale, 12 * scale)
    this.fx.lineStyle(2, 0xf8fafc, 0.38)
    this.fx.beginPath()
    this.fx.moveTo(playerX - 11 * scale, playerY - 18 * scale)
    this.fx.lineTo(playerX + 11 * scale, playerY - 2 * scale)
    this.fx.strokePath()
    this.fx.fillStyle(0xfbbf24, 0.95)
    this.fx.fillCircle(playerX + 5 * scale, playerY - 38 * scale, 3 * scale)

    this.fx.fillStyle(0x0f172a, 0.72)
    this.fx.fillEllipse(npcX, baseY + 36 * scale, 46 * scale, 14 * scale)
    this.fx.fillStyle(0xfbbf24, 0.12)
    this.fx.fillCircle(npcX, baseY - 16 * scale, 30 * scale)
    this.fx.fillStyle(0xfbbf24, 0.88)
    this.fx.fillCircle(npcX, baseY - 34 * scale, 10 * scale)
    this.fx.fillStyle(0x64748b, 0.9)
    this.fx.fillRoundedRect(npcX - 12 * scale, baseY - 23 * scale, 24 * scale, 33 * scale, 7 * scale)
    this.fx.lineStyle(2, 0xfbbf24, 0.28)
    this.fx.strokeRoundedRect(npcX - 15 * scale, baseY - 26 * scale, 30 * scale, 39 * scale, 8 * scale)

    this.fx.lineStyle(4, settings.completed ? 0xfbbf24 : 0x22d3ee, 0.18 + open * 0.55)
    this.fx.strokeEllipse(gateX, baseY - 20 * scale, 58 * scale, 92 * scale)
    this.fx.fillStyle(0x67e8f9, 0.04 + open * 0.15)
    this.fx.fillEllipse(gateX, baseY - 20 * scale, 42 * scale, 78 * scale)
    this.fx.lineStyle(2, 0xf8fafc, 0.1 + open * 0.22)
    this.fx.strokeEllipse(gateX, baseY - 20 * scale, 74 * scale, 112 * scale)

    if (finishedCount === 5) {
      this.fx.fillStyle(0xfbbf24, 0.22 + Math.sin(time / 220) * 0.08)
      this.fx.fillCircle(centerX + 260 * scale, baseY - 20 * scale, 42 * scale)
      this.fx.lineStyle(3, 0xfbbf24, 0.58)
      this.fx.strokeCircle(centerX + 260 * scale, baseY - 20 * scale, 58 * scale)
    }
  }

  private drawCompletionBloom(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const tone = this.toneFor()
    const pulse = 0.5 + Math.sin(time / 180) * 0.5

    this.fx.fillStyle(tone.secondary, 0.06 + pulse * 0.06)
    this.fx.fillCircle(cx, cy, 190 * scale)
    this.fx.lineStyle(3, tone.secondary, 0.34 + pulse * 0.24)
    this.fx.strokeCircle(cx, cy, 210 * scale + pulse * 10 * scale)
    this.fx.lineStyle(1, 0xf8fafc, 0.2)
    for (let i = 0; i < 14; i += 1) {
      const a = (Math.PI * 2 * i) / 14 + time / 950
      this.fx.beginPath()
      this.fx.moveTo(cx + Math.cos(a) * 72 * scale, cy + Math.sin(a) * 72 * scale)
      this.fx.lineTo(cx + Math.cos(a) * 246 * scale, cy + Math.sin(a) * 246 * scale)
      this.fx.strokePath()
    }
    this.emitSpark(cx, cy, tone.secondary, 2, 210 * scale, 3 * scale)
  }

  private emitSpark(x: number, y: number, color: number, count = 1, speed = 48, size = 2.4) {
    if (this.sparks.length > 360) return
    for (let i = 0; i < count; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const velocity = Phaser.Math.FloatBetween(speed * 0.28, speed)
      const maxLife = Phaser.Math.FloatBetween(0.42, 0.95)
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - Phaser.Math.FloatBetween(8, 24),
        life: maxLife,
        maxLife,
        size: Phaser.Math.FloatBetween(size * 0.45, size),
        color,
      })
    }
  }

  private drawParticles(dt: number) {
    this.sparks = this.sparks
      .map((spark) => ({
        ...spark,
        x: spark.x + spark.vx * dt,
        y: spark.y + spark.vy * dt,
        vx: spark.vx * 0.985,
        vy: spark.vy * 0.985 + 12 * dt,
        life: spark.life - dt,
      }))
      .filter((spark) => spark.life > 0)

    this.sparks.forEach((spark) => {
      const t = spark.life / spark.maxLife
      this.particles.fillStyle(spark.color, t * 0.16)
      this.particles.fillCircle(spark.x, spark.y, spark.size * 4.4)
      this.particles.fillStyle(spark.color, t * 0.62)
      this.particles.fillCircle(spark.x, spark.y, spark.size)
      this.particles.fillStyle(0xf8fafc, t * 0.38)
      this.particles.fillCircle(spark.x - spark.size * 0.25, spark.y - spark.size * 0.25, spark.size * 0.38)
    })
  }

  private drawPolishedOrb(
    target: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
    primary: number,
    accent: number,
    time: number,
    glow = 1,
  ) {
    const pulse = 0.5 + Math.sin(time / 190) * 0.5
    target.fillStyle(primary, 0.06 * glow)
    target.fillCircle(x, y, radius * 4.2)
    target.fillStyle(primary, 0.11 * glow)
    target.fillCircle(x, y, radius * 2.45)
    target.fillStyle(0x020617, 0.34)
    target.fillEllipse(x, y + radius * 1.55, radius * 2.5, radius * 0.55)
    target.fillStyle(0xf8fafc, 0.96)
    target.fillCircle(x, y, radius)
    target.fillStyle(primary, 0.92)
    target.fillCircle(x - radius * 0.12, y - radius * 0.02, radius * 0.62)
    target.fillStyle(accent, 0.46)
    target.fillCircle(x + radius * 0.26, y + radius * 0.18, radius * 0.34)
    target.fillStyle(0xffffff, 0.7)
    target.fillCircle(x - radius * 0.28, y - radius * 0.32, radius * 0.23)
    target.lineStyle(2, accent, 0.44 + pulse * 0.22)
    target.strokeCircle(x, y, radius * (1.28 + pulse * 0.1))
  }

  private drawScreenVignette(width: number, height: number, time: number, sync: number) {
    const tone = this.toneFor()
    const glow = Phaser.Math.Clamp(sync / 100, 0, 1)
    const pulse = 0.5 + Math.sin(time / 900) * 0.5

    this.vignette.fillStyle(tone.primary, 0.035 + glow * 0.03)
    this.vignette.fillEllipse(width * 0.45, height * 0.52, width * 0.78, height * 0.72)
    this.vignette.lineStyle(1, tone.secondary, 0.08 + glow * 0.08)
    this.vignette.strokeRect(18, 18, width - 36, height - 36)
    this.vignette.fillStyle(0x020617, 0.15 + pulse * 0.02)
    this.vignette.fillRect(0, 0, width, 24)
    this.vignette.fillRect(0, height - 32, width, 32)

    this.vignette.fillStyle(0x020617, 0.28)
    this.vignette.fillRect(0, 0, width, height * 0.08)
    this.vignette.fillRect(0, height * 0.91, width, height * 0.09)
  }

  private pushTrail(x: number, y: number, color: number) {
    const dt = 0.025
    this.trails.push({ x, y, life: 1 })
    this.trails = this.trails.map((point) => ({ ...point, life: point.life - dt })).filter((point) => point.life > 0).slice(-95)
    this.trails.forEach((point, index) => {
      const ageBoost = index / Math.max(1, this.trails.length)
      this.trail.fillStyle(color, point.life * (0.035 + ageBoost * 0.08))
      this.trail.fillCircle(point.x, point.y, 8 + ageBoost * 8)
      this.trail.fillStyle(color, point.life * (0.12 + ageBoost * 0.34))
      this.trail.fillCircle(point.x, point.y, 2 + ageBoost * 3)
    })
  }

  private drawAstrolabe(cx: number, cy: number, radius: number, time: number, color: number) {
    const tone = this.toneFor()
    this.world.fillStyle(color, 0.018)
    this.world.fillCircle(cx, cy, radius + 96)
    this.world.lineStyle(2, tone.primary, 0.12)
    this.world.strokeCircle(cx, cy, radius + 92)
    this.world.lineStyle(1, tone.secondary, 0.12)
    this.world.strokeCircle(cx, cy, Math.max(32, radius - 92))
    this.world.lineStyle(1, 0x94a3b8, 0.15)
    for (let r = radius - 64; r <= radius + 64; r += 32) if (r > 20) this.world.strokeCircle(cx, cy, r)
    this.world.lineStyle(3, color, 0.38 + this.settingsRef.current.sync / 260)
    this.world.strokeCircle(cx, cy, radius)
    for (let i = 0; i < 12; i += 1) {
      const a = (Math.PI * 2 * i) / 12 + time / 8000
      this.world.lineStyle(1, 0x22d3ee, 0.32)
      this.world.beginPath()
      this.world.moveTo(cx + Math.cos(a) * (radius - 18), cy + Math.sin(a) * (radius - 18))
      this.world.lineTo(cx + Math.cos(a) * (radius + 18), cy + Math.sin(a) * (radius + 18))
      this.world.strokePath()
    }
    this.world.lineStyle(2, color, 0.22)
    for (let i = 0; i < 4; i += 1) {
      const a = time / 1300 + (Math.PI * 2 * i) / 4
      this.world.beginPath()
      this.world.arc(cx, cy, radius + 38, a, a + 0.42, false)
      this.world.strokePath()
    }
  }

  private drawCoreGlow(cx: number, cy: number, radius: number, color: number) {
    const sync = this.settingsRef.current.sync / 100
    this.world.fillStyle(color, 0.07 + sync * 0.11)
    this.world.fillCircle(cx, cy, radius)
    this.world.fillStyle(color, 0.04 + sync * 0.08)
    this.world.fillCircle(cx, cy, radius * 1.62)
    this.world.lineStyle(2, 0x14b8a6, 0.46 + sync * 0.28)
    this.world.strokeCircle(cx, cy, 34)
    this.world.fillStyle(this.settingsRef.current.completed ? 0xfacc15 : 0x67e8f9, 0.92)
    this.world.fillCircle(cx, cy, 16)
  }

  private drawSpring(x1: number, y1: number, x2: number, y2: number, coils: number, amplitude: number, color: number) {
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)
    this.world.lineStyle(4, color, 0.82)
    this.world.beginPath()
    for (let i = 0; i <= coils * 2; i += 1) {
      const t = i / (coils * 2)
      const x = x1 + Math.cos(angle) * length * t + Math.cos(angle + Math.PI / 2) * Math.sin(t * Math.PI * coils * 2) * amplitude
      const y = y1 + Math.sin(angle) * length * t + Math.sin(angle + Math.PI / 2) * Math.sin(t * Math.PI * coils * 2) * amplitude
      if (i === 0) this.world.moveTo(x, y)
      else this.world.lineTo(x, y)
    }
    this.world.strokePath()
  }

  private drawGear(x: number, y: number, r: number, spin: number, color: number) {
    this.world.lineStyle(3, color, 0.58)
    this.world.strokeCircle(x, y, r)
    for (let i = 0; i < 8; i += 1) {
      const a = spin + (Math.PI * 2 * i) / 8
      this.world.beginPath()
      this.world.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45)
      this.world.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15)
      this.world.strokePath()
    }
  }

  private drawArrow(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    alpha = 0.72,
  ) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const head = 12
    this.vectors.lineStyle(8, color, alpha * 0.12)
    this.vectors.beginPath()
    this.vectors.moveTo(x1, y1)
    this.vectors.lineTo(x2, y2)
    this.vectors.strokePath()
    this.vectors.lineStyle(4, color, alpha)
    this.vectors.beginPath()
    this.vectors.moveTo(x1, y1)
    this.vectors.lineTo(x2, y2)
    this.vectors.strokePath()
    this.vectors.fillStyle(color, alpha)
    this.vectors.beginPath()
    this.vectors.moveTo(x2, y2)
    this.vectors.lineTo(x2 - Math.cos(angle - Math.PI / 6) * head, y2 - Math.sin(angle - Math.PI / 6) * head)
    this.vectors.lineTo(x2 - Math.cos(angle + Math.PI / 6) * head, y2 - Math.sin(angle + Math.PI / 6) * head)
    this.vectors.lineTo(x2, y2)
    this.vectors.fillPath()
  }
}
