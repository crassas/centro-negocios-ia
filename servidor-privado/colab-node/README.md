# GPU Node 01 — Google Colab

## Objectivo

Usar uma GPU temporária do Google Colab como **nó de inferência** da Estação Centro.

Arquitectura:

```
Telegram
   ↓
Cloudflare Worker / TaskQueue
   ↓
GPU Node Colab (polling de saída)
   ↓
Qwen Coder em GPU
   ↓
resultado no Telegram
```

O Colab **não abre portas**, não cria servidor público e não usa túnel. O notebook faz apenas ligações HTTPS de saída para o Worker.

## Perfil automático por VRAM

O nó detecta a GPU e escolhe automaticamente:

- até ~17 GB: `Qwen/Qwen2.5-Coder-7B-Instruct-AWQ`
- ~18–29 GB: `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ`
- 30 GB ou mais: `Qwen/Qwen2.5-Coder-32B-Instruct-AWQ`

Todos são modelos oficiais Qwen, 4-bit AWQ.

## Fluxo de arranque

1. Abrir o notebook no Colab.
2. Activar GPU em **Runtime > Change runtime type > GPU**.
3. Correr as células por ordem.
4. O notebook detecta a GPU e pede emparelhamento.
5. No Telegram, carregar **✅ Autorizar GPU**.
6. O modelo é carregado.
7. Quando surgir `GPU Node ONLINE`, usar no Telegram:

```text
/gpu explica a arquitectura actual da estação
```

## Segurança

- token do nó existe apenas durante a sessão;
- nenhuma chave fica gravada no notebook;
- sem shell remoto;
- o nó aceita apenas tarefas de inferência;
- o Worker limita tamanho de prompt e saída.

## Limitações do Colab

O Colab gratuito não garante GPU, tipo de GPU, duração da sessão ou disponibilidade. O nó deve ser tratado como capacidade temporária, não como infraestrutura permanente.

Não usar várias contas para contornar limites de recursos.

## Ficheiros

- `Centro_GPU_Node_Colab.ipynb` — notebook para abrir no Colab
- `colab_node.py` — runtime do nó GPU
