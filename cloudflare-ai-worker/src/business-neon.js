import { neon } from '@neondatabase/serverless';

// A view pública de negócio no sentido interno: SEM NIF, emails, telefones,
// chaves ou credenciais. O Worker só devolve estes campos após autorização.
export function normalizeBusinessOverview(rows) {
  const clients = (Array.isArray(rows) ? rows : []).slice(0, 30).map(row => ({
    name: String(row.client_name || '').slice(0, 180),
    siteTitle: String(row.website_title || 'Website').slice(0, 180),
    siteStatus: String(row.website_status || '').slice(0, 45),
    websiteUrl: row.website_url ? String(row.website_url).slice(0, 350) : '',
    repositoryUrl: row.repository_url ? String(row.repository_url).slice(0, 350) : '',
    pendingEur: Number(row.pending_eur) || 0,
    openTasks: Math.max(0, Number(row.open_tasks) || 0)
  }));
  return {
    source: 'neon-postgresql',
    clients,
    totals: {
      sites: clients.length,
      pendingEur: Number(clients.reduce((n, c) => n + c.pendingEur, 0).toFixed(2)),
      openTasks: clients.reduce((n, c) => n + c.openTasks, 0)
    }
  };
}

export async function fetchBusinessOverview(databaseUrl) {
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('Ligação Neon ainda não configurada no Worker.');
  }
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT client_name, website_title, website_status,
           website_url, repository_url, pending_eur, open_tasks
    FROM public.centro_business_overview
    ORDER BY client_name
    LIMIT 30
  `;
  return normalizeBusinessOverview(rows);
}
