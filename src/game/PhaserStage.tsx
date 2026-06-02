import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { AstrolabeScene } from './AstrolabeScene'
import type { ControlKey, GameSettingsRef } from './astrolabeModel'

type ValuePatch = Partial<Record<ControlKey, number>>

type PhaserStageProps = {
  settingsRef: GameSettingsRef
  onValuePatch: (patch: ValuePatch) => void
}

export function PhaserStage({ settingsRef, onValuePatch }: PhaserStageProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const onValuePatchRef = useRef(onValuePatch)

  useEffect(() => {
    onValuePatchRef.current = onValuePatch
  }, [onValuePatch])

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
      scene: [new AstrolabeScene(settingsRef, (patch) => onValuePatchRef.current(patch))],
    })

    return () => {
      game.destroy(true)
    }
  }, [settingsRef])

  return <div ref={parentRef} className="phaser-stage" />
}
