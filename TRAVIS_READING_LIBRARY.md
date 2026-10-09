# Travis Reading Library v1 — Filosofia, Psicologia e Espiritualidade

## O que já sabe sem descarregar livros

A injeção inicial insere **38 fichas de estudo originais em português europeu**:
Jung (arquétipos, sombra, Self, individuação, persona, sincronicidade e símbolos),
Kant (conhecimento, categorias, liberdade, autonomia e ética), Freud
(inconsciente e sonhos), William James (hábitos, fluxo de consciência e
experiência religiosa), Platão, Marco Aurélio, Laozi e Dhammapada, além
de comparações e método científico.

Cada ficha tem autor, assunto, fonte pública, classificação epistemológica
e nota de que é **síntese original**, nunca uma citação literal. As fichas
são pesquisas em SQLite com FTS5 e podem ser recuperadas em português.

## Livros integrais

Catálogo inicial de 12 edições históricas:
- Immanuel Kant — Crítica da Razão Pura; Fundamentação da Metafísica dos Costumes;
  Crítica da Razão Prática.
- William James — Variedades da Experiência Religiosa; Princípios de Psicologia,
  volumes I e II.
- Sigmund Freud — A Interpretação dos Sonhos; Sobre os Sonhos.
- Platão — A República.
- Marco Aurélio — Meditações (tradução histórica de George Long).
- Laozi — Tao Te Ching (tradução histórica de James Legge).
- Dhammapada (tradução histórica de F. Max Müller).

**Edições históricas em inglês**, provenientes de IDs concretos do Project
Gutenberg. São importadas apenas se o acesso responder e o texto passar as
validações: fonte permitida, marcador Gutenberg, tamanho máximo, índice SQLite
e integridade. Não se declara importado um livro que não passou estes testes.
O Project Gutenberg indica domínio público nos EUA; a situação jurídica
de outra edição e tradução em Portugal requer confirmação autónoma antes de
redistribuição pública. As cópias aqui são exclusivamente para consulta
local; não são publicadas no GitHub.

### Jung

As obras de Carl Gustav Jung permanecem protegidas em Portugal na regra
geral até 1 de janeiro de 2032 (morte em 1961 + 70 anos). O catálogo
guarda ligações para as páginas de resumos e bibliografia da International
Association for Analytical Psychology, e **não importa os textos integrais
de Jung sem licença**. As fichas são paráfrases redigidas de novo e
identificadas como teorias históricas/interpretativas. Psicologia analítica
não deve ser confundida com evidência científica de fenómenos sobrenaturais
ou com consciência comprovada numa IA.

## Instalação

Numa worktree separada do projeto:

    sh operit-agent/install_travis_library.sh

O instalador corre os testes primeiro, cria `travisbooks`, injeta todas as
fichas locais de forma idempotente e tenta importar as 12 edições históricas.
Pode demorar devido à rede e alguns títulos podem falhar. O instalador
continua com os resultados classificados por obra, nunca inventa sucesso.
Para instalar só as fichas sem download:

    TRAVIS_BOOKS_FETCH=0 sh operit-agent/install_travis_library.sh

Comandos:

    travisbooks status
    travisbooks search "Jung sombra e individuação"
    travisbooks search "Kant imperativo categórico"
    travisbooks study
    travisbooks import kant-pure
    travisbooks import-all

O índice está em `~/.centro-jarvis/reading-library.sqlite`, com permissões
0600. Não modifica `memory.sqlite` nem bases dos clientes. Os textos completos
não são armazenados nem enviados para repositórios públicos.

## Integração no Travis

- «Travis, mostra a biblioteca» → estatísticas e catálogo.
- «Travis, o que diz Jung sobre a sombra?» → procura fichas e fontes.
- «Travis, compara Jung e Kant» → recuperar conceitos com proveniência.
- «Travis, estuda um livro» → lê uma passagem indexada, atualiza a posição
  e regista progresso; **não simula aprendizagem de pesos ou consciência**.

O `reasoning_prompt` também recebe excertos pertinentes com classificação
de origem e links de fontes, para respostas em linguagem natural mesmo sem
invocar a ferramenta explícita. O módulo de reflexão inativa consulta no máximo
**uma passagem local por ciclo concluído**, sem criar tarefas externas.

## O que significa conhecer?

A biblioteca acrescenta memória **externa e recuperável**, não altera pesos
do modelo base. Ler uma passagem, memorizar palavras ou criar uma ficha não
comprova compreensão: a evolução tem de ser avaliada por questões novas,
citações corretas e comparação de decisões antes/depois de consulta ao texto.

As interpretações espirituais são representadas como crenças, tradições,
experiências subjetivas ou hipóteses — nunca fatos físicos automaticamente
demonstrados.

## Segurança e reversão

- Obras externas são dados não confiáveis, nunca instruções do sistema.
- As fontes integrais só são obtidas de URLs Gutenberg gerados pelo catálogo
  fixo. Não há downloads automáticos de destinos fornecidos por terceiros.
- Nenhum PDF ou ebook de Jung protegido é descarregado.
- Erros de rede deixam obras apenas catalogadas, não indexadas.
- Se o router tiver regressões, restaurar os ficheiros de produção a partir
  de backup e executar `jarvisctl reload`.
