// Travis / God's Eye View: pure PT-PT / English command routing.
// Not an LLM. Unknown commands are left for Travis's existing conversation.
export const GEO_PLACES = Object.freeze({
  earth:{label:'Planet Earth',lat:28,lon:-18,alt:18000000},
  porto:{label:'Porto',lat:41.1496,lon:-8.6109,alt:42000},
  campanha:{label:'Campanhã',lat:41.1497,lon:-8.5875,alt:12000},
  gaia:{label:'Vila Nova de Gaia',lat:41.1265,lon:-8.6127,alt:22000},
  lisboa:{label:'Lisboa',lat:38.7223,lon:-9.1393,alt:42000},
  coimbra:{label:'Coimbra',lat:40.2033,lon:-8.4103,alt:36000},
  braga:{label:'Braga',lat:41.5454,lon:-8.4265,alt:38000},
  london:{label:'London',lat:51.5072,lon:-0.1276,alt:56000},
  paris:{label:'Paris',lat:48.8566,lon:2.3522,alt:48000},
  madrid:{label:'Madrid',lat:40.4168,lon:-3.7038,alt:51000},
  berlin:{label:'Berlin',lat:52.52,lon:13.405,alt:50000},
  rome:{label:'Rome',lat:41.9028,lon:12.4964,alt:50000},
  amsterdam:{label:'Amsterdam',lat:52.3676,lon:4.9041,alt:45000},
  helsinki:{label:'Helsinki',lat:60.1699,lon:24.9384,alt:46000},
  oslo:{label:'Oslo',lat:59.9139,lon:10.7522,alt:44000},
  warsaw:{label:'Warsaw',lat:52.2297,lon:21.0122,alt:44000},
  nyc:{label:'New York City',lat:40.758,lon:-73.9855,alt:65000},
  austin:{label:'Austin',lat:30.2672,lon:-97.7431,alt:49000},
  sanfrancisco:{label:'San Francisco',lat:37.7749,lon:-122.4194,alt:54000},
  losangeles:{label:'Los Angeles',lat:34.0522,lon:-118.2437,alt:52000},
  miami:{label:'Miami',lat:25.7617,lon:-80.1918,alt:50000},
  toronto:{label:'Toronto',lat:43.6532,lon:-79.3832,alt:54000},
  tokyo:{label:'Tokyo',lat:35.6762,lon:139.6503,alt:65000},
  sydney:{label:'Sydney',lat:-33.8688,lon:151.2093,alt:57000},
  dubai:{label:'Dubai',lat:25.2048,lon:55.2708,alt:55000},
  saopaulo:{label:'São Paulo',lat:-23.5505,lon:-46.6333,alt:58000},
  maputo:{label:'Maputo',lat:-25.9692,lon:32.5732,alt:45000},
  bissau:{label:'Bissau',lat:11.8636,lon:-15.5977,alt:42000},
  lagos:{label:'Lagos',lat:6.5244,lon:3.3792,alt:52000}
});
const PLACE_ALIASES=[
  ['new york|nova iorque|times square|manhattan|nyc','nyc'],
  ['san francisco|sao francisco','sanfrancisco'],
  ['los angeles','losangeles'],
  ['sao paulo','saopaulo'],
  ['vila nova de gaia|gaia','gaia'],
  ['campanha|sao roque da lameira','campanha'],
  ['oporto|porto','porto'],
  ['lisboa|lisbon','lisboa'],
  ['londres|london','london'],
  ['paris','paris'],['madrid','madrid'],['berlim|berlin','berlin'],
  ['roma|rome','rome'],['amsterdam|amesterdao','amsterdam'],
  ['helsinki|helsinquia','helsinki'],['oslo','oslo'],
  ['varsovia|warsaw','warsaw'],['austin','austin'],
  ['miami','miami'],['toronto','toronto'],
  ['toquio|tokyo','tokyo'],['sydney|sidney','sydney'],
  ['dubai','dubai'],['maputo','maputo'],['bissau','bissau'],
  ['lagos','lagos'],['coimbra','coimbra'],['braga','braga'],
  ['planet earth|planeta terra|planet|planeta|globe|globo|mundo|world','earth']
].map(([phrase,id])=>({test:new RegExp('\\b(?:'+phrase+')\\b'),id}));

