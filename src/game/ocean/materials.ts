import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { waves } from "./waves";

export const sunDirection = new Vector3(-0.38, 0.09, 0.9).normalize();
export function createOceanMaterial(scene: Scene): ShaderMaterial {
  const glsl = (value: number) => value.toFixed(4);
  const field = waves
    .map(
      (w) =>
        `h += sin(dot(p, vec2(${glsl(w.x)}, ${glsl(w.z)})) * ${glsl(w.frequency)} + time * ${glsl(w.speed)}) * ${glsl(w.amplitude)} * strength;`,
    )
    .join("\n");
  return new ShaderMaterial(
    "ocean-surface",
    scene,
    {
      vertexSource: `precision highp float;
      attribute vec3 position; uniform mat4 worldViewProjection; uniform float time; uniform float strength;
      varying vec3 vPosition;
      float height(vec2 p) { float h=0.; ${field} return h; }
      void main() { vec3 p=position; p.y=height(p.xz); vPosition=p; gl_Position=worldViewProjection*vec4(p,1.); }`,
      fragmentSource: `precision highp float;
      uniform float time; uniform float strength; uniform vec3 cameraPosition; uniform vec3 sunDirection; uniform float innerCutout;
      varying vec3 vPosition;
      float height(vec2 p) { float h=0.; ${field} return h; }
      void main() {
        vec2 p=vPosition.xz; if(innerCutout>0. && max(abs(p.x),abs(p.y))<innerCutout) discard;
        float e=.08;
        vec3 n=normalize(vec3(height(p-vec2(e,0.))-height(p+vec2(e,0.)),2.*e,height(p-vec2(0.,e))-height(p+vec2(0.,e))));
        // Small moving ripples add detail without increasing geometry density.
        n.x += .035*sin(p.x*8.+p.y*5.+time*2.);
        n.z += .025*sin(p.y*11.-time*2.4); n=normalize(n);
        vec3 view=normalize(cameraPosition-vPosition);
        float fresnel=pow(1.-max(dot(n,view),0.),3.);
        vec3 water=mix(vec3(.015,.19,.24),vec3(.08,.43,.46),clamp(.45+vPosition.y*.45,0.,1.));
        vec3 sky=mix(vec3(.48,.69,.72),vec3(.96,.72,.47),pow(max(dot(normalize(vec3(-view.x,.1,-view.z)),sunDirection),0.),8.));
        vec3 color=mix(water,sky,fresnel*.8);
        vec3 halfDirection=normalize(view+sunDirection);
        float glint=pow(max(dot(n,halfDirection),0.),180.);
        float broad=pow(max(dot(n,halfDirection),0.),18.);
        color+=vec3(1.,.78,.43)*(glint*2.3+broad*.17);
        float crest=smoothstep(.48,.66,vPosition.y)*(.5+.5*sin(p.x*13.+p.y*7.));
        color=mix(color,vec3(.67,.88,.85),crest*.16);
        float fog=1.-exp(-length(cameraPosition-vPosition)*.0028);
        color=mix(color,vec3(.65,.74,.73),fog);
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
        vec3 color=mix(vec3(.90,.76,.59),vec3(.18,.42,.58),pow(y,.45));
        float sun=max(dot(d,sunDirection),0.);
        color+=vec3(1.,.55,.22)*pow(sun,12.)*.3;
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
