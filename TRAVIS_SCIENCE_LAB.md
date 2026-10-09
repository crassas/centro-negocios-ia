# Travis Science Lab v1 — protocolo de experiência

## Hipótese e método

Hipótese falsificável: os componentes operacionais respondem a observações
repetíveis e a recuperação de experiências anteriores pode superar a escolha
da ferramenta mais recente em episódios futuros comparáveis.

Medições executadas:
1. Respostas de saúde JSON em quatro portas locais, com limite de 0,8 s.
2. Integridade e contagens de três bases SQLite em modo apenas de leitura.
3. Concordância da ferramenta recuperada com a escolhida num episódio
   posterior, comparada com a ferramenta mais recente no mesmo âmbito.

O terceiro ensaio é um indicador indireto da escolha de ferramenta. Não mede
correção das respostas, consciência, inteligência geral ou alterações aos pesos
do modelo. Menos de 20 episódios elegíveis => inconclusivo. Com 20 episódios,
a comparação é descritiva, não constitui prova estatística de superioridade.

## Utilização

    travisscience run
    travisscience verify

Alternativa sem instalação:

    python3 operit-agent/travis_science.py run --state-dir ~/.centro-jarvis --source-dir ~/.centro-jarvis

O laboratório guarda relatórios com agregados e códigos em
~/.centro-jarvis/travis-science.sqlite. Não guarda mensagens, emails ou
credenciais. A cadeia de hashes deteta alterações locais acidentais, mas não
constitui autenticação externa. Os dados de origem são lidos sem alterações.

Instalador local: sh operit-agent/install_travis_science.sh
O instalador não reinicia o Travis nem cria processos em segundo plano.

Testes: python3 operit-agent/travis_science_selftest.py
Os testes usam apenas dados sintéticos e não demonstram uma melhoria real.

## Interpretação

- pass: a condição foi observada no instante da medição.
- fail: a condição não foi observada dentro do prazo; pode ser temporário.
- inconclusive: faltam observações comparáveis.
- measured: existem 20 ou mais observações; não implica vantagem.

Um modelo que só inicia quando necessário pode falhar num health check sem
ter sido desinstalado. A execução periódica automática requer avaliação
prévia de estabilidade, CPU, RAM e armazenamento.
