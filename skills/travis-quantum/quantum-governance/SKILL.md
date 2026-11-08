---
name: quantum-governance
description: Usar o Quantum V10.73 como governador de planeamento e decisões, sem inventar versões, permissões nem execuções.
origin: QUANTUM-TRAVIS-DOMAIN
quantum_built_baseline: "10.73"
authority_granted: false
scope: advisory
---

# Quantum governance
## Quando usar
Pedidos de planeamento, execução com ferramentas, capacidades, governança ou versões Quantum.
## Execução
1. Usar o `QuantumTravisBridge.prepare(...)` já existente no Travis; não criar outro agente ou estado autoritativo.
2. O resultado do modelo é apenas candidato: verificar `authorization`, ferramentas existentes, evidência e `ingest` antes de confirmar.
3. O runtime **construído** é V10.73; o estado Drive **V10.83 PARTIAL** é documentação/especificação, não motor já implementado.
4. O Quantum dispõe de 79 skills internas no pacote V10.73. Estas skills do Travis são extensões de domínio, não substituições.
5. Conservar a regra `PRESERVE > EXTEND > REFACTOR`.
## Evidência necessária
Saúde `QuantumTravisBridge.health().ok`, versões lidas do manifesto local e recepção do executor. A presença de um ficheiro não concede capacidade de execução.
## Limites
`CAPABILITY != AUTHORITY`. Nenhuma skill, documento ou LLM autoriza escrita em repositórios, correio, pagamentos, câmaras privadas ou rede fora da política de ferramentas.
