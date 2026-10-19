import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBusinessOverview, fetchBusinessOverview } from './src/business-neon.js';

test('preserva apenas informação comercial autorizada',()=>{
  const result=normalizeBusinessOverview([
    {client_name:'Engomadoria Beatriz',website_title:'Website',website_status:'publicado',
     website_url:'https://engomadoriabeatriz.pt',repository_url:'https://github.com/crassas/engomadoria-beatriz',
     pending_eur:'25.00',open_tasks:'0',fiscal_id:'NÃO PODE SAIR',email:'privado@example.com'},
    {client_name:'Pentehouse Barbearia',website_title:'Website',website_status:'publicado',
     pending_eur:'0.00',open_tasks:2}
  ]);
  assert.equal(result.totals.sites,2);
  assert.equal(result.totals.pendingEur,25);
  assert.equal(result.totals.openTasks,2);
  assert.equal(result.source,'neon-postgresql');
  assert.equal(JSON.stringify(result).includes('NÃO PODE SAIR'),false);
  assert.equal(JSON.stringify(result).includes('privado@example.com'),false);
});
test('ligação não configurada não cria consultas',async()=>{
  await assert.rejects(fetchBusinessOverview(''),/configurada/);
});
