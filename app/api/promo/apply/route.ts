import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { code, plan } = await req.json()
  if (!code || !plan) return NextResponse.json({ error: 'Code et plan requis' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('id', user.id).single()

  // Trouve le code
  const { data: promoCode } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .single()

  if (!promoCode) return NextResponse.json({ error: 'Code invalide ou expiré' }, { status: 400 })

  // Vérifie la validité
  if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Ce code a expiré' }, { status: 400 })
  }
  if (promoCode.max_uses && promoCode.used_count >= promoCode.max_uses) {
    return NextResponse.json({ error: 'Ce code a atteint son nombre maximum d\'utilisations' }, { status: 400 })
  }
  if (!promoCode.applicable_plans?.includes(plan)) {
    return NextResponse.json({ error: `Ce code n'est pas applicable sur le plan ${plan}` }, { status: 400 })
  }

  // Vérifie si déjà utilisé
  const { data: existingUse } = await supabase
    .from('promo_code_uses')
    .select('id')
    .eq('code_id', promoCode.id)
    .eq('account_id', profile?.account_id)
    .single()

  if (existingUse) return NextResponse.json({ error: 'Vous avez déjà utilisé ce code' }, { status: 400 })

  // Calcule la remise
  let discountAmount = 0
  // Prix en centimes selon le plan
  const planPrices: Record<string, number> = { pro: 9900, business: 24900 }
  const basePrice = planPrices[plan] || 0

  if (promoCode.type === 'percent') {
    discountAmount = Math.round(basePrice * (promoCode.value / 100))
  } else {
    discountAmount = promoCode.value // déjà en centimes
  }

  // Enregistre l'utilisation
  await supabase.from('promo_code_uses').insert({
    code_id: promoCode.id,
    account_id: profile?.account_id,
    discount_applied: discountAmount,
  })

  // Incrémente le compteur
  await supabase.from('promo_codes')
    .update({ used_count: promoCode.used_count + 1 })
    .eq('id', promoCode.id)

  const finalPrice = Math.max(0, basePrice - discountAmount)

  return NextResponse.json({
    success: true,
    discount: {
      type: promoCode.type,
      value: promoCode.value,
      amount_saved: discountAmount,
      final_price: finalPrice,
      duration_months: promoCode.duration_months,
    }
  })
}
