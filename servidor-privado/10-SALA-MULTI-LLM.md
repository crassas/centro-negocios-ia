# 10 — Sala de Conselho multi-LLM

## Objectivo

Ter vários modelos de linguagem reais a responder uns aos outros dentro do Telegram, em vez de um único modelo com várias personagens.

## Comando

```text
/mesa <tema>
```

Exemplo:

```text
/mesa como levamos a Pentehouse ao próximo nível?
```

## Modelos e papéis

### 1. GLM-4.7-Flash — Explorador

Modelo:

`@cf/zai-org/glm-4.7-flash`

Função:
- enquadrar o problema;
- abrir possibilidades;
- detectar oportunidades e riscos;
- preparar perguntas para os modelos seguintes.

### 2. GPT-OSS-120B — Arquitecto

Modelo:

`@cf/openai/gpt-oss-120b`

Função:
- ler a resposta do Explorador;
- discordar ou aproveitar o que fizer sentido;
- transformar possibilidades em estratégia;
- ordenar dependências e execução.

### 3. Llama 3.3 70B Fast — Crítico

Modelo:

`@cf/meta/llama-3.3-70b-instruct-fp8-fast`

Função:
- ler Explorador + Arquitecto;
- procurar pressupostos frágeis;
- detectar riscos, custos escondidos e passos fora de ordem;
- devolver as correcções mais importantes.

### 4. GPT-OSS-120B — Síntese

O GPT-OSS volta a receber:
- tema original;
- resposta do Explorador;
- resposta do Arquitecto;
- crítica do Llama.

Fecha a mesa com:
- decisão;
- porquê;
- ordem de execução;
- pontos ainda por verificar.

## Fluxo

```
Utilizador
   ↓
/mesa tema
   ↓
GLM-4.7-Flash
   ↓
GPT-OSS-120B
   ↓
Llama 3.3 70B Fast
   ↓
GPT-OSS-120B
   ↓
Síntese no Telegram
```

Cada modelo vê o trabalho anterior. Isto é uma conversa encadeada entre LLMs diferentes, não apenas nomes/personas.

## Resiliência

Cada ronda tem fallback para outro modelo quando possível.

A mesa é executada em background no Worker através de `waitUntil`, para o webhook do Telegram responder rapidamente.

## Custos

Regra da estação:

`PAID_FALLBACK=false`

A mesa deve usar apenas modelos disponíveis dentro da capacidade gratuita/configurada. Não deve activar modelos que exijam plano pago sem autorização.

Para poupar quota:
- 1 ronda por comando;
- respostas limitadas;
- a mesa só abre quando o utilizador pede explicitamente `/mesa`.

## Estado

Código implementado no Worker.

A publicação do Worker foi concluída. A validação funcional final deve ser feita pelo Telegram com um comando `/mesa`.
