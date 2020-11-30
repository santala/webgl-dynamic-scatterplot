"use strict";

import * as glUtil from './gl-util.js';

// language=glsl
const webGL1VertexShaderSource = `
    precision mediump float;
    precision mediump int;

    attribute vec3 a_position;

    uniform float u_maxPosition;
    uniform vec2 u_resolution;
    uniform float u_pointSize;
    uniform float u_lookupTexWidth;
    uniform float u_alpha;

    varying float v_pointCount;
    varying vec2 v_lookupTexCoord;

    void main() {
        // Add padding according to point size
        vec2 relPointSize = u_pointSize / u_resolution;
        vec2 normalizedPositionWithPadding = (a_position.xy / u_maxPosition * 2.0 - 1.) * (1. - relPointSize);

        gl_Position = vec4(normalizedPositionWithPadding, 0, 1);
        gl_PointSize = u_pointSize;
        v_pointCount = a_position.z;
        v_lookupTexCoord = vec2((v_pointCount + .5) / (u_lookupTexWidth - 1.), u_alpha); // compute alpha lookup texture coordinate
    }
`;

// language=glsl
const webGL1FragmentShaderSource = `
    precision mediump float;
    precision mediump int;

    /* Built-in inputs
    in vec4 gl_FragCoord;
    in bool gl_FrontFacing;
    in vec2 gl_PointCoord;
    */

    uniform sampler2D u_lookupTable;

    uniform vec3 u_color;
    uniform float u_alpha;
    uniform float u_lookupTexWidth;
    uniform float u_pointSize;

    // Overlap passed in from the vertex shader
    varying float v_pointCount;
    varying vec2 v_lookupTexCoord;

    void main() {
        if (v_pointCount == 0.) {
            discard;
        } else if (distance(gl_PointCoord, vec2(.5)) > 0.5) {
            discard;
        } else {
            float opacity = texture2D(u_lookupTable, v_lookupTexCoord).a;
            gl_FragColor = vec4(u_color * opacity, opacity);
        }
    }
`;

// language=glsl
const webGL2VertexShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    in vec3 a_position;

    uniform float u_maxPosition;
    uniform vec2 u_resolution;
    uniform float u_pointSize;
    uniform float u_lookupTexWidth;
    uniform float u_alpha;

    uniform int u_phase;

    out float v_pointCount;
    out vec2 v_coord;

    void main() {
        if (u_phase == 0) {
            // Add padding according to point size
            vec2 relPointSize = u_pointSize / u_resolution;
            vec2 normalizedPositionWithPadding = (a_position.xy / u_maxPosition * 2.0 - 1.) * (1. - relPointSize);
            gl_Position = vec4(normalizedPositionWithPadding, 0, 1);
            gl_PointSize = u_pointSize;
            v_pointCount = a_position.z;
        } else {
            gl_Position = vec4(a_position.xy, 0, 1);
            v_coord = (a_position.xy + vec2(1.)) / 2.;
        }
    }
`;

// language=glsl
const webGL2FragmentShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    /* Built-in inputs
    in vec4 gl_FragCoord;
    in bool gl_FrontFacing;
    in vec2 gl_PointCoord;
    */

    const float maxOverlap = 1000000.;

    uniform sampler2D u_lookupTable;
    uniform sampler2D u_markerOverlap;

    uniform int u_phase;

    uniform vec3 u_color;
    uniform float u_alpha;
    uniform float u_lookupTexWidth;
    uniform float u_pointSize;

    // Overlap passed in from the vertex shader
    in float v_pointCount;
    in vec2 v_coord;

    layout(location = 0) out vec4 outputColor;
    layout(location = 1) out float overlap;

    void main() {
        if (u_phase == 0) {
            if (v_pointCount == 0.) {
                discard;
            } else if (distance(gl_PointCoord, vec2(.5)) > 0.5) {
                discard;
            } else {
                overlap = v_pointCount / maxOverlap;
            }
        } else {
            float pointCount = round(texture(u_markerOverlap, v_coord.xy).r * maxOverlap);
            //float pointCount = float(texture(u_markerOverlap, vec2(.0)).a);
            if (pointCount == 0.) {
                discard;
            } else {
                // Compute alpha lookup texture coordinate
                //vec2 lookupTexCoord = vec2((float(pointCount) + .5) / (u_lookupTexWidth - 1.), u_alpha);
                //float opacity = texture(u_lookupTable, lookupTexCoord).a;
                float opacity = 1. - pow(1. - u_alpha, pointCount);
                outputColor = vec4(u_color * opacity, opacity);
            }
        }
    }
`;

