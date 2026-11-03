import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { SPECTRUM_SIZE, SPECTRUM_LENGTH } from "./waves";

export const sunDirection = new Vector3(-0.65, 0.23, 0.9).normalize();

// Gerstner displacement moves vertices toward the crest, rather than just
// lifting a flat grid. Analytic tangents keep lighting aligned with geometry.
export function createOceanMaterial(scene: Scene): ShaderMaterial {
  const sample = `uniform sampler2D displacementMap;uniform sampler2D surfaceMap;
    vec4 sampleGrid(sampler2D field,vec2 p){
      vec2 grid=fract(p/${SPECTRUM_LENGTH}.0)*${SPECTRUM_SIZE}.0;vec2 cell=floor(grid),f=fract(grid);
      vec2 uv=(cell+.5)/${SPECTRUM_SIZE}.0;float d=1./${SPECTRUM_SIZE}.0;
      return mix(mix(texture2D(field,uv),texture2D(field,uv+vec2(d,0.)),f.x),mix(texture2D(field,uv+vec2(0.,d)),texture2D(field,uv+vec2(d,d)),f.x),f.y);
    }`;
  return new ShaderMaterial(
    "ocean-surface",
    scene,
    {
      vertexSource: `precision highp float;
    attribute vec3 position; uniform mat4 worldViewProjection; uniform mat4 inverseViewProjection; uniform vec3 cameraPosition;
    uniform float time;
    varying vec3 vPosition; varying vec2 vSample;
    ${sample}
    void main(){

      vec4 farPoint=inverseViewProjection*vec4(position.x,position.z,1.,1.);
      vec3 ray=normalize(farPoint.xyz/farPoint.w-cameraPosition);
      float distanceToSea=ray.y < -.0001 ? min(-cameraPosition.y/ray.y,1100.) : 1100.;
      vec2 p=(cameraPosition+ray*distanceToSea).xz;
      vec3 field=sampleGrid(displacementMap,p).xyz;
      vec3 displaced=vec3(p.x+field.y,field.x,p.y+field.z);
      vPosition=displaced;vSample=p;
      gl_Position=worldViewProjection*vec4(displaced,1.);
    }`,
      fragmentSource: `precision highp float;
    uniform float time;
    uniform vec3 cameraPosition,sunDirection;
    varying vec3 vPosition;varying vec2 vSample;
    ${sample}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.07+3.1)+.15*noise(p*4.17-1.7);}
    // Cross-wind wavelets with domain distortion avoid parallel engraved lines.
    float octave(vec2 uv){uv+=(noise(uv)-.5)*1.3;
      vec2 s=1.-abs(sin(uv));vec2 c=abs(cos(uv));s=mix(s,c,s);
      return pow(1.-pow(s.x*s.y,.65),2.5);}
    float wavelets(vec2 p){
      mat2 turn=mat2(1.6,1.2,-1.2,1.6);
      vec2 drift=vec2(time*.31,-time*.17);
      float h=octave(p*1.1+drift)*.55+octave(p*1.1-drift)*.45;
      p=turn*p;
      h+=.22*octave(p*1.1+drift*1.4);
      // Centimetre-scale capillary ripples move independently of large swells.
      h+=.06*octave(p*6.8-drift*2.7);

      return h;
    }
    vec3 skyColor(vec3 r){float y=max(r.y,0.);
      vec3 sky=mix(vec3(.58,.67,.74),vec3(.19,.36,.55),pow(y,.45));
      float cloud=pow(fbm(r.xz/max(.15,r.y)*2.),3.)*.5;
      return mix(sky,vec3(.88,.84,.75),cloud);
    }
    void main(){
      vec2 p=vPosition.xz;
      float distanceToEye=length(cameraPosition-vPosition);
      vec3 view=normalize(cameraPosition-vPosition);
      float e=max(.025,distanceToEye*.0015);
      float h=wavelets(p);
      vec2 slope=vec2(wavelets(p+vec2(e,0.))-h,wavelets(p+vec2(0.,e))-h)/e;
      float detail=exp(-distanceToEye*.018);
      vec4 surface=sampleGrid(surfaceMap,vSample);
      float farDetail=1.-smoothstep(150.,650.,distanceToEye);
      vec3 macroNormal=normalize(mix(vec3(0.,1.,0.),surface.xyz,farDetail));
      vec3 n=normalize(macroNormal+vec3(-slope.x,0.,-slope.y)*.14*detail);
      float nv=max(dot(n,view),.001);
      float fresnel=.02+.98*pow(1.-nv,5.);
      vec3 reflection=skyColor(reflect(-view,n));
      float scatter=pow(max(dot(view,-sunDirection),0.),3.)*max(vPosition.y+.35,0.);
      vec3 deep=vec3(.005,.045,.065);
      vec3 turquoise=vec3(.01,.19,.21);
      vec3 water=mix(deep,turquoise,clamp(.28+vPosition.y*.6+scatter*.5,0.,.8));
      vec3 color=mix(water,reflection*.65,fresnel);
      // Broad rough specular lobe is modulated by real surface detail, not stripes.
      vec3 halfVector=normalize(view+sunDirection);
      float nh=max(dot(n,halfVector),0.);
      float rough=.14;float a2=rough*rough;
      float denominator=nh*nh*(a2-1.)+1.;
      float spec=a2/(3.14159*denominator*denominator);
      color+=vec3(1.,.79,.48)*min(spec*.018,1.1)*max(dot(n,sunDirection),0.);
      vec2 foamFlow=vSample+vec2(.94,.34)*time*.3;
      float breakup=smoothstep(.28,.65,fbm(foamFlow*5.));
      float foam=clamp(surface.a*breakup*1.8*farDetail,0.,.95);
      color=mix(color,vec3(1.5,1.6,1.58),foam);
      color=mix(color,vec3(.53,.64,.70),1.-exp(-distanceToEye*.0015));
      // Exposure rolloff preserves glint detail; convert linear lighting to display.
      color=vec3(1.)-exp(-color*1.15);
      color=pow(color,vec3(.78));
      gl_FragColor=vec4(color,1.);
    }`,
    },
    {
      attributes: ["position"],
      samplers: ["displacementMap", "surfaceMap"],
      uniforms: [
        "worldViewProjection",
        "inverseViewProjection",
        "time",
        "cameraPosition",
        "sunDirection",
      ],
    },
  );
}

