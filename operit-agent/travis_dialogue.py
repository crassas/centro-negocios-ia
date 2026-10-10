"""Bilingual conversation policy and bounded, declarative visual directions."""
import re
import unicodedata

def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFD', str(text).lower()) if not unicodedata.combining(c))

def control(text):
    t = normalized(text).strip(' .!?')
    t = re.sub(r'^(?:(?:hey|ola|amigo|travis|jarvis|please|por favor)[ ,:]+)+', '', t)
    choices = [
        (r'(?:fala|responde|conversa|speak|answer|talk)(?: comigo| to me)? (?:em |in )?(?:ingles|english)', 'language', 'en'),
        (r'(?:fala|responde|conversa|speak|answer|talk)(?: comigo| to me)? (?:em |in )?(?:portugues(?: de portugal)?|portuguese)', 'language', 'pt'),
        (r'(?:idioma automatico|alterna os idiomas|automatic language|match my language)', 'language', 'auto'),
        (r'(?:fica em espera|entra em espera|descansa|go to sleep|stand by|standby)', 'standby', True),
        (r'(?:acorda|volta|wake up|come back)', 'standby', False),
        (r'(?:desliga o microfone|para de ouvir|turn off (?:the )?microphone|stop listening)', 'microphone', False),
        (r'(?:toma a iniciativa|podes tomar a iniciativa|ativa a iniciativa|be proactive|take initiative)', 'proactive', True),
        (r'(?:nao tomes a iniciativa|desativa a iniciativa|sem interrupcoes|stop being proactive|quiet mode)', 'proactive', False),
    ]
    # Preserve explicit language overrides already installed on the phone.
    if re.fullmatch(r'(?:fala|responde|conversa|speak|answer|talk)(?: comigo| to me)? (?:so |apenas |only )?(?:em |in )?(?:ingles|english)(?: only)?', t):
        return {'setting':'language','value':'en'}
    if re.fullmatch(r'(?:fala|responde|conversa|speak|answer|talk)(?: comigo| to me)? (?:so |apenas |only )?(?:em |in )?(?:portugues(?: de portugal)?|portuguese)(?: only)?', t):
        return {'setting':'language','value':'pt'}
    for pattern, setting, value in choices:
        if re.fullmatch(pattern, t): return {'setting': setting, 'value': value}
    return None

def detect_language(text, fallback='en'):
    tokens = set(re.findall(r'[a-z]+', normalized(text)))
    pt = len(tokens & set('ola quero preciso podes procura pesquisa abre seleciona primeiro segundo fecha pausa retoma obrigado explica como porque portugues fala um uma bicicletas meu minha tens temos para sobre hoje mundo verifica ligado ligacoes acorda fica espera desliga microfone volta sem interrupcoes estou estas esta aqui isso isto nao que por com de dos das ao conheces reconheces sabes tuas teus novas novos capacidades ferramentas funcoes funcionamento memora memorias memoria cerebro rede particulas reflexao aprendizagem consciencia posso conheco agora ja este sistema limites precisao informa resultados instalado registo autorizacao camara'.split()))
    en = len(tokens & set('hello hi want need can could please search find open select first second close pause resume thanks explain how why english speak the a an my your have what who about today world you are is with this that check connected wake sleep microphone listening stop match language awareness know knowledge new capabilities abilities features brain memory learning quantum tool tools installed available current now'.split()))
    return 'pt' if pt > en else 'en' if en > pt else fallback

def language_instruction(language):
    return ('Reply in European Portuguese (Portugal), naturally, without gerunds or Brazilian phrasing.'
            if language == 'pt' else 'Reply in natural British English.')

def illustration(text):
    t = normalized(text)
    if not re.search(r'\b(?:explica|mostra|imagina|visualiza|exemplo|explain|show|imagine|visualize|example)\b', t): return None
    kinds = [('orbit', r'\b(?:sistema solar|solar system|orbita|orbit|planetas?|planets?)\b'),
             ('atom', r'\b(?:atomo|atom|eletrao|electron|molecula|molecule)\b'),
             ('network', r'\b(?:rede|network|neuron|neuronios|cerebro|brain|database|base de dados|crm|internet)\b'),
             ('wave', r'\b(?:som|sound|onda|wave|frequencia|frequency|voz|voice)\b')]
    for kind, pattern in kinds:
        if re.search(pattern, t): return {'kind': 'illustration', 'scene': kind, 'title': text[:100], 'schematic': True, 'autoReturn': True, 'items': []}
    return None

