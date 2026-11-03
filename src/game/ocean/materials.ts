import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { waves } from "./waves";

export const sunDirection = new Vector3(-0.65, 0.23, 0.9).normalize();

// Gerstner displacement moves vertices toward the crest, rather than just
// lifting a flat grid. Analytic tangents keep lighting aligned with geometry.
export function createOceanMaterial(scene: Scene): ShaderMaterial {
  const f = (n: number) => n.toFixed(5);
  const displacement = waves
    .map(
      (w) => `{
    vec2 d=normalize(vec2(${f(w.x)},${f(w.z)}));
    float k=${f(w.frequency)};
    float packetPhase=dot(vec2(-d.y,d.x),p)*${f(w.packet)}+time*.13+${f(w.phase)};
    float packetS=.5+.5*sin(packetPhase);
    float envelope=.3+.7*packetS*packetS;
    vec2 da=.7*packetS*cos(packetPhase)*vec2(-d.y,d.x)*${f(w.packet)}*${f(w.amplitude)}*strength;
    float a=${f(w.amplitude)}*strength*envelope;
    float phase=dot(d,p)*k+time*${f(w.speed)}+${f(w.phase)};
    float s=sin(phase), c=cos(phase), q=.65;
    displaced += vec3(d.x*q*a*c,a*s,d.y*q*a*c);
    tangent += vec3(-q*a*k*d.x*d.x*s,a*k*d.x*c,-q*a*k*d.x*d.y*s);
    binormal += vec3(-q*a*k*d.x*d.y*s,a*k*d.y*c,-q*a*k*d.y*d.y*s);
    tangent+=vec3(d.x*q*c,s,d.y*q*c)*da.x;
    binormal+=vec3(d.x*q*c,s,d.y*q*c)*da.y;
    compression += q*a*k*s;
  }`,
    )
    .join("\n");
  const sample = `vec3 displace(vec2 p,out vec3 normal,out float fold){
    vec3 displaced=vec3(p.x,0.,p.y);
    vec3 tangent=vec3(1.,0.,0.),binormal=vec3(0.,0.,1.);float compression=0.;
    ${displacement}
    normal=normalize(cross(binormal,tangent));fold=compression;return displaced;
  }`;
  return new ShaderMaterial(
    "ocean-surface",
    scene,
    {
      vertexSource: `precision highp float;
    attribute vec3 position; uniform mat4 worldViewProjection;
    uniform float time; uniform float strength;
    varying vec3 vPosition; varying vec2 vSample;
    ${sample}
    void main(){
      vec3 normal;float fold;
      vec3 displaced=displace(position.xz,normal,fold);
      vPosition=displaced;vSample=position.xz;
      gl_Position=worldViewProjection*vec4(displaced,1.);
    }`,
      fragmentSource: `precision highp float;
    uniform float time,strength,innerCutout;
    uniform vec3 cameraPosition,sunDirection,boatPosition;
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
      h+=.03*octave(p*4.7-drift*2.7);

      return h;
    }
    vec3 skyColor(vec3 r){float y=max(r.y,0.);
      vec3 sky=mix(vec3(.58,.67,.74),vec3(.19,.36,.55),pow(y,.45));
      float cloud=pow(fbm(r.xz/max(.15,r.y)*2.),3.)*.5;
      return mix(sky,vec3(.88,.84,.75),cloud);
    }
    void main(){
      vec2 p=vPosition.xz;
      if(innerCutout>0. && max(abs(p.x),abs(p.y))<innerCutout)discard;
      float distanceToEye=length(cameraPosition-vPosition);
      vec3 view=normalize(cameraPosition-vPosition);
      float e=max(.025,distanceToEye*.0015);
      float h=wavelets(p);
      vec2 slope=vec2(wavelets(p+vec2(e,0.))-h,wavelets(p+vec2(0.,e))-h)/e;
      float detail=exp(-distanceToEye*.018);
      vec3 macroNormal;float compression;vec3 ignored=displace(vSample,macroNormal,compression);
      vec3 n=normalize(macroNormal+vec3(-slope.x,0.,-slope.y)*.34*detail*strength);
      float nv=max(dot(n,view),.001);
      float fresnel=.02+.98*pow(1.-nv,5.);
      vec3 reflection=skyColor(reflect(-view,n));
      float scatter=pow(max(dot(view,-sunDirection),0.),3.)*max(vPosition.y+.35,0.);
      vec3 deep=vec3(.009,.055,.085);
      vec3 turquoise=vec3(.015,.23,.25);
      vec3 water=mix(deep,turquoise,clamp(.18+vPosition.y*.35+scatter*.5,0.,.8));
      vec3 color=mix(water,reflection,fresnel);
      // Broad rough specular lobe is modulated by real surface detail, not stripes.
      vec3 halfVector=normalize(view+sunDirection);
      float nh=max(dot(n,halfVector),0.);
      float rough=.14;float a2=rough*rough;
      float denominator=nh*nh*(a2-1.)+1.;
      float spec=a2/(3.14159*denominator*denominator);
      color+=vec3(1.,.79,.48)*min(spec*.018,1.1)*max(dot(n,sunDirection),0.);
      float foamNoise=fbm(p*3.7+vec2(time*.09,-time*.06));
      float peaks=smoothstep(.12,.27,compression)*smoothstep(.43,.7,foamNoise);
      float bubbles=smoothstep(.43,.64,noise(p*21.))*detail;
      float foam=peaks*(.35+.65*bubbles);
      // Broken patches of aerated water near the hull, rather than a solid ring.
      vec2 local=mat2(cos(.55),-sin(.55),sin(.55),cos(.55))*(p-boatPosition.xz);
      float rim=length(local/vec2(1.02,3.5));
      foam+= (1.-smoothstep(.04,.21,abs(rim-1.)))*smoothstep(.42,.7,foamNoise)*.65;
      color=mix(color,vec3(.70,.79,.78),clamp(foam,0.,.85));
      color=mix(color,vec3(.53,.64,.70),1.-exp(-distanceToEye*.0015));
      // Exposure rolloff preserves glint detail; convert linear lighting to display.
      color=vec3(1.)-exp(-color*1.15);
      color=pow(color,vec3(.78));
      gl_FragColor=vec4(color,1.);
    }`,
    },
    {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        "time",
        "strength",
        "cameraPosition",
        "sunDirection",
        "innerCutout",
        "boatPosition",
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
        vec3 color=mix(vec3(.73,.76,.77),vec3(.20,.39,.60),pow(y,.45));
        float sun=max(dot(d,sunDirection),0.);
        color+=vec3(1.,.55,.22)*pow(sun,24.)*.16;
        color=mix(color,vec3(1.,.91,.68),smoothstep(.9991,.99965,sun));
        vec2 p=d.xz/max(d.y+.13,.06)*2.;
        float clouds=noise(p*1.8)*.55+noise(p*4.)*.3+noise(p*9.)*.15;
        float cloud=smoothstep(.57,.77,clouds)*smoothstep(.02,.16,y)*(1.-smoothstep(.42,.8,y));
        color=mix(color,vec3(.96,.85,.71),cloud*.65);
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
