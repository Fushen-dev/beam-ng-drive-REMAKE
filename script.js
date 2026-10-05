const c = document.getElementById('game');
const gl = c.getContext('webgl', {antialias:true});

let steer = 0;
let throttle = 0;
let brake = 0;
let speed = 0;
let dist = 0;
let inc = 0;
let lights = false;
let police = false;
let hand = false;
let gear = 1;
let rpm = 900;
let engine = 100;
let body = 100;
let camMode = 'CHASE';
let last = performance.now();

const vs = `
attribute vec3 p;
attribute vec3 n;

uniform mat4 mvp;
uniform mat4 model;

varying vec3 vn;
varying vec3 wp;

void main(){
    vec4 w = model * vec4(p,1.0);
    wp = w.xyz;
    vn = mat3(model) * n;
    gl_Position = mvp * w;
}
`;

const fs = `
precision mediump float;

uniform vec3 color;
uniform vec3 light;
uniform float emissive;
uniform vec3 fog;

varying vec3 vn;
varying vec3 wp;

void main(){
    float d = max(
        dot(
            normalize(vn),
            normalize(light)
        ),
        0.0
    );

    vec3 c =
        color * (.25 + .75*d)
        + color * emissive;

    float f =
        clamp(
            length(wp) * .002,
            0.0,
            .55
        );

    gl_FragColor =
        vec4(
            mix(c,fog,f),
            1.0
        );
}
`;

function shader(type, src){

    const s = gl.createShader(type);

    gl.shaderSource(s, src);
    gl.compileShader(s);

    return s;
}

const prog = gl.createProgram();

gl.attachShader(
    prog,
    shader(gl.VERTEX_SHADER, vs)
);

gl.attachShader(
    prog,
    shader(gl.FRAGMENT_SHADER, fs)
);

gl.linkProgram(prog);

gl.useProgram(prog);

const P =
    gl.getAttribLocation(prog,'p');

const N =
    gl.getAttribLocation(prog,'n');

const M =
    gl.getUniformLocation(prog,'mvp');

const MD =
    gl.getUniformLocation(prog,'model');

const COL =
    gl.getUniformLocation(prog,'color');

const L =
    gl.getUniformLocation(prog,'light');

const E =
    gl.getUniformLocation(prog,'emissive');

const FOG =
    gl.getUniformLocation(prog,'fog');

const cube = [

[-1,-1,-1,0,0,-1],
[1,-1,-1,0,0,-1],
[1,1,-1,0,0,-1],
[-1,1,-1,0,0,-1],

[-1,-1,1,0,0,1],
[1,-1,1,0,0,1],
[1,1,1,0,0,1],
[-1,1,1,0,0,1],

[-1,-1,-1,-1,0,0],
[-1,1,-1,-1,0,0],
[-1,1,1,-1,0,0],
[-1,-1,1,-1,0,0],

[1,-1,-1,1,0,0],
[1,1,-1,1,0,0],
[1,1,1,1,0,0],
[1,-1,1,1,0,0],

[-1,-1,-1,0,-1,0],
[1,-1,-1,0,-1,0],
[1,-1,1,0,-1,0],
[-1,-1,1,0,-1,0],

[-1,1,-1,0,1,0],
[1,1,-1,0,1,0],
[1,1,1,0,1,0],
[-1,1,1,0,1,0]

];

const inds = [

0,1,2,
0,2,3,

4,6,5,
4,7,6,

8,9,10,
8,10,11,

12,14,13,
12,15,14,

16,17,18,
16,18,19,

20,22,21,
20,23,22

];

const vb = gl.createBuffer();

gl.bindBuffer(
    gl.ARRAY_BUFFER,
    vb
);

gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(cube.flat()),
    gl.STATIC_DRAW
);

const ib = gl.createBuffer();

gl.bindBuffer(
    gl.ELEMENT_ARRAY_BUFFER,
    ib
);

gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(inds),
    gl.STATIC_DRAW
);