def control_reply(args, language):
    pt = language == 'pt'
    setting, value = args['setting'], args['value']
    if setting == 'language':
        return {'pt': 'Claro. Falamos em português de Portugal.', 'en': 'Of course. Let’s speak English.', 'auto': 'Vou acompanhar o idioma em que falares.' if pt else 'I’ll follow the language you use.'}[value]
    if setting == 'standby':
        return ('Fico em espera. Diz Travis para me chamares.' if pt else 'Standing by. Say Travis when you need me.') if value else ('Estou aqui.' if pt else 'I’m here.')
    if setting == 'microphone': return 'Microfone desligado.' if pt else 'Microphone off.'
    return ('Posso partilhar ideias durante as pausas.' if pt else 'I can share ideas during quiet moments.') if value else ('Só intervenho quando me chamares ou quando um pedido terminar.' if pt else 'I’ll speak when you call me or when a requested task finishes.')

def portuguese_reply(tool, result, fallback):
    if tool == 'capabilities_status':
        if not result.get('ok'):
            return 'Não consegui verificar o meu registo de capacidades. Não vou inventar um estado.'
        from travis_awareness import reply as awareness_reply
        return awareness_reply(result,'pt')
    fixed = {'presence': 'Sou o Travis. Estou aqui. Diz-me o que precisas.', 'stop': 'Parei.',
             'open_youtube': 'YouTube, aqui mesmo. O que queres ver?', 'close_youtube': 'Vou fechar o YouTube.',
             'close_projection': 'Estou de volta.', 'pause_youtube': 'Vou pausar o vídeo.', 'resume_youtube': 'Vou retomar o vídeo.',
             'capabilities_status': 'Posso conversar, pesquisar a web, ler páginas, procurar e reproduzir vídeos, consultar a memória e trabalhar nos teus projetos. As ligações às contas dependem da respetiva autorização.'}
    if tool in fixed: return fixed[tool]
    if tool in {'play_youtube', 'select_youtube', 'search_youtube'}:
        if result.get('videoId'): return 'Vou abrir o vídeo aqui.'
        if result.get('videos'): return 'Aqui estão os vídeos. Podes escolher o primeiro, o segundo ou outro resultado.'
        return 'Não tenho um vídeo confirmado para abrir. Diz-me o que queres procurar.'
    if tool == 'create_task': return 'Tarefa criada: ' + result['title']
    if tool == 'agent_workflow':
        names={'Tasks':'Tarefas','Agents':'Agentes','Published sites':'Sites publicados','Repositories':'Repositórios','Memory':'Memória','Search visibility':'Visibilidade nas pesquisas','Gmail':'Gmail','Centro':'Centro'}
        return 'Verifiquei ' + str(result['completed']) + ' de ' + str(result['total']) + ' áreas pedidas. ' + '; '.join(names.get(x['title'],x['title']) + ': ' + x['detail'].replace('Agent confirmed active','Agente ativo').replace('tasks returned','tarefas encontradas').replace('Centro online','Centro ativo').replace('published sites confirmed online','sites publicados online') for x in result['steps'])
    if tool == 'web_search': return 'Encontrei ' + str(len(result['results'])) + ' resultados públicos. Escolhe um no holograma e posso ler a página.'
    if tool == 'site_check':
        return '; '.join(key + ': ' + ('online' if value.get('online') else 'não foi possível confirmar') for key,value in result.items())
    if tool == 'agent_sessions': return 'O agente de execução está ' + ('ativo.' if result.get('agent') else 'sem confirmação de atividade.')
    if tool == 'gmail_inbox': return 'Consegui consultar o Gmail. Encontrei ' + str(len(result.get('messages', []))) + ' mensagens recentes.'
    if tool == 'neural_status': return 'Memória local: ' + str(result.get('neurons',0)) + ' nós e ' + str(result.get('synapses',0)) + ' ligações.'
    if tool == 'task_list':
        rows = result['tasks']; return ('Tens ' + str(len(rows)) + ' tarefas pendentes. ' + '. '.join(r['title'] for r in rows[:3])) if rows else 'Não tens tarefas pendentes no Travis.'
    if tool == 'note_fact': return 'Guardei essa informação na memória.'
    if tool == 'neural_recall':
        return ('Recuperei estes registos: '+'. '.join(r['title'] for r in result[:4])) if result else 'Não encontrei uma recordação relevante.'
    if tool == 'system_status': return 'O Centro está ' + ('ativo.' if result['centro'].get('ok') else 'indisponível.')
    if tool == 'brain_pause': return 'A reflexão automática está ' + ('pausada.' if result['paused'] else 'ativa.')
    if tool == 'openclaw_status':
        return 'O gateway do OpenClaw respondeu à verificação.' if result['connected'] else 'O OpenClaw está instalado, mas o gateway não respondeu à verificação.' if result['installed'] else 'O OpenClaw não está instalado.'
    return fallback
