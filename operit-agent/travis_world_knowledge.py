"""Original bilingual study notes, dated references, never personal memories.

This small grounding layer complements the model and existing web tools. It is
not a claim to contain all knowledge. No remote code or full books are fetched.
"""
REVIEWED = '2026-10-10'
# id, author, bilingual subject/title, original PT + EN paraphrase, primary reference, status
CARDS = (
('world-solar', 'NASA', 'astronomia astronomy', 'Sistema solar / Solar system',
 'O sistema solar inclui o Sol, oito planetas e muitos corpos menores. Uma projeção didática costuma alterar tamanhos e distâncias para tornar os corpos visíveis. EN: The solar system includes the Sun, eight planets and many smaller bodies. A teaching scene commonly changes sizes and distances for visibility; it must not claim to be to scale.',
 'https://science.nasa.gov/solar-system/', 'scientific_summary'),
('world-orbits', 'NASA', 'física physics gravidade gravity', 'Órbitas e viagens / Orbits and journeys',
 'Estar em órbita não significa escapar à gravidade: uma nave em queda livre tem velocidade lateral suficiente para continuar a contornar o planeta. EN: An orbiting spacecraft is still under gravity. Free fall and sideways velocity allow it to keep circling the planet. A cinematic trajectory is an illustration unless a physical model computes it.',
 'https://science.nasa.gov/learn/basics-of-space-flight/chapter3-4/', 'scientific_summary'),
('world-rain', 'US Geological Survey', 'água chuva water rain weather', 'Chuva e condensação / Rain and condensation',
 'O vapor de água pode condensar em gotas. Nas nuvens, gotas e cristais de gelo podem crescer e cair como precipitação. EN: Water vapour can condense into droplets. In clouds, droplets and ice particles can grow and fall as precipitation. A rain effect needs animated particles, not a static solid 3D model.',
 'https://www.usgs.gov/water-science-school/science/condensation-and-water-cycle', 'scientific_summary'),
('world-water', 'US Geological Survey', 'Terra oceanos Earth oceans', 'Ciclo da água / Water cycle',
 'A água circula entre atmosfera, oceanos, solo, gelo e seres vivos. Evaporação, precipitação, escoamento e infiltração ligam esses reservatórios. EN: Water moves between the atmosphere, oceans, soil, ice and living organisms. Evaporation, precipitation, runoff and infiltration connect these stores; the cycle has many routes, not one mandatory sequence.',
 'https://www.usgs.gov/water-science-school/water-cycle', 'scientific_summary'),
('world-dna', 'National Human Genome Research Institute', 'biologia biology ADN DNA genes', 'ADN e informação / DNA and information',
 'O ADN contém informação biológica na sequência de bases. A dupla hélice inclui pares A–T e C–G. EN: DNA carries biological information in its base sequence. Its double helix includes A–T and C–G pairs. A visual resemblance between a software network and DNA does not make the software a living organism.',
 'https://www.genome.gov/genetics-glossary', 'scientific_summary'),
('world-climate', 'NASA', 'clima climate ambiente environment', 'Clima e evidência / Climate and evidence',
 'O aquecimento global é sustentado por observações de temperatura, oceanos e gelo. Tempo meteorológico local e tendências climáticas são escalas distintas. EN: Global warming is supported by observations of temperature, oceans and ice. Local weather and climate trends describe different scales. Check dated primary measurements for current numerical claims.',
 'https://science.nasa.gov/climate-change/evidence/', 'scientific_summary'),
('world-stoic', 'Epicteto / Epictetus', 'filosofia philosophy stoicism estoicismo', 'Escolha e controlo / Choice and control',
 'Epicteto distingue os nossos juízos e escolhas dos acontecimentos que não dominamos. Esta perspetiva convida a agir onde existe margem de ação, sem prometer controlo total. EN: Epictetus distinguishes our judgements and choices from events beyond our control. This philosophical lens invites deliberate action without promising mastery over every outcome.',
 'https://www.gutenberg.org/ebooks/45109', 'philosophy'),
('world-tao', 'Laozi, tradução histórica de James Legge', 'espiritualidade spirituality taoism taoismo', 'Ação sem forçar / Action without forcing',
 'Uma leitura do Tao Te Ching valoriza simplicidade, flexibilidade e ação sem imposição excessiva. As interpretações variam entre tradições e traduções. EN: One reading of the Tao Te Ching values simplicity, flexibility and action without excessive forcing. Interpretations differ across traditions and translations; this is a philosophical reading, not an experimentally proven cosmic law.',
 'https://www.gutenberg.org/ebooks/216', 'philosophical_interpretation'),
('world-spiritual', 'William James', 'religião religion significado meaning spirituality', 'Experiência e significado / Experience and meaning',
 'James estudou relatos de experiência religiosa e a sua importância para a vida das pessoas. Um relato pode ter significado pessoal sem resolver a verdade de uma tese metafísica. EN: James examined religious experiences and their significance in human lives. An account may carry personal meaning without settling whether a metaphysical claim is true.',
 'https://www.gutenberg.org/ebooks/621', 'historical_interpretation'),
('world-bilingual', 'Política de conversação Travis', 'comunicação communication português English', 'Clareza e tradução / Clarity and translation',
 'Responder em português de Portugal ou inglês conforme a preferência explícita. Explicar primeiro a ideia central, depois um exemplo. Preservar incerteza ao traduzir. EN: Follow the explicit Portuguese or English preference. Explain the central idea, then give an example. Translation must preserve uncertainty and never add facts. This is a software communication policy.',
 'https://github.com/crassas/centro-negocios-ia/blob/main/docs/travis-natural-conversation.md', 'software_policy'),
)
