export default function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div key={i}
            className="w-2 h-2 rounded-full bg-blue-700 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}
