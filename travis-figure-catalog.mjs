// Exact subjects only: a generic figure is never passed off as a named person.
export const FIGURES=Object.freeze({
 human:{pt:'Figura humana',en:'Human figure',aliases:['pessoa','person','human','humano','figura humana','human figure','ser humano'],
  sourceName:'BodyParts3D · DBCLS',sourceUrl:'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html',creditUrl:'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
  imageAuthor:'BodyParts3D, © The Database Center for Life Science',imageLicense:'CC Attribution 4.0 International · Superfície FMA7163; geometria simplificada e material holográfico.',
  summary:'Superfície de um corpo humano adulto de referência, derivada de BodyParts3D. Não representa uma pessoa específica.'},
 astronaut:{pt:'Astronauta',en:'Astronaut',aliases:['astronauta','astronaut','cosmonauta','cosmonaut','traje espacial','spacesuit','space suit','traje aces','aces suit','advanced crew escape suit'],
  sourceName:'NASA 3D Resources · Michael D. Carbajal',sourceUrl:'https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/',creditUrl:'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  imageAuthor:'NASA/Michael D. Carbajal',imageLicense:'Disponibilizado para uso educativo e informativo nas condições NASA Media Usage Guidelines. Geometria e cores convertidas para Travis.',
  summary:'Traje pressurizado ACES disponibilizado pela NASA, usado no lançamento e regresso. Geometria de referência, cores e material holográfico. Pose estática; rotação e transição animadas.'}
});
export const figureKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[.!?]+$/,'');
export function figureSubject(value){
 const key=figureKey(value).replace(/^(?:um|uma|a|an|the|o)\s+/,'');
 return Object.entries(FIGURES).find(([id,f])=>[id,f.pt,f.en,...f.aliases].some(a=>figureKey(a)===key))?.[0]||null;
}
export const figureLabel=(id,language='pt')=>FIGURES[id]?.[language==='pt'?'pt':'en']||id;
