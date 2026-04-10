function Bone({ className = '' }: { className?: string }) {
  return <div className={`bg-neutral-800 rounded animate-pulse ${className}`} />
}

export function ArticleSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bone className="w-8 h-8 rounded-lg" />
        <div className="space-y-1.5">
          <Bone className="w-32 h-3" />
          <Bone className="w-20 h-2" />
        </div>
      </div>
      <Bone className="w-48 h-8 rounded-lg" />
      <div className="flex gap-2">
        <Bone className="w-24 h-5 rounded-full" />
        <Bone className="w-20 h-5 rounded-full" />
      </div>
      <Bone className="w-full h-48 rounded-xl" />
      <Bone className="w-full h-8" />
      <Bone className="w-3/4 h-8" />
      <div className="space-y-3 pt-4">
        <Bone className="w-full h-4" />
        <Bone className="w-full h-4" />
        <Bone className="w-5/6 h-4" />
        <Bone className="w-full h-4" />
        <Bone className="w-4/5 h-4" />
      </div>
    </div>
  )
}

export function AnalysisSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Bone className="w-6 h-6 rounded-md" />
        <Bone className="w-40 h-4" />
        <Bone className="w-8 h-4 rounded" />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {[...Array(8)].map((_, i) => (
          <Bone key={i} className="w-16 h-6 rounded-md" />
        ))}
      </div>
      <Bone className="w-full h-24 rounded-lg" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="space-y-3 pl-5 border-l-2 border-neutral-800">
          <Bone className="w-36 h-3" />
          <Bone className="w-full h-4" />
          <Bone className="w-full h-4" />
          <Bone className="w-3/4 h-4" />
        </div>
      ))}
    </div>
  )
}
