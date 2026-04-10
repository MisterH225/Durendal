'use client'

import { useState } from 'react'
import { BookOpen, Zap } from 'lucide-react'

interface Props {
  leftPane: React.ReactNode
  rightPane: React.ReactNode
  locale: string
}

export function SplitReaderLayout({ leftPane, rightPane, locale }: Props) {
  const [activeTab, setActiveTab] = useState<'article' | 'analysis'>('article')

  const t = (fr: string, en: string) => locale === 'fr' ? fr : en

  return (
    <>
      {/* Desktop: side-by-side */}
      <div className="hidden lg:flex gap-0 min-h-[calc(100vh-3.5rem)]">
        {/* Left reading pane — 58% */}
        <div className="w-[58%] border-r border-neutral-800 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-8">
            {leftPane}
          </div>
        </div>

        {/* Right analysis pane — 42% */}
        <div className="w-[42%] overflow-y-auto bg-neutral-950/50">
          <div className="max-w-xl mx-auto px-6 py-8">
            {rightPane}
          </div>
        </div>
      </div>

      {/* Mobile: tabbed */}
      <div className="lg:hidden">
        {/* Sticky tab bar */}
        <div className="sticky top-14 z-40 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800">
          <div className="flex">
            <button
              onClick={() => setActiveTab('article')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
                activeTab === 'article'
                  ? 'text-white border-b-2 border-blue-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <BookOpen size={13} />
              {t('Article', 'Article')}
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
                activeTab === 'analysis'
                  ? 'text-white border-b-2 border-blue-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Zap size={13} />
              {t('Implications IA', 'AI Implications')}
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="max-w-2xl mx-auto px-4 py-6">
          {activeTab === 'article' ? leftPane : rightPane}
        </div>
      </div>
    </>
  )
}