/** These are the official upstream's 17 keyless categories, not 17 always-live feeds. */
export const GEO_LAYERS=Object.freeze([
  {key:'flights',pt:'Voos civis',en:'Flights',ids:['flights'],words:/\b(?:flights?|planes?|aircraft|airplanes?|avioes?|voos?|aeronaves?)\b/},
  {key:'military',pt:'Voos militares',en:'Military flights',ids:['military'],words:/\b(?:military|militares?|aviacao militar|military flights?)\b/},
  {key:'satellites',pt:'Satélites',en:'Satellites',ids:['satellites'],words:/\b(?:satellites?|satelites?|iss|estacao espacial)\b/},
  {key:'earthquakes',pt:'Sismos',en:'Earthquakes',ids:['earthquakes'],words:/\b(?:earthquakes?|quakes?|sismos?|terramotos?|tremores?)\b/},
  {key:'traffic',pt:'Trânsito simulado',en:'Traffic simulation',ids:['traffic'],words:/\b(?:traffic|trafego|transito|carros?|vehicles?|congestionamento)\b/},
  {key:'cctv',pt:'Câmaras públicas',en:'Public cameras',ids:['cctv'],words:/\b(?:cctv|cameras?|camaras?|webcams?)\b/},
  {key:'alpr',pt:'Localização ALPR',en:'Mapped ALPR',ids:['alpr-cameras'],words:/\b(?:alpr|leitores? de matricula|license plate readers?)\b/},
  {key:'radio',pt:'Rádio mundial',en:'World radio',ids:['radio'],words:/\b(?:radio|radios?|emissoras?|stations?)\b/},
  {key:'transit',pt:'Transportes públicos',en:'Public transit',ids:['transit'],words:/\b(?:transit|transportes? publicos?|autocarros?|buses?|metros?|trams?|trains?)\b/},
  {key:'bikeshare',pt:'Bicicletas partilhadas',en:'Bikeshare',ids:['bikeshare'],words:/\b(?:bikeshare|bikes?|bicicletas?|ciclovias?)\b/},
  {key:'directions',pt:'Rotas',en:'Directions',ids:['directions'],words:/\b(?:directions|routes?|rotas?|caminhos?|itinerarios?)\b/},
  {key:'launches',pt:'Missões espaciais',en:'Space missions',ids:['rocket-launches'],words:/\b(?:rockets?|launches?|lancamentos?|fogueto?s?|missoes? espaciais?)\b/},
  {key:'installations',pt:'Instalações cartografadas',en:'Mapped installations',ids:['military-installations'],words:/\b(?:installations|bases? militares?|instalacoes? militares?|infraestruturas? militares?)\b/},
  {key:'wind',pt:'Vento',en:'Wind',ids:['wind'],words:/\b(?:wind|vento|ventos?)\b/},
  {key:'weather',pt:'Radar, nuvens e relâmpagos',en:'Observed weather',ids:['weather-radar','weather-satellite','weather-lightning'],words:/\b(?:weather|meteorologia|radar|chuva|rain|nuvens?|clouds?|relampagos?|lightning|tempestades?)\b/},
  {key:'cyclones',pt:'Ciclones',en:'Cyclones',ids:['weather-cyclones'],words:/\b(?:cyclones?|ciclones?|furacoes?|hurricanes?|tuf(ao|oes)|typhoons?)\b/}
]);
export const normalizeGeoText=(value)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[,!?;:.]+/g,' ').replace(/\s+/g,' ').trim();
const NAMED=/\b(?:gods?\s+(?:eye|eyes|ai)(?:\s+view)?|eye of god|godseye|globo|mapa(?:\s+do travis)?|world view)\b/;
const COMMAND=/\b(?:activate|deactivate|engage|start|open|show|take|fly|go|navigate|turn|switch|enable|disable|close|hide|stop|mostra|mostrar|abre|abrir|ativa|ativar|activa|activar|liga|ligar|ir|vai|voa|voar|leva|navega|desliga|desligar|fecha|fechar|oculta|esconde|mete|poe|poer)\b/;
const NEGATIVE=/\b(?:hide|disable|deactivate|remove|off|desliga|desligar|esconde|oculta|ocultar|retira|retirar|tira)\b/;
const EXIT=/\b(?:back to travis|return to travis|voltar ao travis|regressa ao travis|fecha o mapa|fechar o globo|close the globe|exit gods eye|sair do globo)\b/;
const ENGLISH=/\b(?:please|show|fly|take|open|close|enable|disable|earth|globe|flight|flights|satellite|satellites|weather|back|return|switch|map|show me|on|off|to)\b/;

export function interpretGeoRequest(raw,{active=false}={}){
  const text=normalizeGeoText(raw);
  if(!text)return null;
  const language=ENGLISH.test(text)?'en':'pt';
  const named=NAMED.test(text);
  const action=COMMAND.test(text);
  const quit=EXIT.test(text)||(named && /\b(?:deactivate|disable|disengage|shutdown|turn off|stop|exit|close|desativa|desativar|desliga|desligar|fecha|fechar)\b/.test(text));
  if(quit)return {type:'close',language};
  const layers=GEO_LAYERS.filter(item=>item.words.test(text));
  const place=PLACE_ALIASES.find(item=>item.test.test(text))?.id||null;
  const coord=text.match(/\b(-?\d{1,2}(?:\.\d{1,6})?)\s+(-?\d{1,3}(?:\.\d{1,6})?)\b/);
  const coordinates=coord && Math.abs(Number(coord[1]))<=90 && Math.abs(Number(coord[2]))<=180
    ? {label:'Coordinates',lat:Number(coord[1]),lon:Number(coord[2]),alt:45000}:null;
  if(active && /\b(?:help|ajuda|capacidades|capabilities|que podes|what can)\b/.test(text))return {type:'help',language};
  if(active && /\b(?:night vision|visao noturna|nvg|flir|thermal|termica|noir|crt)\b/.test(text)){
    const style=/\b(?:night vision|visao noturna|nvg)\b/.test(text)?'surveillance':
      /\b(?:flir|thermal|termica)\b/.test(text)?'thermal':
      /\bnoir\b/.test(text)?'noir':'retro';
    return {type:'style',style,language};
  }
  if(active && /\b(?:osm|openstreetmap|esri|satellite imagery|imagem satelite)\b/.test(text)){
    return {type:'map',map:/\b(?:osm|openstreetmap)\b/.test(text)?'osm':'esri-imagery',language};
  }
  if((active||named) && layers.length && (active||action)){
    return {type:'layers',layers:layers.map(layer=>layer.key),enable:!NEGATIVE.test(text),place,coordinates,language};
  }
  if((place||coordinates) && (active||action||named)){
    return {type:'navigate',place,coordinates,language};
  }
  if(named && (action||!NEGATIVE.test(text)))return {type:'open',language};
  if(active && layers.length){
    return {type:'layers',layers:layers.map(layer=>layer.key),enable:!NEGATIVE.test(text),language};
  }
  return null;
}
