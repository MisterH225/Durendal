# MarketLens — Guide de déploiement complet

Plateforme SaaS de veille concurrentielle pour les marchés africains.

---

## Étape 1 — Créer les comptes (gratuits)

1. **GitHub** → https://github.com (crée un compte, crée un repo "marketlens")
2. **Supabase** → https://supabase.com (crée un projet, note l'URL et la clé anon)
3. **Vercel** → https://vercel.com (connecte avec ton compte GitHub)
4. **Anthropic** → https://console.anthropic.com (crée une clé API)
5. **Firecrawl** → https://firecrawl.dev (crée une clé API gratuite)

---

## Étape 2 — Configurer la base de données Supabase

1. Ouvre ton projet Supabase
2. Va dans **SQL Editor** → **New query**
3. Copie-colle tout le contenu de `/supabase/migrations/001_schema.sql`
4. Clique **Run**
5. Active Google OAuth : **Authentication** → **Providers** → **Google** → entre tes clés Google OAuth

---

## Étape 3 — Installer le projet sur ton ordinateur

### Installe Node.js d'abord
Télécharge sur https://nodejs.org (version LTS recommandée)

### Ouvre le Terminal (ou PowerShell sur Windows)

```bash
# Navigue vers le dossier du projet
cd /chemin/vers/marketlens

# Installe les dépendances
npm install

# Copie le fichier d'environnement
cp .env.local.example .env.local
```

### Remplis le fichier `.env.local`
Ouvre `.env.local` dans un éditeur de texte (Bloc-notes, TextEdit, VS Code) et remplace les valeurs :

```
NEXT_PUBLIC_SUPABASE_URL=https://TONPROJET.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
FIRECRAWL_API_KEY=fc-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPERADMIN_EMAIL=ton@email.com
```

---

## Étape 4 — Lancer en local

```bash
npm run dev
```

Ouvre http://localhost:3000 dans ton navigateur. 🎉

---

## Étape 5 — Déployer sur Vercel (mise en ligne)

```bash
# Installe Vercel CLI
npm install -g vercel

# Connecte et déploie
vercel

# Ajoute les variables d'environnement sur Vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add FIRECRAWL_API_KEY
vercel env add SUPERADMIN_EMAIL

# Redéploie avec les variables
vercel --prod
```

**Ou via l'interface Vercel** (plus simple) :
1. Va sur vercel.com → New Project → Import from GitHub
2. Sélectionne ton repo "marketlens"
3. Dans **Environment Variables**, ajoute toutes les variables du `.env.local`
4. Clique **Deploy**

---

## Structure du projet

```
marketlens/
├── app/
│   ├── (auth)/           # Pages login, signup, verify, reset
│   ├── (dashboard)/      # Dashboard, veilles, marché, agents, assistant, forfait
│   ├── admin/            # Panel SuperAdmin
│   └── api/              # Routes API (chat, agents scrape/synthesize/strategy)
├── components/
│   └── dashboard/        # Sidebar, Topbar
├── lib/
│   └── supabase/         # Client browser + server
├── supabase/
│   └── migrations/       # Schéma SQL complet
└── styles/
    └── globals.css       # Design system
```

---

## Accès Admin

Après t'être inscrit avec l'email défini dans `SUPERADMIN_EMAIL` :
- Tu verras "Panel Admin" dans le menu sidebar
- URL directe : `/admin`

---

## Pages disponibles

| URL | Description |
|-----|-------------|
| `/login` | Connexion email ou Google |
| `/signup` | Création de compte |
| `/dashboard` | Tableau de bord principal |
| `/veilles` | Gestion des veilles |
| `/marche` | Analyse de marché |
| `/agents` | État et contrôle des agents IA |
| `/actions` | Recommandations stratégiques |
| `/assistant` | Chat IA conversationnel |
| `/forfait` | Gestion de l'abonnement |
| `/admin` | Panel SuperAdmin |
| `/admin/access` | Codes promo, profils test, parrainage |

---

## En cas de problème

1. **Page blanche** → Vérifie les variables d'environnement
2. **Erreur Supabase** → Vérifie l'URL et la clé anon dans `.env.local`
3. **Chat IA ne répond pas** → Vérifie ta clé Anthropic API
4. **Agents ne collectent rien** → Vérifie ta clé Firecrawl

📧 Toute erreur → copie-colle le message d'erreur et demande à Claude de t'aider.
