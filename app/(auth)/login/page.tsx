import { Suspense } from 'react'
import LoginContent from './login-content'

function LoginFallback() {
  return (
    <div className="w-full max-w-md animate-pulse">
      <div className="h-12 bg-neutral-200 rounded-xl mb-5" />
      <div className="bg-white border border-neutral-200 rounded-2xl p-7">
        <div className="h-6 bg-neutral-200 rounded mb-2 w-3/4" />
        <div className="h-4 bg-neutral-100 rounded w-1/2 mb-6" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  )
}
