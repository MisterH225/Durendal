export type Locale = 'fr' | 'en'

const dict = {
  fr: {
    // Nav
    'nav.explore':    'Explorer',
    'nav.leaderboard':'Classement',
    'nav.dashboard':  'Tableau de bord',
    'nav.login':      'Connexion',

    // Hero
    'hero.badge':    'Intelligence probabiliste en temps réel',
    'hero.title':    'Que va-t-il se passer\u00a0?',
    'hero.subtitle': 'Des questions curatées. Des probabilités agrégées. La sagesse des foules rencontre l\'analyse IA.',

    // Forecast listing
    'page.featured':        'À la une',
    'page.all':             'Tout',
    'page.no_questions':    'Aucune question ouverte.',
    'page.no_questions_ch': 'Aucune question ouverte dans ce canal.',

    // Status
    'status.open':         'Ouverte',
    'status.closed':       'Fermée',
    'status.resolved_yes': 'Résolu OUI',
    'status.resolved_no':  'Résolu NON',
    'status.annulled':     'Annulé',
    'status.draft':        'Brouillon',

    // Days left
    'days.closed':   'Clôturé',
    'days.today':    'Aujourd\'hui',
    'days.tomorrow': 'Demain',
    'days.left':     'J-',

    // Question detail
    'q.back':             'Retour aux questions',
    'q.crowd':            'Foule',
    'q.ai':               'IA',
    'q.blended':          'Blended',
    'q.history':          'Historique de probabilité',
    'q.legend.crowd':     'Foule',
    'q.legend.ai':        'IA',
    'q.legend.blended':   'Blended',
    'q.analysis':         'Analyse IA',
    'q.confidence':       'confiance',
    'q.bullish':          'Facteurs haussiers',
    'q.bearish':          'Facteurs baissiers',
    'q.uncertainties':    'Incertitudes clés',
    'q.next_catalyst':    'Prochain catalyseur',
    'q.base_rate':        'Base rate',
    'q.sources':          'Sources analysées',
    'q.resolution':       'Critères de résolution',
    'q.source_lbl':       'Source',
    'q.see_source':       'Voir la source',
    'q.notes':            'Note',
    'q.stats':            'Statistiques',
    'q.participants':     'Participants',
    'q.crowd_prob':       'Prob. foule',
    'q.ai_prob':          'Prob. IA',
    'q.close_date':       'Clôture',
    'q.your_forecast':    'Votre prévision actuelle',
    'q.your_forecast_hint':'Modifiez votre estimation ci-dessous si votre avis a changé.',

    // Submit form
    'form.title':        'Votre estimation',
    'form.current':      'Actuel',
    'form.vote_label':   'Votre vote',
    'form.no_label':     '0% (Non)',
    'form.yes_label':    '100% (Oui)',
    'form.reason':       'Justification (optionnel)',
    'form.reason_ph':    'Pourquoi cette probabilité\u00a0?',
    'form.submit':       'Soumettre mon estimation',
    'form.update':       'Mettre à jour',
    'form.submitting':   'Envoi…',
    'form.success':      'Estimation soumise',
    'form.success_msg':  'Merci. Votre probabilité a été prise en compte.',
    'form.login_prompt': 'Connectez-vous pour soumettre votre estimation.',
    'form.login_btn':    'Se connecter',

    // Leaderboard
    'lb.badge':          'Classement des prévisionnistes',
    'lb.title':          'Leaderboard',
    'lb.subtitle':       'Classé par score de Brier moyen. Plus le score est bas, meilleure est la précision.',
    'lb.how_title':      'Comment fonctionne le score de Brier\u00a0?',
    'lb.how_body':       'Le score de Brier mesure la précision de vos prédictions : 0 = parfait, 1 = totalement faux.',
    'lb.formula':        '(probabilité soumise − résultat réel)²',
    'lb.col_rank':       'Rang',
    'lb.col_user':       'Prévisionniste',
    'lb.col_brier':      'Score Brier',
    'lb.col_accuracy':   'Précision',
    'lb.col_questions':  'Questions',
    'lb.stat_users':     'Prévisionnistes actifs',
    'lb.stat_best':      'Meilleur score Brier',
    'lb.stat_avg':       'Précision moyenne',
    'lb.empty_title':    'Aucun score pour l\'instant.',
    'lb.empty_sub':      'Les scores apparaîtront après la résolution des premières questions.',
    'lb.footer':         'Seules les questions officiellement résolues comptent. Scores mis à jour automatiquement.',
    'lb.excellent':      'Excellent',
    'lb.good':           'Bon',
    'lb.average':        'Moyen',
    'lb.weak':           'Faible',

    // Footer
    'footer.disclaimer': 'Probabilités agrégées à titre informatif uniquement. Aucun pari, aucun token.',
    'footer.veille':     'Veille Pro',

    // Sidebar
    'sb.principal':      'Principal',
    'sb.dashboard':      'Tableau de bord',
    'sb.watches':        'Mes veilles',
    'sb.opportunities':  'Opportunités',
    'sb.market':         'Analyse marché',
    'sb.ai_agents':      'Agents IA',
    'sb.actions':        'Actions marché',
    'sb.assistant':      'Assistant IA',
    'sb.intelligence':   'Intelligence',
    'sb.forecast':       'Forecast',
    'sb.account':        'Compte',
    'sb.plan':           'Forfait',
    'sb.admin_section':  'Administration',
    'sb.admin_link':     'Panel Admin',
  },

  en: {
    // Nav
    'nav.explore':    'Explore',
    'nav.leaderboard':'Leaderboard',
    'nav.dashboard':  'Dashboard',
    'nav.login':      'Sign in',

    // Hero
    'hero.badge':    'Real-time probabilistic intelligence',
    'hero.title':    'What will happen next?',
    'hero.subtitle': 'Curated questions. Aggregated probabilities. Crowd wisdom meets AI analysis.',

    // Forecast listing
    'page.featured':        'Featured',
    'page.all':             'All',
    'page.no_questions':    'No open questions.',
    'page.no_questions_ch': 'No open questions in this channel.',

    // Status
    'status.open':         'Open',
    'status.closed':       'Closed',
    'status.resolved_yes': 'Resolved YES',
    'status.resolved_no':  'Resolved NO',
    'status.annulled':     'Annulled',
    'status.draft':        'Draft',

    // Days left
    'days.closed':   'Closed',
    'days.today':    'Today',
    'days.tomorrow': 'Tomorrow',
    'days.left':     'D-',

    // Question detail
    'q.back':             'Back to questions',
    'q.crowd':            'Crowd',
    'q.ai':               'AI',
    'q.blended':          'Blended',
    'q.history':          'Probability history',
    'q.legend.crowd':     'Crowd',
    'q.legend.ai':        'AI',
    'q.legend.blended':   'Blended',
    'q.analysis':         'AI Analysis',
    'q.confidence':       'confidence',
    'q.bullish':          'Bullish factors',
    'q.bearish':          'Bearish factors',
    'q.uncertainties':    'Key uncertainties',
    'q.next_catalyst':    'Next catalyst',
    'q.base_rate':        'Base rate',
    'q.sources':          'Sources analyzed',
    'q.resolution':       'Resolution criteria',
    'q.source_lbl':       'Source',
    'q.see_source':       'View source',
    'q.notes':            'Note',
    'q.stats':            'Statistics',
    'q.participants':     'Participants',
    'q.crowd_prob':       'Crowd prob.',
    'q.ai_prob':          'AI prob.',
    'q.close_date':       'Closes',
    'q.your_forecast':    'Your current forecast',
    'q.your_forecast_hint':'Update your estimate below if your view has changed.',

    // Submit form
    'form.title':        'Your estimate',
    'form.current':      'Current',
    'form.vote_label':   'Your vote',
    'form.no_label':     '0% (No)',
    'form.yes_label':    '100% (Yes)',
    'form.reason':       'Reasoning (optional)',
    'form.reason_ph':    'Why this probability?',
    'form.submit':       'Submit my estimate',
    'form.update':       'Update',
    'form.submitting':   'Sending…',
    'form.success':      'Estimate submitted',
    'form.success_msg':  'Thank you. Your probability has been recorded.',
    'form.login_prompt': 'Sign in to submit your estimate.',
    'form.login_btn':    'Sign in',

    // Leaderboard
    'lb.badge':          'Forecaster leaderboard',
    'lb.title':          'Leaderboard',
    'lb.subtitle':       'Ranked by average Brier score. Lower is better.',
    'lb.how_title':      'What is the Brier score?',
    'lb.how_body':       'The Brier score measures the accuracy of your predictions: 0 = perfect, 1 = completely wrong.',
    'lb.formula':        '(submitted probability − actual outcome)²',
    'lb.col_rank':       'Rank',
    'lb.col_user':       'Forecaster',
    'lb.col_brier':      'Brier Score',
    'lb.col_accuracy':   'Accuracy',
    'lb.col_questions':  'Questions',
    'lb.stat_users':     'Active forecasters',
    'lb.stat_best':      'Best Brier score',
    'lb.stat_avg':       'Average accuracy',
    'lb.empty_title':    'No scores yet.',
    'lb.empty_sub':      'Scores will appear after the first questions are resolved.',
    'lb.footer':         'Only officially resolved questions count. Scores updated automatically.',
    'lb.excellent':      'Excellent',
    'lb.good':           'Good',
    'lb.average':        'Average',
    'lb.weak':           'Weak',

    // Footer
    'footer.disclaimer': 'Aggregated probabilities for informational purposes only. No bets, no tokens.',
    'footer.veille':     'Intelligence Pro',

    // Sidebar
    'sb.principal':      'Main',
    'sb.dashboard':      'Dashboard',
    'sb.watches':        'My watches',
    'sb.opportunities':  'Opportunities',
    'sb.market':         'Market analysis',
    'sb.ai_agents':      'AI Agents',
    'sb.actions':        'Market actions',
    'sb.assistant':      'AI Assistant',
    'sb.intelligence':   'Intelligence',
    'sb.forecast':       'Forecast',
    'sb.account':        'Account',
    'sb.plan':           'Plan',
    'sb.admin_section':  'Administration',
    'sb.admin_link':     'Admin Panel',
  },
} as const

type Dict = typeof dict.fr
export type TKey = keyof Dict

/** Translate a key for a given locale. */
export function tr(locale: Locale, key: TKey): string {
  return (dict[locale] as Dict)[key] ?? (dict.fr as Dict)[key] ?? key
}

export { dict }
