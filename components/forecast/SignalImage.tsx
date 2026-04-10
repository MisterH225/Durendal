'use client'

import { useState } from 'react'

export function SignalImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) return null

  return (
    <div className="relative w-full h-40 bg-neutral-800 overflow-hidden flex-shrink-0">
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
    </div>
  )
}