function computeLookupData(gl) {
    const alphaResolution = 1000;

    const maxTextureSize = Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const height = Math.min(maxTextureSize, alphaResolution);
    let width = Math.min(maxTextureSize, 2**16 - 1);

    const lookupTable = new Array(height);

    let maxRowWidth = 0;

    for (let row = 0; row < height; row++) {
        lookupTable[row] = [0];
        const alpha = row / (height - 1);
        const transparency =  1 - alpha;
        let accumulatedTransparency = 1;
        for (let col = 1; col < width; col++) {
            accumulatedTransparency *= transparency;
            const opacity = Math.round(255 - 255 * accumulatedTransparency);
            lookupTable[row][col] = opacity;
            if (opacity === 255) {
                // Full opacity reached
                maxRowWidth = Math.max(maxRowWidth, col);
                break;
            }
        }
    }

    const data = new Uint8Array(maxRowWidth * height);

    for (let row = 0, i = 0; row < height; row++) {
        for (let col = 0; col < maxRowWidth; col++, i++) {
            if (col < lookupTable[row].length) {
                data[i] = lookupTable[row][col];
            } else {
                data[i] = 255;
            }
        }
    }

    width = maxRowWidth;

    return { data, width, height };
}

export default class Scatterplot {
    constructor({ canvas, maxWidth = 1000, maxHeight = 1000 }) {
        this.canvas = canvas || document.createElement("canvas");
        this.maxWidth = maxWidth;
        this.maxHeight = maxHeight;

        this.canvas.addEventListener("webglcontextlost", e => {
            console.log("WebGL context lost.", canvas.getNumCalls());
            e.preventDefault();  // Allows the context to be restored
        });
        canvas.addEventListener("webglcontextrestored", (e) => {
            console.log("WebGL context restored.");
            //canvas.loseContextInNCalls(Math.round(Math.random() * 1000));
            this.setup();
        });

        this.gl = this.canvas.getContext("webgl2");
        this.useWebGL2 = !!this.gl;
        // If WebGL 2.0 isn’t supported, use WebGL 1.0
        this.gl = this.gl || this.canvas.getContext("webgl");

        console.log(`Using WebGL ${this.useWebGL2 ? 2 : 1}.0.`);

        this.width = canvas.width;
        this.height = canvas.height;
        this.pointSize = 3;
        this.color = [0, 0, 0];
        this.alpha = .5;

        this.pointsUint16 = new Uint16Array();

        this.loadData = (url) => {
            const points = [];
            const groupOffsets = [];

            return fetch(url).then(res => res.text()).then(csv => {
                console.log('Parsing CSV...');

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

                const maxVal = 2**16 - 1;

                console.time('Preparing data');

                for (let i = 0; i < data.length; i++) {
                    const [x, y] = data[i];
                    const xNorm = (x - xMin) / xRange;
                    const yNorm = (y - yMin) / yRange;
                    const xScaled = xNorm * maxVal;
                    const yScaled = yNorm * maxVal;

                    const groupRow = ~~(xNorm * this.maxHeight); // cast to int
                    const groupCol = ~~(yNorm * this.maxWidth);
                    const groupIdx = groupRow * this.maxWidth + groupCol;

                    const groupOffset = groupOffsets[groupIdx];
                    if (!!groupOffset) {
                        points[groupOffset] += xScaled;
                        points[groupOffset + 1] += yScaled;
                        points[groupOffset + 2]++;
                    } else {
                        groupOffsets[groupIdx] = points.length;
                        points[points.length] = xScaled;
                        points[points.length] = yScaled;
                        points[points.length] = 1;
                    }
                }

                for (let i = 0; i < points.length; i += 3) {
                    const n = points[i + 2];
                    points[i] /= n;
                    points[i + 1] /= n;
                }

                console.timeEnd('Preparing data');

                this.pointsUint16 = new Uint16Array(points);

                this.setup();
            });
        };

        this.updateDesign = ({ width, height, pointSize, color, alpha}) => {
            width = width || this.width;
            height = height || this.height;
            pointSize = pointSize || this.pointSize;
            color = color || this.color;
            alpha = alpha || this.alpha;

            if (width !== this.width || height !== this.height ||
                pointSize !== this.pointSize || color !== this.color || alpha !== this.alpha
            ) {
                this.width = width;
                this.height = height;
                this.pointSize = pointSize;
                this.color = color;
                this.alpha = alpha;

                this.canvas.width = this.width;
                this.canvas.height = this.height;

                this.render();
            }
        };

        this.setup = () => {
            const gl = this.gl;
            const ext = gl.getExtension('EXT_color_buffer_float');

            const vertexShaderSource = this.useWebGL2 ? webGL2VertexShaderSource : webGL1VertexShaderSource;
            const vertexShader = glUtil.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);

            const fragmentShaderSource = this.useWebGL2 ? webGL2FragmentShaderSource : webGL1FragmentShaderSource;
            const fragmentShader = glUtil.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

            this.program = glUtil.createProgram(gl, [vertexShader, fragmentShader]);

            this.attributes = glUtil.getAttributeLocations(gl, this.program);
            this.uniforms = glUtil.getUniforms(gl, this.program);

            gl.useProgram(this.program);

            this.alphaLookupTable = computeLookupData(gl);

            // Turn on the position attribute
            gl.enableVertexAttribArray(this.attributes.position);

            this.positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.pointsUint16, gl.DYNAMIC_DRAW);
            // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
            gl.vertexAttribPointer(this.attributes.position, 3, gl.UNSIGNED_SHORT, false, 0, 0);

