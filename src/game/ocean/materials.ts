import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { waves } from "./waves";

export const sunDirection = new Vector3(-0.65, 0.23, 0.9).normalize();
export function createOceanMaterial(scene: Scene): ShaderMaterial {
  const glsl = (value: number) => value.toFixed(4);
  const field = waves
    .map(
      (w) =>
        `h += (sin(dot(p, vec2(${glsl(w.x)}, ${glsl(w.z)})) * ${glsl(w.frequency)} + time * ${glsl(w.speed)}) + .16 * cos(2.0 * (dot(p, vec2(${glsl(w.x)}, ${glsl(w.z)})) * ${glsl(w.frequency)} + time * ${glsl(w.speed)}))) * ${glsl(w.amplitude)} * strength;`,
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
      uniform float time; uniform float strength; uniform vec3 cameraPosition; uniform vec3 sunDirection; uniform float innerCutout; uniform vec3 boatPosition;
      varying vec3 vPosition;
      float height(vec2 p) { float h=0.; ${field} return h; }
      void main() {
        vec2 p=vPosition.xz; if(innerCutout>0. && max(abs(p.x),abs(p.y))<innerCutout) discard;
        float e=max(.08,length(cameraPosition-vPosition)*.002);
        vec3 n=normalize(vec3(height(p-vec2(e,0.))-height(p+vec2(e,0.)),2.*e,height(p-vec2(0.,e))-height(p+vec2(0.,e))));
        vec3 view=normalize(cameraPosition-vPosition);
        // Fade subpixel ripple detail with distance to prevent horizon shimmer.
        float detail=exp(-length(cameraPosition-vPosition)*.018);
        n.x+=detail*.035*(sin(p.x*6.3+p.y*4.7+time*1.7)+.4*sin(p.y*15.7-p.x*9.1-time*2.3));
        n.z+=detail*.035*(sin(p.y*7.9-p.x*3.3-time*1.4)+.4*sin(p.x*17.1+p.y*11.3+time*2.1));n=normalize(n);
        float fresnel=.025+.975*pow(1.-max(dot(n,view),0.),5.);
        vec3 reflected=reflect(-view,n);
        vec3 sky=mix(vec3(.52,.62,.69),vec3(.19,.37,.53),pow(max(reflected.y,0.),.45));
        vec3 water=mix(vec3(.012,.068,.105),vec3(.025,.24,.27),clamp(.4+vPosition.y*.6,0.,1.));
        vec3 color=mix(water,sky,fresnel*.83);
        vec3 halfDirection=normalize(view+sunDirection);
        float glint=pow(max(dot(n,halfDirection),0.),420.);
        color+=vec3(1.,.82,.57)*glint*.65;
        float foamPattern=sin(p.x*2.31+sin(p.y*3.1))*sin(p.y*4.7-p.x*.73);
        float crest=smoothstep(.38,.61,vPosition.y/max(strength,.1))*smoothstep(.28,.8,foamPattern);
        color=mix(color,vec3(.65,.77,.76),crest*.42*exp(-length(cameraPosition-vPosition)*.009));
        vec2 relative=p-boatPosition.xz;
        vec2 local=mat2(cos(.55),-sin(.55),sin(.55),cos(.55))*relative;
        float rim=length(local/vec2(1.05,3.5));
        float contact=(1.-smoothstep(.025,.14,abs(rim-1.)))*smoothstep(-.4,.6,foamPattern);
        color=mix(color,vec3(.64,.76,.75),contact*.7);
        float fog=1.-exp(-length(cameraPosition-vPosition)*.0018);
        color=mix(color,vec3(.53,.64,.70),fog);
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
