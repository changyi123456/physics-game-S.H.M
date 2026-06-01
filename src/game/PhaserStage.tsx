import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { AstrolabeScene } from './AstrolabeScene'
import type { GameSettingsRef } from './astrolabeModel'

type PhaserStageProps = {
  settingsRef: GameSettingsRef
}

export function PhaserStage({ settingsRef }: PhaserStageProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!parentRef.current) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parentRef.current,
      backgroundColor: '#070b18',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
      scene: [new AstrolabeScene(settingsRef)],
    })

    return () => {
      game.destroy(true)
    }
  }, [settingsRef])

  return <div ref={parentRef} className="phaser-stage" />
}
