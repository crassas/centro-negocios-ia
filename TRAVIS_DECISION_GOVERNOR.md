# Travis Decision Governor v1 — decisões, risco e aprendizagem

## Objetivo

Integrar o Laya ao ciclo real de decisão do Travis. O Laya devolve uma
distribuição de **preferências relativas entre alternativas**. Essa
distribuição **não é a probabilidade calibrada de sucesso** da ação.

O governador aceita apenas alternativas criadas pelo próprio código e
executa apenas observações de leitura:
- `inspect_centro`: health check da porta local 8765;
- `inspect_laya`: health check local 18790;
- `inspect_router`: health check local 8770;
- `inspect_memory`: integridade/contagem SQLite em modo só de leitura;
- `inspect_repo`: inspeção Git sem escrita.

As outras decisões permitidas são `request_approval` e `defer`.
Alterações a ficheiros, pagamentos, publicações e operações similares
nunca são executadas por este módulo. A palavra «sim» do Laya não
constitui uma autorização.

## Ciclo de decisão

1. Receber o pedido em linguagem natural (português ou inglês).
2. Criar alternativas a partir de domínios concretos reconhecidos.
3. Distinguir observação segura de operações que requerem autorização.
4. Consultar o Laya com alternativas fechadas e validar todos os valores.
5. Verificar preferência mínima e vantagem face à segunda opção.
6. No caso de incerteza, não executar ou recorrer a leitura segura quando
   o modelo está indisponível e existe uma única alternativa observável.
7. Executar apenas uma operação de leitura predefinida.
8. Verificar o resultado por pós-condição HTTP, SQLite ou Git observável.
9. Registar decisão, alternativa, preferências e evidência sem guardar
   texto privado do pedido; apenas um SHA-256 do pedido.
10. Reavaliar a estratégia: após dez falhas/sucessos verificados,
    estimar uma taxa suavizada. Se houver falhas repetidas, adiar novas
    execuções em vez de insistir cegamente.

**Não executa comandos arbitrários, não aprende pesos de modelo e não prova
consciência.** Faz aprendizagem operacional por experiências observadas.

## Usar no Travis (com a versão publicada no servidor local)

- «Travis, decide se deves verificar o estado do Centro.»
- «Travis, decide se a tua memória está disponível.»
- «Travis, decide se podes publicar o site.» — exige aprovação;
  não publica automaticamente.
- «Travis, estado das decisões.» — mostra resumo local.

## Ciência e limitações

O limiar inicial permite consultas reversíveis mesmo com incerteza
moderada (preferência >= 0.50, margem >= 0.08), mas não aplica esses
limiares a operações externas com efeitos permanentes.

A decisão regista as probabilidades originais do modelo e a sua decisão
final em campos separados. Um resultado só entra nas estatísticas
verificadas se tiver pós-condição observável.

Após dez observações de um mesmo tipo de ação, a taxa Beta(1,1)
suavizada dos checks observados pode informar a decisão. Isto não é
calibração da probabilidade de sucesso em tarefas arbitrárias, nem
um ranking de modelos Laya/Jev.

O processo guarda apenas hash do pedido, ações de lista fechada, métricas,
timestamp e códigos de evidência no SQLite local
`~/.centro-jarvis/decision-governor.sqlite` (permissões 0600).

## Testes

```bash
PYTHONPATH=operit-agent python3 operit-agent/travis_decision_selftest.py
PYTHONPATH=operit-agent python3 operit-agent/travis_reflexion_selftest.py
```

Os testes incluem modelo adversarial, probabilidades inválidas, falha do
Laya, incerteza, regras de autorização, persistência, privacidade,
aprendizagem após falhas repetidas e diálogo ponta-a-ponta com simulações
de serviços. O teste de produção deve ainda confirmar resposta real do
Laya e depois o estado do serviço Travis ao reiniciar.

## Reversão

Preservar cópias dos módulos de produção antes de os alterar. Se o
serviço 8770 falhar após a atualização, restaurar os ficheiros e
reiniciar o serviço via `jarvisctl`. Não apagar bases de memória nem
alterar o estado dos projetos.
