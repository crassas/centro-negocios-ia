# Objetos 3D e fontes visuais do Travis

O pedido de um objeto segue esta ordem: geometria local conhecida (planetas,
casas, motor didático, ADN e letras), pesquisa de geometria completa na Poly
Haven, depois fotografia atribuída quando não existe um modelo compatível.
«Mostra fotografias de…» mantém a pesquisa de fotografias. O botão «Procurar
objeto 3D» de uma fotografia volta a tentar esse assunto como objeto.

Exemplos: «Mostra uma cadeira de madeira», «Mostra uma câmara fotográfica»,
«Mostra futebol», «Roda para a direita» e «Volta a ti». A legenda identifica o
nome do modelo, autor, CC0 e a página da Poly Haven. A geometria importada usa
o mesmo material holográfico e a mesma transição de partículas do rosto. Tem
volume, pode rodar e regressa ao rosto. Não é um retângulo com uma imagem.

O catálogo público é consultado no servidor local e guardado em memória durante
uma hora. A correspondência usa nomes e etiquetas com vocabulário PT/EN; todos
os termos relevantes têm de corresponder. Um resultado apenas semelhante não
substitui o objeto pedido. Há limites de 100 mil triângulos, 4 MB de geometria
e 256 nós. Materiais que precisam de transparência recortada, animações, rigging
e formatos comprimidos não suportados são excluídos. A oferta disponível não
cobre todos os objetos nem todas as variantes.

Os buffers geométricos de glTF têm prioridade. Um atlas de detalhes opcional,
com até 750 KB, conserva painéis, inscrições e relevos de cor sobre o volume;
as suas cores são convertidas para o material dourado. Texturas de vários MB
não são descarregadas. O servidor incorpora os buffers, retira materiais e
extensões e fornece o atlas separado, também incorporado. O cliente valida recursos, hierarquia,
tamanho, coordenadas e profundidade antes de unir as superfícies numa chamada
de desenho. Os pontos de transformação são amostrados da geometria recebida.
Nos ficheiros de bola e câmara testados, a vista seleciona o objeto principal
completo, sem a variante esvaziada da bola ou a correia acessória da câmara.
Respostas antigas são descartadas quando o pedido muda. Durante a pesquisa,
a forma anterior continua visível; o texto do pedido não ocupa o seu lugar.

As fotografias juntam Wikipédia/Wikimedia Commons, NASA para temas espaciais
e iNaturalist para assuntos naturais reconhecidos. O iNaturalist só fornece
fotografias CC0, CC BY e CC BY-SA; os créditos acompanham a fotografia escolhida.
A galeria reserva espaço às fontes independentes relevantes. Há seis imagens
por coleção, cache de resultados e navegação por índice; nunca há um proxy
aberto para URLs do cliente. A origem da fotografia efetiva aparece na legenda.

Uma fotografia continua identificada como «FOTOGRAFIA · RELEVO». O Travis avisa
quando não encontrou um modelo 3D compatível. Não há reconstrução automática
de uma fotografia nesta implementação. Isso exige outro serviço, por exemplo
TRELLIS.2 num servidor com GPU, e as partes ocultas seriam estimadas pelo modelo.
Não é uma recuperação exata de medidas nem de componentes internos.

## Fontes oficiais

- [Poly Haven API](https://api.polyhaven.com/), [termos da API](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md) e [licença CC0](https://polyhaven.com/license). User-Agent identifica o Travis; a interface mostra Poly Haven junto ao objeto.
- [NASA Images API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf).
- [iNaturalist API](https://api.inaturalist.org/v1/docs/).
- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2), apenas como possibilidade futura de reconstrução; não está instalado ou ligado ao Travis.

## Verificação

`python3 scripts/travis-visual-research-selftest.py` testa fontes, licenças,
falhas isoladas, diversidade, correspondência de objetos, buffers, limites e
separação entre fotografia e 3D sem pedidos de rede.

`scripts/travis-real-3d-browser-selftest.mjs` recebe, por ordem, o módulo
Playwright, Chromium, diretório Three.js, diretório de evidências e diretório
de fixtures. As fixtures `cadeira.json`, `camara.json` e `futebol.json` são as
respostas reais de `/visual-research` com `preferModel:true`; `nasa.json` é uma
resposta com uma fotografia NASA selecionada. O teste submete pedidos pelo
formulário real, roda modelos, verifica volume e material, fotografias
explícitas, respostas antigas, buffers externos recusados e regresso ao rosto.
