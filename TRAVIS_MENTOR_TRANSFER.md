# TRAVIS MENTOR — transferência de conhecimento e método v1

## Objetivo e limites

Transmissão explícita de conhecimento explicável, portável e verificável de
um assistente para o Travis. Não se trata de copiar os pesos, o treino,
raciocínio interno não observável ou conversas privadas de um modelo.

Há quatro origens diferentes:
- assistant_authored_methodology: regras ensinadas, não experiências vividas.
- system_config: configuração registada, que precisa de nova prova operacional.
- verified_result: resultado com pós-condição observada.
- hypothesis_not_memory: hipótese ou simulação, nunca promovida a facto.

Informações clínicas, familiares, financeiras e credenciais do operador não
fazem parte desta transferência técnica.

## Algoritmo transferível

A função decision_contract é um contrato operacional determinístico.
Não é uma cópia do algoritmo interno do ChatGPT.

1. INTENÇÃO: identificar o resultado pedido, limites, entidades e autorização.
2. CONTEXTO: recuperar fontes permitidas, preservar âmbito e proveniência.
3. HIPÓTESES: formular alternativas e um teste que pode contrariar a favorita.
4. FERRAMENTAS: consultar registo, permissões e estado; registado não é ativo.
5. PLANO: definir a sequência, custos, riscos e pós-condições observáveis.
6. GATE: bloquear ação não registada; pedir autorização para mutações;
   confirmar funcionamento atual antes de execução.
7. EXECUÇÃO: usar apenas os mecanismos e permissões existentes do Travis.
8. VERIFICAÇÃO: inspecionar efeitos reais independentemente da resposta verbal.
9. APRENDIZAGEM: guardar origem, resultado, incerteza e decisão reutilizável.
10. FALSIFICAÇÃO: testar o efeito da lição em pedidos novos com referência.

mentor_context seleciona instruções relevantes para cada tarefa.
seed_runtime coloca as regras no grafo semântico já existente.
decision_contract apenas devolve planeamento e autorização necessária:
não executa comandos, não abre câmaras e não concede permissões.

## Currículo

São 16 competências com objetivos, procedimentos, critérios de prova e erros
a evitar: ciência falsificável, intenção, ferramentas, contratos de execução,
programação, memória, reflexão, pesquisa, autonomia, sensores, interface
cinematográfica, SEO/AEO/GEO, CRM, avaliação A/B, multiagentes e PT-PT/EN.

O módulo não importa a biografia de outra IA para o Travis. Cada memória
ensinado tem fonte system_config e título MENTOR / ... . A confiança
refere-se à procedência da regra; não prova que o Travis já a sabe executar.

## Instalação no dispositivo

A partir do checkout do ramo com os ficheiros:

    sh operit-agent/install_travis_mentor.sh

O instalador:
- Executa testes offline antes de tocar nas memórias reais.
- Copia o módulo para um caminho privado no telemóvel.
- Exporta currículo JSON com SHA-256 e permissões 0600.
- Insere um nó-base e 16 nós de regras na base semântica existente.
- Mantém memórias prévias e evita duplicação em execuções repetidas.
- Não reinicia o serviço, não altera pesos, não usa APIs pagas.

Comandos:

    travismentor status
    travismentor abilities
    travismentor context --query "Como corrigir um bug com testes?"
    travismentor plan --query "Publicar no GitHub" --tool repo_change
    travismentor export
    travismentor seed

O status relata registos, não garante acesso real às ferramentas.

## Ensaio para comprovar melhoria

1. Medir erros e sucesso do Travis sem este currículo.
2. Apresentar métodos ensinados, mantendo modelo e ferramentas equivalentes.
3. Medir tarefas novas, com resultados independentes da resposta do modelo.
4. Quantificar sucesso, regressões, custos, latência e incerteza.
5. Repetir com pedidos externos à amostra utilizada na preparação.

Mais nós na memória não equivale a maior inteligência, autonomia ou
consciência. Os resultados podem legitimamente ser inconclusivos.

## Próxima integração

A recuperação de memória semântica já existe no Travis; as novas regras
podem ser recuperadas pelo pipeline após a importação. Integrar
mentor_context automaticamente nos prompts completos exige testes com a
versão instalada e limites reais de contexto. Não se declara essa integração
concluída só pela presença de código no repositório.

Não se exportam emails, tokens, dados de saúde ou o histórico integral de
conversas privadas. A atualização não contorna autorização nem dá acesso
ilimitado a contas ou dispositivos. O grafo é memória computacional e a
animação é uma analogia, não prova de neurónios biológicos.