gl.enableVertexAttribArray(P);

gl.vertexAttribPointer(
    P,
    3,
    gl.FLOAT,
    false,
    24,
    0
);

gl.enableVertexAttribArray(N);

gl.vertexAttribPointer(
    N,
    3,
    gl.FLOAT,
    false,
    24,
    12
);

function ident(){

    return new Float32Array([
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        0,0,0,1
    ]);

}

function mm(a,b){

    let r = new Float32Array(16);

    for(let i=0;i<4;i++){

        for(let j=0;j<4;j++){

            r[i*4+j] =
                a[i*4] * b[j] +
                a[i*4+1] * b[4+j] +
                a[i*4+2] * b[8+j] +
                a[i*4+3] * b[12+j];

        }

    }

    return r;

}

function tr(x,y,z){

    let m = ident();

    m[12] = x;
    m[13] = y;
    m[14] = z;

    return m;

}

function sc(x,y,z){

    let m = ident();

    m[0] = x;
    m[5] = y;
    m[10] = z;

    return m;

}

function ry(a){

    let c = Math.cos(a);
    let s = Math.sin(a);

    return new Float32Array([
        c,0,-s,0,
        0,1,0,0,
        s,0,c,0,
        0,0,0,1
    ]);

}

function persp(f,a,n,fz){

    let q = 1 / Math.tan(f/2);

    let m = new Float32Array(16);

    m[0] = q/a;
    m[5] = q;
    m[10] = (fz+n)/(n-fz);
    m[11] = -1;
    m[14] = 2*fz*n/(n-fz);

    return m;

}

function resize(){

    c.width =
        c.clientWidth *
        devicePixelRatio;

    c.height =
        c.clientHeight *
        devicePixelRatio;

    gl.viewport(
        0,
        0,
        c.width,
        c.height
    );

}

addEventListener(
    'resize',
    resize
);

resize();

gl.enable(gl.DEPTH_TEST);

function box(
    x,
    y,
    z,
    sx,
    sy,
    sz,
    col,
    rot=0,
    em=0
){

    let model =
        mm(
            tr(x,y,z),
            mm(
                ry(rot),
                sc(sx,sy,sz)
            )
        );

    gl.uniformMatrix4fv(
        MD,
        false,
        model
    );

    gl.uniform3fv(
        COL,
        col
    );

    gl.uniform1f(
        E,
        em
    );

    gl.drawElements(
        gl.TRIANGLES,
        36,
        gl.UNSIGNED_SHORT,
        0
    );

}

function car(
    x,
    z,
    s,
    col,
    rot=0,
    pol=false
){

    box(
        x,
        1.05,
        z,
        .95*s,
        .28*s,
        2.05*s,
        col,
        rot
    );

    box(
        x,
        1.43*s,
        z-.15*s,
        .72*s,
        .3*s,
        .95*s,
        [.035,.08,.11],
        rot
    );

    for(
        const dx of [-.72,.72]
    ){

        for(
            const dz of [-1.25,1.25]
        ){

            box(
                x + dx*s,
                .58,
                z + dz*s,
                .18*s,
                .25*s,
                .38*s,
                [.025,.025,.028],
                rot
            );

        }

    }

    if(lights || pol){

        box(
            x-.58*s,
            1.12,
            z-2.07*s,
            .13*s,
            .08*s,
            .06*s,
            [1,.8,.3],
            rot,
            lights ? 1.5 : 0
        );

        box(
            x+.58*s,
            1.12,
            z-2.07*s,
            .13*s,
            .08*s,
            .06*s,
            [1,.8,.3],
            rot,
            lights ? 1.5 : 0
        );

    }

    if(pol){

        box(
            x-.3*s,
            1.75*s,
            z,
            .3*s,
            .08*s,
            .08*s,
            [0,.55,1],
            rot,
            1
        );

        box(
            x+.3*s,
            1.75*s,
            z,
            .3*s,
            .08*s,
            .08*s,
            [1,.05,.08],
            rot,
            1
        );

    }

}

