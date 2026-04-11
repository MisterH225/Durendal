/**
 * Extracts the main article text content from a URL.
 * Uses fetch + HTML parsing to extract the article body.
 * Falls back gracefully if the page blocks scraping or has no article content.
 */

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
}

interface ExtractedArticle {
  body: string | null
  author: string | null
  publishedAt: string | null
  imageUrl: string | null
  publisher: string | null
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractArticleBody(html: string): string | null {
  // Try structured article content first (JSON-LD)
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatch) {
    for (const script of jsonLdMatch) {
      try {
        const content = script.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '')
        const data = JSON.parse(content)
        const article = Array.isArray(data) ? data.find((d: any) => d.articleBody) : data
        if (article?.articleBody && article.articleBody.length > 200) {
          return article.articleBody
        }
      } catch { /* not valid JSON-LD */ }
    }
  }

  // Try <article> tag
  const articleMatch = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i)
  if (articleMatch) {
    const text = stripHtml(articleMatch[1])
    if (text.length > 300) return cleanText(text)
  }

  // Try common article content selectors via class/id patterns
  const contentPatterns = [
    /<div[^>]+class=["'][^"']*(?:article-body|article-content|story-body|post-content|entry-content|paywall)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+id=["'](?:article-body|article-content|story-body|main-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]+class=["'][^"']*(?:article|story|content)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
  ]

  for (const pattern of contentPatterns) {
    const match = html.match(pattern)
    if (match) {
      const text = stripHtml(match[1])
      if (text.length > 300) return cleanText(text)
    }
  }

  // Fallback: extract all <p> tags and filter for article-like paragraphs
  const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? []
  const texts = paragraphs
    .map(p => stripHtml(p).trim())
    .filter(t => t.length > 60 && !t.startsWith('©') && !t.includes('cookie'))

  if (texts.length >= 3) {
    return texts.join('\n\n')
  }

  return null
}

function cleanText(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (line.length < 20) return false
      if (/^(share|tweet|email|print|copy|subscribe|sign up|log in|advertisement)/i.test(line)) return false
      if (/^(©|copyright|all rights reserved)/i.test(line)) return false
      return true
    })
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 15_000) // Cap at 15K chars
}

export async function extractArticle(url: string): Promise<ExtractedArticle> {
  const empty: ExtractedArticle = { body: null, author: null, publishedAt: null, imageUrl: null, publisher: null }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) return empty

    const html = await res.text()

    const body = extractArticleBody(html)
    const author = extractMeta(html, 'article:author')
      ?? extractMeta(html, 'author')
      ?? extractMeta(html, 'dc.creator')
    const publishedAt = extractMeta(html, 'article:published_time')
      ?? extractMeta(html, 'datePublished')
      ?? extractMeta(html, 'pubdate')
    const imageUrl = extractMeta(html, 'og:image')
      ?? extractMeta(html, 'twitter:image')
    const publisher = extractMeta(html, 'og:site_name')

    return { body, author, publishedAt, imageUrl, publisher }
  } catch {
    return empty
  }
}
