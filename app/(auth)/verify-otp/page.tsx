import { Suspense } from 'react'
import VerifyOtpContent from './verify-otp-content'

function VerifyOtpFallback() {
  return (
    <div className="w-full max-w-md">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 text-center animate-pulse">
        <div className="w-14 h-14 rounded-full bg-neutral-100 mx-auto mb-5" />
        <div className="h-6 bg-neutral-100 rounded mx-auto mb-2 max-w-[260px]" />
        <div className="h-4 bg-neutral-100 rounded mx-auto max-w-[200px]" />
      </div>
    </div>
  )
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<VerifyOtpFallback />}>
      <VerifyOtpContent />
    </Suspense>
  )
}