const cars =
    Array.from(
        {length:12},
        (_,i)=>({

            lane:i%3-1,

            z:(i+1)*70,

            v:10+(i%5)*4,

            col:[
                [.75,.12,.08],
                [.75,.75,.75],
                [.8,.5,.08],
                [.25,.55,.75]
            ][i%4]

        })
    );

function frame(now){

    let dt =
        Math.min(
            .035,
            (now-last)/1000
        );

    last = now;

    const weather =
        document.getElementById(
            'weather'
        ).value;

    const t =
        +document.getElementById(
            'time'
        ).value;

    const night =
        t < 6 ||
        t > 19;

    const wet =
        ['Rain','Storm','Snow']
        .includes(weather);

    const grip =
        wet ? .68 : 1;

    speed =
        Math.max(
            0,
            Math.min(
                155,
                speed +
                throttle*42*dt*grip -
                brake*70*dt -
                .08*speed*dt
            )
        );

    if(hand){

        speed =
            Math.max(
                0,
                speed-18*dt
            );

    }

    steer *=
        Math.pow(.08,dt);

    rpm =
        900 + speed*45;

    gear =
        Math.max(
            1,
            Math.min(
                6,
                Math.floor(speed/22)+1
            )
        );

    if(rpm > 6500){

        engine =
            Math.max(
                0,
                engine-10*dt
            );

    }

    if(throttle && brake){

        engine =
            Math.max(
                0,
                engine-2*dt
            );

        inc++;

    }

    if(
        speed > 105 &&
        Math.abs(steer) > .7
    ){

        body =
            Math.max(
                0,
                body-2*dt
            );

        document.getElementById(
            'susp'
        ).textContent =
            'STRAINED';

        document.getElementById(
            'susp'
        ).className =
            'warning';

    }

    dist +=
        speed*dt/3600;

    cars.forEach(v=>{

        v.z +=
            v.v*dt -
            speed*dt*.25;

        if(v.z > 650){

            v.z = -650;

        }

    });

    const day =
        night
        ? [.018,.035,.06]
        : weather === 'Snow'
        ? [.48,.56,.6]
        : weather === 'Storm'
        ? [.08,.11,.14]
        : [.28,.48,.3];

    gl.clearColor(
        ...day,
        1
    );

    gl.clear(
        gl.COLOR_BUFFER_BIT |
        gl.DEPTH_BUFFER_BIT
    );

    const proj =
        persp(
            Math.PI/3,
            c.width/c.height,
            .1,
            1600
        );

    const view =
        mm(
            tr(
                -(camMode === 'HOOD'
                    ? steer*.35
                    : steer*1.8
                ),
                -3.2,
                11
            ),
            ry(
                -steer*.045
            )
        );

    gl.uniformMatrix4fv(
        M,
        false,
        mm(proj,view)
    );

    gl.uniform3fv(
        L,
        [.4,.9,.6]
    );

    gl.uniform3fv(
        FOG,
        day
    );

    box(
        0,
        -.3,
        180,
        80,
        .3,
        800,
        [.18,.19,.2]
    );

    for(
        let x=-7.5;
        x<=7.5;
        x+=5
    ){

        box(
            x,
            -.02,
            180,
            1,
            .02,
            800,
            [.65,.65,.58]
        );

    }

    for(
        let z=-700;
        z<800;
        z+=22
    ){

        box(
            0,
            .03,
            z,
            .09,
            .025,
            7,
            [.9,.82,.35]
        );

    }

    for(
        let i=-8;
        i<=8;
        i+=4
    ){

        box(
            i*5,
            -.2,
            160,
            3,
            1,
            800,
            [.08,.24,.1]
        );

    }

    cars.forEach(v=>{

        car(
            v.lane*4.5 +
            steer*(v.z*.002),

            v.z,

            .75,

            v.col
        );

    });

    car(
        steer*1.8,
        -2.5,
        1,
        [.08,.45,.72],
        steer*.08,
        police
    );

    document.getElementById(
        'speed'
    ).textContent =
        Math.round(speed);

    document.getElementById(
        'gear'
    ).textContent =
        'D'+gear;

    document.getElementById(
        'rpm'
    ).textContent =
        Math.round(rpm)
        .toLocaleString() +
        ' RPM';

    document.getElementById(
        'dist'
    ).textContent =
        dist.toFixed(1) +
        ' mi';

    document.getElementById(
        'inc'
    ).textContent =
        inc;

    document.getElementById(
        'engine'
    ).textContent =
        Math.round(engine) +
        '%';

    document.getElementById(
        'body'
    ).textContent =
        Math.round(body) +
        '%';

    document.getElementById(
        'bodybar'
    ).style.width =
        body+'%';

    requestAnimationFrame(frame);

}

