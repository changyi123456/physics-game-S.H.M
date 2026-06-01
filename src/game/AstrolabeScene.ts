import Phaser from 'phaser'
import type { ChallengeId, GameSettingsRef } from './astrolabeModel'

type Star = { x: number; y: number; size: number; phase: number; drift: number }
type TrailPoint = { x: number; y: number; life: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: number }
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

  constructor(settingsRef: GameSettingsRef) {
    super('AstrolabeScene')
    this.settingsRef = settingsRef
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
      this.angle = -Math.PI / 2
      this.phase = 0
      this.cameras.main.flash(300, 56, 189, 248, true)
    }

    if (settings.completed && !this.previousCompleted) {
      this.cameras.main.flash(420, 251, 191, 36, true)
      this.cameras.main.shake(180, 0.0025)
    }
    this.previousCompleted = settings.completed

    this.phase += dt
    this.angle += this.activeOmega(settings) * dt

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
        this.drawOrbit(width, height, time)
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

    this.drawChallengeSetDressing(cx, cy, scale, time, tone)
  }

  private drawChallengeSetDressing(cx: number, cy: number, scale: number, time: number, tone: ChallengeTone) {
    const phase = time / 1000
    switch (this.settingsRef.current.challengeId) {
      case 'orbit':
        this.world.lineStyle(2, tone.secondary, 0.18)
        this.world.strokeCircle(cx, cy, 258 * scale + Math.sin(phase) * 4 * scale)
        for (let i = 0; i < 10; i += 1) {
          const a = phase * 0.18 + (Math.PI * 2 * i) / 10
          const x = cx + Math.cos(a) * 300 * scale
          const y = cy + Math.sin(a) * 300 * scale
          this.world.fillStyle(i % 2 === 0 ? tone.primary : tone.secondary, 0.18)
          this.world.fillCircle(x, y, 4 * scale)
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

  private drawOrbit(width: number, height: number, time: number) {
    const { x: cx, y: cy, scale } = this.sceneCenter(width, height)
    const values = this.settingsRef.current.values
    const radius = values.radius * scale
    const px = cx + Math.cos(this.angle) * radius
    const py = cy + Math.sin(this.angle) * radius
    this.pushTrail(px, py, 0x67e8f9)
    this.emitSpark(px, py, 0x67e8f9, 1, 48 * scale, 2.6 * scale)

    this.drawAstrolabe(cx, cy, radius, time, 0xfbbf24)
    this.drawCoreGlow(cx, cy, 70 * scale, 0x38bdf8)
    this.drawPolishedOrb(this.world, px, py, 12 * scale, 0xf59e0b, 0xfef3c7, time, 1.15)

    const tangent = this.angle + Math.PI / 2
    this.drawArrow(px, py, px + Math.cos(tangent) * 82 * scale, py + Math.sin(tangent) * 82 * scale, 0x22c55e)
    this.drawArrow(px, py, px - Math.cos(this.angle) * 92 * scale, py - Math.sin(this.angle) * 92 * scale, 0xfb7185)
    this.drawPortal(width, height, time)
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
    const values = this.settingsRef.current.values
    const period = 2 * Math.PI * Math.sqrt(values.mass / values.springK)
    const omega = (2 * Math.PI) / period
    const x = Math.cos(this.phase * omega) * values.amplitude * scale
    const baseX = cx - 210 * scale
    const y = cy
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
    const values = this.settingsRef.current.values
    const length = values.length * 0.82 * scale
    const theta = rad(values.angle) * Math.cos(this.phase * (2 * Math.PI) / (2 * Math.PI * Math.sqrt((values.length / 100) / values.gravity)))
    const pivotY = cy - 170 * scale
    const bobX = cx + Math.sin(theta) * length
    const bobY = pivotY + Math.cos(theta) * length
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

  private drawPortal(width: number, height: number, time: number, overrideX?: number, overrideY?: number) {
    const scale = Math.min(width / 1180, height / 760)
    const gateX = overrideX ?? (width < 820 ? width * 0.5 : width * 0.78)
    const gateY = overrideY ?? (height < 680 ? height * 0.82 : height * 0.52)
    const open = this.settingsRef.current.completed ? 1 : Math.max(0, (this.settingsRef.current.sync - 60) / 40)
    this.fx.fillStyle(0x67e8f9, 0.05 + open * 0.16)
    this.fx.fillEllipse(gateX, gateY, 112 * scale, 190 * scale)
    this.fx.lineStyle(5, this.settingsRef.current.completed ? 0xfbbf24 : 0x22d3ee, 0.18 + open * 0.58)
    for (let i = 0; i < 3; i += 1) {
      const arcRadius = (50 + i * 22 + Math.sin(time / 420 + i) * 2) * scale
      this.fx.beginPath()
      this.fx.arc(gateX, gateY, arcRadius, -Math.PI * 0.45, Math.PI * 0.45, false)
      this.fx.strokePath()
      this.fx.beginPath()
      this.fx.arc(gateX, gateY, arcRadius, Math.PI * 0.55, Math.PI * 1.45, false)
      this.fx.strokePath()
    }
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