export function createSkyMaterial(scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial(
    "atmosphere",
    scene,
    {
      vertexSource: `precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 direction;
      void main(){ direction=position; gl_Position=worldViewProjection*vec4(position,1.); }`,
      fragmentSource: `precision highp float; varying vec3 direction; uniform vec3 sunDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 d=normalize(direction); float y=max(d.y,0.);
        vec3 color=mix(vec3(.69,.73,.76),vec3(.12,.31,.51),pow(y,.45));
        float sun=max(dot(d,sunDirection),0.);
        color+=vec3(1.,.55,.22)*pow(sun,32.)*.12;
        color=mix(color,vec3(1.,.91,.68),smoothstep(.99997,.999985,sun));
        vec2 p=d.xz/max(d.y+.13,.06)*2.;
        float clouds=noise(p*vec2(.7,2.3))*.45+noise(p*vec2(1.5,5.1))*.28+noise(p*vec2(3.2,10.9))*.17+noise(p*vec2(6.7,22.7))*.1;
        float cloud=smoothstep(.58,.83,clouds)*smoothstep(.02,.16,y)*(1.-smoothstep(.42,.8,y));
        color=mix(color,vec3(.96,.85,.71),cloud*.4);
        gl_FragColor=vec4(color,1.);
      }`,
    },
    {
      attributes: ["position"],
      uniforms: ["worldViewProjection", "sunDirection"],
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setVector3("sunDirection", sunDirection);
  return material;
}
