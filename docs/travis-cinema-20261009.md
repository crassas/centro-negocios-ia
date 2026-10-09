# Travis — Interface cinematográfica / preto e dourado

Snapshot das alterações ao **Travis local** em 9 de outubro de 2026. O visual foi inspirado na referência escolhida, com tons de preto, grafite e dourado fosco, sem ciano.

## Ficheiros
- `travis-cinema.css`: camada de apresentação independente, reversível
- `travis-3d.mjs`, `travis-holographic-head.mjs`, `travis-atmosphere.mjs`: apenas cores, luz e versões dos imports
- `travis-brain-view.mjs`, `travis-knowledge-graph.mjs`: partículas, nós, rótulos e ligações quentes
- `index.html`, `sw.js`: carregamento e invalidação de cache

## Provas locais
`node --check` passou em todos os módulos alterados. Os oito ficheiros foram verificados por HTTP no servidor 8770. Os serviços locais 8770 e 8765 responderam normalmente. `/brain/graph` devolveu 6 memórias e 5 ligações; o pedido `estado do cérebro` respondeu corretamente. A operação não alterou o backend, credenciais ou bases SQLite.

## Segurança e reposição
A cópia anterior está guardada em `/root/.centro-jarvis/backups/travis-cinema-20261009T080013Z/`. Reposição local: `/root/.centro-jarvis/backups/travis-cinema-20261009T080013Z/restore.sh`. O restauro exige acesso autorizado ao Ubuntu do telefone.

**Não fundir automaticamente esta branch em main.** É um snapshot do UI local real, que pode incluir alterações locais ainda não integradas na branch principal. Comparar os ficheiros e validar conflitos antes da integração.

O aspecto e a disposição com teclado aberto ainda precisam de confirmação visual num navegador móvel real. A sintaxe e as chamadas HTTP não substituem este teste.
