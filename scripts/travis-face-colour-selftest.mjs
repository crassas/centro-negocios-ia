import assert from 'node:assert/strict';
import { faceColourFromPixels } from '../travis-vision-policy.mjs';

const width=80,height=80;
function image(left,right,top=null) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const rgb=top && y<18?top:(x<40?left:right);
    const i=(y*width+x)*4;
    data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  return data;
}
const medium=faceColourFromPixels(image([160,110,84],[160,110,84]),width,height);
assert.deepEqual(medium.rgb,[160,110,84]);
assert.equal(medium.contrast,0);
assert.equal(medium.measuredPixels,true);

const shaded=faceColourFromPixels(image([220,160,125],[120,82,60]),width,height);
assert.deepEqual(shaded.rgb,[170,121,93]);
assert(shaded.contrast>55,'Left/right illumination difference must be observed');
const foreground=image([174,121,90],[174,121,90],[0,190,0]);
assert.deepEqual(faceColourFromPixels(foreground,width,height).rgb,[174,121,90],
  'Hair/background area outside cheek patches must not affect facial colour');
const dark=faceColourFromPixels(image([69,42,28],[69,42,28]),width,height);
assert.deepEqual(dark.rgb,[69,42,28]);
const washed=faceColourFromPixels(image([255,255,255],[255,255,255]),width,height);
assert.equal(washed,null,'Clipped highlights cannot justify a confident colour');
assert.equal(faceColourFromPixels([],80,80),null);
assert.equal(faceColourFromPixels(image([100,100,100],[100,100,100]),0,0),null);
console.log('PASS FACE_PIXEL_COLOUR: cheek samples, contrasting light, background exclusion, dark/light validity');