requestAnimationFrame(frame);

addEventListener(
    'keydown',
    e=>{

        const k =
            e.key.toLowerCase();

        if(
            k === 'w' ||
            e.key === 'arrowup'
        )
            throttle=1;

        if(
            k === 's' ||
            e.key === 'arrowdown'
        )
            brake=1;

        if(e.code === 'Space')
            hand=true;

        if(
            k === 'a' ||
            e.key === 'arrowleft'
        )
            steer=-1;

        if(
            k === 'd' ||
            e.key === 'arrowright'
        )
            steer=1;

        if(k === 'l')
            lights=!lights;

        if(k === 'p')
            police=!police;

        if(k === 'r'){

            speed=0;
            body=100;
            engine=100;
            inc=0;

        }

    }
);

addEventListener(
    'keyup',
    e=>{

        const k =
            e.key.toLowerCase();

        if(
            k === 'w' ||
            e.key === 'arrowup'
        )
            throttle=0;

        if(
            k === 's' ||
            e.key === 'arrowdown'
        )
            brake=0;

        if(e.code === 'Space')
            hand=false;

        if(
            k === 'a' ||
            k === 'd' ||
            e.key === 'arrowleft' ||
            e.key === 'arrowright'
        )
            steer=0;

    }
);

document
.querySelectorAll('.toggle')
.forEach(b=>{

    b.onclick=()=>{

        b.classList.toggle('active');

        b.textContent =
            b.classList.contains('active')
            ? 'ON'
            : 'OFF';

    };

});

document.getElementById(
    'weather'
).onchange=()=>{

    document.getElementById(
        'modeLabel'
    ).textContent =
        'DRIVE • ' +
        document.getElementById(
            'map'
        ).value.toUpperCase();

};

document.getElementById(
    'map'
).onchange=()=>{

    document.getElementById(
        'modeLabel'
    ).textContent =
        'DRIVE • ' +
        document.getElementById(
            'map'
        ).value.toUpperCase();

};

document.getElementById(
    'time'
).oninput=e=>{

    document.getElementById(
        'timev'
    ).textContent =
        String(
            e.target.value
        ).padStart(2,'0') +
        ':00';

};

document.getElementById(
    'traffic'
).oninput=e=>{

    document.getElementById(
        'trafficv'
    ).textContent =
        e.target.value +
        '%';

};

document.getElementById(
    'lights'
).onclick=()=>{

    lights=!lights;

};

document.getElementById(
    'police'
).onclick=()=>{

    police=!police;

};

document.getElementById(
    'cam'
).onclick=e=>{

    camMode =
        camMode === 'CHASE'
        ? 'HOOD'
        : 'CHASE';

    e.target.textContent =
        camMode;

};

document
.querySelectorAll('nav button')
.forEach(b=>{

    b.onclick=()=>{

        document
        .querySelectorAll('nav button')
        .forEach(x=>
            x.classList.remove('active')
        );

        b.classList.add('active');

        document.getElementById(
            'modeLabel'
        ).textContent =
            b.dataset.mode.toUpperCase() +
            ' • ' +
            document.getElementById(
                'map'
            ).value.toUpperCase();

    };

});
