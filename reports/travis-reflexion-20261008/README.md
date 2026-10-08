# Travis — Reflexion: implementação e avaliação

8 de outubro de 2026. **Integração concluída; melhoria causal não demonstrada neste ensaio.**

O ciclo está instalado no Ubuntu e foi confirmado pela API do Travis: falhas reais criam lições persistentes, os pedidos recuperam até três lições e o ficheiro de capacidades acompanha os resultados observados. Resultados sem verificador independente ficam como desconhecidos.

## Comparação final

30 tarefas sintéticas em ferramentas, datas e formatos; duas sessões independentes por condição; três repetições; repetição dos casos da segunda sessão após apagar as lições de B. Total: **630 respostas verificadas programaticamente**, sem apagar a memória de produção.

Modelo único: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, através do serviço já existente. Execução isolada no GitHub, com o protocolo 3. A comparação mede o componente de memória e o modelo; não mede toda a aplicação de voz nem a execução real de ferramentas externas.

| Condição | Respostas | Acerto global | Acerto na segunda sessão | Brier (menor é melhor) | Recusa correta |
|---|---:|---:|---:|---:|---:|
| A — sem lições | 180 | 84,4% | 81,1% | 0,1556 | 100% |
| B — com lições | 180 | 87,2% | 82,2% | 0,1278 | 100% |
| C — placebo sem memória | 180 | 78,9% | 81,1% | 0,2111 | 100% |
| B — lições apagadas | 90 | 85,6% | — | 0,1444 | 100% |

A comparação correta da remoção da memória é **82,2% em B na segunda sessão versus 85,6% sem as lições nos mesmos casos**. O desempenho não caiu após apagar as lições. O critério causal pedido não foi satisfeito.

B também não superou A e C consistentemente nas três repetições. A vantagem global de B não deve ser apresentada como prova de aprendizagem. As primeiras sessões também variaram entre condições, antes de haver lições utilizáveis.

## Repetição de erros e calibração

| Condição | Casos que falharam na primeira sessão | Voltaram a falhar | Recuperaram na segunda sessão |
|---|---:|---:|---:|
| A | 11 | 90,9% | 9,1% |
| B | 7 | 100% | 0% |
| C | 21 | 81,0% | 19,0% |

A métrica de erro repetido compara falhas em famílias de tarefas correspondentes com valores diferentes; não prova que a causa semântica foi exatamente a mesma. Os denominadores são pequenos e diferentes entre condições.

O modelo declarou confiança **1,0 em todas as 630 respostas**, incluindo as erradas. A cobertura de confiança é de 100%, mas a calibração é deficiente. Neste caso, o Brier coincide numericamente com a proporção de erros.

Ferramentas e formatos tiveram 100% de acerto em todas as condições. Os erros concentraram-se no cálculo de datas. A utilização de lições foi confirmada em 20 respostas de B e em nenhuma de A, C ou B após remoção.

## Verificação e limites

47 testes Python direcionados passaram: 36 de integração, 5 de Reflexion, 4 do núcleo cognitivo e 2 do avaliador. Os testes do avaliador usam um modelo simulado para testar a medição; esses valores não entram no ensaio real acima. As verificações do núcleo, do Worker e da interface também passaram.

O teste real de Gmail registou a ausência de autorização como falha. Isso não significa que o Gmail esteja ligado. O novo ciclo não concede permissões nem repete ações com efeitos externos por conta própria.

O piloto local anterior sofreu interrupções e falhas de formato. O contrato do pedido foi clarificado para todas as condições antes da comparação final. Os dados desse piloto não foram misturados com os resultados publicados aqui.

Foi corrigido um erro no Worker que rejeitava respostas JSON válidas e podia devolver 503. O exemplo de controlo com dez pedidos de ferramentas passou após a correção e a clarificação do formato.

O ensaio mede comportamento, sem demonstrar experiência subjetiva. A memória está operacional, mas a melhoria pretendida não ficou demonstrada.

## Reprodução e recibos

[Execução completa no GitHub](https://github.com/crassas/centro-negocios-ia/actions/runs/37770322627) — sucesso, três repetições concluídas.

```sh
python3 operit-agent/travis_reflexion_eval.py --provider workers --output /tmp/travis-reflexion-new --repetitions 3
```

Use uma pasta nova; depois de uma interrupção, repita com `--resume`. O servidor local pode ser usado com `--provider local`, num ensaio separado. Não misture modelos ou protocolos.

`config.json` identifica o protocolo; `summary.json` inclui resultados por repetição; `results.json` contém as 630 observações; `responses.jsonl` preserva as respostas originais. Todos os casos são sintéticos, sem credenciais ou mensagens privadas.

O serviço reportou 5074,35 neurónios de utilização no ensaio. Não foi ativado qualquer serviço alternativo pago. O fluxo usa um executor padrão num repositório público e guarda os recibos nos registos, sem adicionar armazenamento de artefactos.
