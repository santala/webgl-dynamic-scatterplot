'use strict'

// language=glsl
const vertexShaderSource = `
    precision mediump float;
    precision mediump int;
    
    attribute vec3 a_position;
    
    uniform float u_maxPosition;
    uniform vec2 u_resolution;
    uniform float u_pointSize;
    
    varying float v_pointCount;

    void main() {
        // Add padding accoring to point size
        vec2 relPointSize = u_pointSize / u_resolution;
        vec2 normalizedPositionWithPadding = (a_position.xy / u_maxPosition * 2.0 - 1.) * (1.-relPointSize);
        
        gl_Position = vec4(normalizedPositionWithPadding, 0, 1);
        gl_PointSize = u_pointSize;
        v_pointCount = a_position.z;
    }
`;

// language=glsl
const fragmentShaderSource = `    
    precision mediump float;
    precision mediump int;

    /* Built-in inputs
    in vec4 gl_FragCoord;
    in bool gl_FrontFacing;
    in vec2 gl_PointCoord;
    */

    uniform sampler2D u_marker;
    
    uniform float u_alpha;
    uniform float u_pointSize;

    // Overlap passed in from the vertex shader
    varying float v_pointCount;
    
    void main() {

        //gl_FragColor = vec4(1, 0, 0, 1);
        //return;
        float opacity;

        if (sqrt(pow(gl_PointCoord.x - .5, 2.) + pow(gl_PointCoord.y - .5, 2.)) > .5) {
            opacity = 0.;
        } else {
            if (v_pointCount == 0.) {
                opacity = 0.;
            } else {
                opacity = 1. - pow(1. - u_alpha, v_pointCount);
            }
        }
        
        gl_FragColor = vec4(1, 0, 0, 1) * opacity;
    }
`;


function compileShader(gl, shaderType, source) {
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const lastError = gl.getShaderInfoLog(shader);
        console.error('*** Error compiling shader \'' + shader + '\':' + lastError);
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}


function createProgram(gl, shaders) {
    const program = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(program, shader));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        // something went wrong with the link
        const lastError = gl.getProgramInfoLog(program);
        console.error('Error in program linking:' + lastError);

        gl.deleteProgram(program);
        return null;
    }
    return program;
}


function renderScatterplot(dataUint16) {
    const canvas = document.getElementById('canvas');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const gl = canvas.getContext('webgl');
    if (!gl) {
        return;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = createProgram(gl, [vertexShader, fragmentShader]);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const maxPositionLocation = gl.getUniformLocation(program, "u_maxPosition");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const pointSizeLocation = gl.getUniformLocation(program, "u_pointSize");
    const alphaLocation = gl.getUniformLocation(program, "u_alpha");

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dataUint16, gl.DYNAMIC_DRAW);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // For data textures where row width is not a multipel of 4


    // Clear the canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Turn on the position attribute
    gl.enableVertexAttribArray(positionLocation);

    // Bind the position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    gl.vertexAttribPointer(positionLocation, 3, gl.UNSIGNED_SHORT, false, 0, 0);

    gl.uniform1f(pointSizeLocation, 50);
    gl.uniform1f(alphaLocation, .5);
    gl.uniform1f(maxPositionLocation, Math.pow(2, 16) - 1);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.POINTS, 0, dataUint16.length / 3);
}


(() => {

    fetch("./example-data/out5d.csv").then(res => res.text()).then(csv => {
        const lines = csv.split("\n");

        const data = [];

        let xMin = Number.MAX_VALUE,
            xMax = Number.MIN_VALUE,
            yMin = Number.MAX_VALUE,
            yMax = Number.MIN_VALUE;

        for (let i = 0; i < lines.length; i++) {
            const [xStr, yStr, ...rest] = lines[i].split(",");
            if (isNaN(xStr) || isNaN(yStr)) {
                continue;
            }
            const x = parseFloat(xStr);
            const y = parseFloat(yStr);
            data.push([x, y]);
            xMin = Math.min(xMin, x);
            xMax = Math.max(xMax, x);
            yMin = Math.min(yMin, y);
            yMax = Math.max(yMax, y);
        }

        const xRange = xMax - xMin;
        const yRange = yMax - yMin;

        const maxVal = Math.pow(2, 16) - 1;


        for (let i = 0; i < data.length; i++) {
            data[i][0] = Math.round((data[i][0] - xMin) / xRange * maxVal);
            data[i][1] = Math.round((data[i][1] - yMin) / yRange * maxVal);
            data[i].push(1); // Overlap
        }

        const dataUint16 = new Uint16Array(data.flat());

        console.log(data.length, dataUint16.length / 3);

        renderScatterplot(dataUint16);
    });

})();
