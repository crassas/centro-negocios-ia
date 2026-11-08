/**
 * Travis far-field Earth renderer for God's Eye View / Cesium.
 *
 * Chrome on Android can render a BLACK Cesium globe when the camera is far
 * away (CesiumGS/cesium#12936), even when Esri and OSM tiles are available.
 * This Android-only, embed-only fallback uses the already-installed static
 * 2048 px Three.js Earth texture on an actual WGS84 3D ellipsoid primitive.
 * It does not use an ImageryProvider (affected by the reported Cesium bug).
 *
 * At city level, the primitive is hidden and the OFFICIAL Cesium globe
 * with Esri/OSM imagery + terrain is restored. All live layer primitives
 * remain part of the original Cesium scene. No new API keys or WebGL contexts.
 *
 * The image is a static cartographic reference, NOT live satellite imagery.
 */
import * as Cesium from 'cesium';

const ENTER_HEIGHT_M=8_000_000;
const EXIT_HEIGHT_M=6_600_000;
const IMAGE_URL='/travis-earth-reference.jpg';
const KEYLESS_STACKS=new Set(['esri-imagery','osm']);
const isAndroidEmbedded=()=>(
  typeof navigator!=='undefined' &&
  /Android/i.test(String(navigator.userAgent||'')) &&
  typeof location!=='undefined' &&
  new URLSearchParams(String(location.search||'')).get('embed')==='1'
);

export function installTravisFarEarth(viewer,mapStackController){
  if(!isAndroidEmbedded()||!viewer?.scene?.primitives||
      !viewer?.scene?.preRender||!mapStackController?.getActiveId){
    return ()=>{};
  }
  let disposed=false,ready=false,active=false,mesh=null,previousGlobe=true;
  const image=new Image();
  image.decoding='async';

  function setOverlay(on){
    if(disposed||!ready||!mesh||active===on)return;
    active=on;
    if(on){
      previousGlobe=viewer.scene.globe.show;
      mesh.show=true;
      // Suppress the BUGGY globe draw only at planetary altitudes.
      // Underlying data layers, scene primitives and camera controls persist.
      viewer.scene.globe.show=false;
      document.body.dataset.travisFarEarth='static-reference';
    }else{
      mesh.show=false;
      viewer.scene.globe.show=previousGlobe;
      delete document.body.dataset.travisFarEarth;
    }
    viewer.scene.requestRender();
  }

  function update(){
    if(disposed||!ready||viewer.isDestroyed?.())return;
    const cartographic=viewer.camera?.positionCartographic;
    const height=cartographic?.height;
    const globeStack=KEYLESS_STACKS.has(mapStackController.getActiveId());
    const scene3d=viewer.scene.mode===Cesium.SceneMode.SCENE3D;
    if(!Number.isFinite(height)||!scene3d||!globeStack){
      if(active)setOverlay(false);
      return;
    }
    if(!active&&height>=ENTER_HEIGHT_M)setOverlay(true);
    else if(active&&height<=EXIT_HEIGHT_M)setOverlay(false);
  }

  const unsubscribe=viewer.scene.preRender.addEventListener(update);
  image.onload=()=>{
    if(disposed)return;
    try{
      // Slightly INSIDE the ellipsoid. Public camera/aircraft/satellite
      // markers above the surface remain visible when Cesium's globe is off.
      const radii=Cesium.Cartesian3.multiplyByScalar(
        Cesium.Ellipsoid.WGS84.radii,0.999985,new Cesium.Cartesian3()
      );
      const geometry=new Cesium.EllipsoidGeometry({
        radii,stackPartitions:64,slicePartitions:128,
        vertexFormat:Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
      });
      const material=Cesium.Material.fromType('Image',{
        image,repeat:new Cesium.Cartesian2(1,1)
      });
      const appearance=new Cesium.MaterialAppearance({
        material,flat:true,closed:true,translucent:false,
        renderState:{
          depthTest:{enabled:true},
          cull:{enabled:true,face:Cesium.CullFace.BACK}
        }
      });
      mesh=new Cesium.Primitive({
        geometryInstances:new Cesium.GeometryInstance({geometry}),
        appearance,show:false,asynchronous:false,allowPicking:false
      });
      viewer.scene.primitives.add(mesh);
      ready=true;
      update();
      console.info('[Travis GEV] Android static WGS84 Earth fallback prepared');
    }catch(error){
      ready=false;
      console.warn('[Travis GEV] Static Earth primitive unavailable; using native Cesium globe',error);
    }
  };
  image.onerror=()=>{
    if(!disposed)console.warn('[Travis GEV] Static Earth texture failed; official imagery remains enabled');
  };
  image.src=IMAGE_URL;
  return ()=>{
    if(disposed)return;
    if(active){
      mesh.show=false;
      viewer.scene.globe.show=previousGlobe;
      delete document.body.dataset.travisFarEarth;
      active=false;
    }
    disposed=true;
    unsubscribe?.();
    image.onload=null;image.onerror=null;
    if(mesh&&!viewer.isDestroyed?.()){
      viewer.scene.primitives.remove(mesh);
      mesh=null;
    }
  };
}
