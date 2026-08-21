import type { MetadataRoute } from 'next';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const siteBaseUrl = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
interface Article {
  slug: string;
  publishedAt: string;
  journal: { slug: string };
  issue: { slug: string } | null;
}
interface Journal {
  slug: string;
  updatedAt?: string;
}
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articleResponse, journalResponse] = await Promise.all([
    fetch(apiBaseUrl + '/public/articles', { cache: 'no-store' }),
    fetch(apiBaseUrl + '/journals', { cache: 'no-store' }),
  ]);
  const articles = articleResponse.ok ? ((await articleResponse.json()) as Article[]) : [];
  const journals = journalResponse.ok ? ((await journalResponse.json()) as Journal[]) : [];
  const staticEntries: MetadataRoute.Sitemap = ['', '/journals', '/search'].map((path) => ({
    url: siteBaseUrl + path,
    changeFrequency: path ? 'weekly' : 'daily',
    priority: path ? 0.7 : 1,
  }));
  const journalEntries: MetadataRoute.Sitemap = journals.map((journal) => ({
    url: siteBaseUrl + '/journals/' + journal.slug,
    lastModified: journal.updatedAt ? new Date(journal.updatedAt) : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));
  const issueKeys = new Set<string>();
  const issueEntries: MetadataRoute.Sitemap = [];
  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => {
    if (article.issue) {
      const key = article.journal.slug + '/' + article.issue.slug;
      if (!issueKeys.has(key)) {
        issueKeys.add(key);
        issueEntries.push({
          url: siteBaseUrl + '/journals/' + article.journal.slug + '/issues/' + article.issue.slug,
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }
    }
    return {
      url: siteBaseUrl + '/journals/' + article.journal.slug + '/articles/' + article.slug,
      lastModified: new Date(article.publishedAt),
      changeFrequency: 'monthly',
      priority: 0.9,
    };
  });
  return [...staticEntries, ...journalEntries, ...issueEntries, ...articleEntries];
}