            // For data textures where row width is not a multiple of 4
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

            /*
            this.lookupTableTexture = glUtil.createTexture({
                gl, ...this.alphaLookupTable, type: gl.UNSIGNED_BYTE, format: gl.ALPHA
            });
            */
            this.lookupTableTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + 0);
            gl.bindTexture(gl.TEXTURE_2D, this.lookupTableTexture);
            gl.uniform1i(gl.getUniformLocation(this.program, "u_lookupTable"), 0);

            gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, this.alphaLookupTable.width, this.alphaLookupTable.height, 0, gl.ALPHA, gl.UNSIGNED_BYTE, this.alphaLookupTable.data);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);


            this.uniforms.lookupTexWidth = this.alphaLookupTable.width;
            this.uniforms.maxPosition = 2**16 - 1;

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            this.render();
        };

        if (this.useWebGL2) {
            this.render = () => {
                /*
                * 1. Marker density (opaque markers, additive blend mode, render to data texture)
                * 2. Alpha (render from texture LUT)
                * */

                const { gl, program, uniforms } = this;

                uniforms.resolution = [canvas.width, canvas.height];
                uniforms.pointSize = this.pointSize;
                uniforms.color = this.color;
                uniforms.alpha = this.alpha;

                // PHASE 0: Marker Overlap
                uniforms.phase = 0;

                // Create a texture to render to
                const markerOverlapTexture = gl.createTexture();
                gl.activeTexture(gl.TEXTURE0 + 1);
                gl.bindTexture(gl.TEXTURE_2D, markerOverlapTexture);
                gl.uniform1i(gl.getUniformLocation(program, "u_markerOverlap"), 1);

                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, canvas.width, canvas.height, 0, gl.RED, gl.FLOAT, null);

                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                /*
                const markerOverlapTexture = glUtil.createTexture({
                    gl, width: canvas.width, height: canvas.height,
                    format: gl.RED_INTEGER, internalFormat: gl.R32UI, type: gl.UNSIGNED_INT
                });
                */

                gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, this.pointsUint16, gl.DYNAMIC_DRAW);
                // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
                gl.vertexAttribPointer(this.attributes.position, 3, gl.UNSIGNED_SHORT, false, 0, 0);

                const arrayBufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
                if (!arrayBufferSize) {
                    return;
                }


                const emptyTexture = gl.createTexture();
                gl.activeTexture(gl.TEXTURE0 + 2);
                gl.bindTexture(gl.TEXTURE_2D, emptyTexture);
                gl.uniform1i(gl.getUniformLocation(program, "u_markerOverlap"), 2);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, canvas.width, canvas.height, 0, gl.RED, gl.FLOAT, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

                //this.uniforms.lookupTable = this.lookupTableTexture;
                gl.uniform1i(gl.getUniformLocation(program, "u_lookupTable"), 0);
                gl.activeTexture(gl.TEXTURE0 + 0);
                gl.bindTexture(gl.TEXTURE_2D, this.lookupTableTexture);




                const fb = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, markerOverlapTexture, 0);

                gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);

                gl.viewport(0, 0, canvas.width, canvas.height);

                console.log(glUtil.getEnumName(gl, gl.checkFramebufferStatus(gl.FRAMEBUFFER)));

                gl.clearBufferfv(gl.COLOR, 1, [0.0, 0.0, 0.0, 0.0]);

                gl.enable(gl.BLEND);
                gl.blendEquation(gl.FUNC_ADD);
                gl.blendFunc(gl.ONE, gl.ONE);

                gl.drawArrays(gl.POINTS, 0, arrayBufferSize / 6);


                let pixels;
                if (false) {
                    let pixels = new Uint32Array(gl.drawingBufferWidth * gl.drawingBufferHeight);
                    gl.readBuffer(gl.COLOR_ATTACHMENT1);
                    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RED_INTEGER, gl.UNSIGNED_INT, pixels);
                    let nonZero = pixels.filter(v => v > 0);
                    console.log(`${nonZero.length} / ${pixels.length}`);
                    console.log(nonZero.reduce((max, val) => Math.max(max, val)));
                }

                // PHASE 1: Alpha Channel

                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, canvas.width, canvas.height);

                uniforms.phase = 1;

                //this.uniforms.markerOverlap = markerOverlapTexture;
                //this.uniforms.lookupTable = this.lookupTableTexture;

                gl.uniform1i(gl.getUniformLocation(program, "u_lookupTable"), 0);
                gl.activeTexture(gl.TEXTURE0 + 1);
                gl.bindTexture(gl.TEXTURE_2D, markerOverlapTexture);
                gl.uniform1i(gl.getUniformLocation(program, "u_markerOverlap"), 1);

                // Clear the canvas
                gl.clearColor(0,0,0,0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                const texCoordBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                    -1.0,  -1.0,
                     1.0,  -1.0,
                    -1.0,   1.0,
                    -1.0,   1.0,
                     1.0,  -1.0,
                     1.0,   1.0,
                ]), gl.STATIC_DRAW);
                gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, 0, 0);

                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

                gl.drawArrays(gl.TRIANGLES, 0, 6);

                pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readBuffer(gl.BACK);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                //console.log(pixels);
            };
        } else {
            this.render = () => {
                const { gl, uniforms } = this;

                uniforms.resolution = [canvas.width, canvas.height];
                uniforms.pointSize = this.pointSize;
                uniforms.color = this.color;
                uniforms.alpha = this.alpha;

                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, canvas.width, canvas.height);

                // Clear the canvas
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                //gl.drawArrays(gl.POINTS, 0, this.pointsUint16.length / 3);
                const arrayBufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
                if (arrayBufferSize) {
                    gl.drawArrays(gl.POINTS, 0, arrayBufferSize / 6);
                }
            };
        }

        this.setup();
    }
}
