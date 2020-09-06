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

    out float v_pointCount;
    out vec2 v_lookupTexCoord;

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
const webGL2FragmentShaderSource = `#version 300 es
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
    in float v_pointCount;
    in vec2 v_lookupTexCoord;

    out vec4 outputColor;

    void main() {
        if (v_pointCount == 0.) {
            discard;
        } else if (distance(gl_PointCoord, vec2(.5)) > 0.5) {
            discard;
        } else {
            float opacity = texture(u_lookupTable, v_lookupTexCoord).a;
            outputColor = vec4(u_color * opacity, opacity);
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

        console.log("Using WebGL" + (this.useWebGL2 ? "2" : "1"));

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

            this.lookupTableTexture = glUtil.createTexture(gl, this.alphaLookupTable);

            try {
                this.uniforms.lookupTexWidth = this.alphaLookupTable.width;
                this.uniforms.maxPosition = 2**16 - 1;
            } catch (e) {
                // Trying to set a uniform that doesn’t exist (e.g. due to a lost WebGL context)
                // will lead to a TypeError
                console.error("Context lost:", gl.isContextLost(), "Error:", e);
            }

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            this.render();
        };

        if (this.useWebGL2) {
            this.render = () => {
                const { gl, uniforms } = this;

                // Clear the canvas
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                uniforms.resolution = [canvas.width, canvas.height];
                uniforms.pointSize = this.pointSize;
                uniforms.color = this.color;
                uniforms.alpha = this.alpha;

                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, canvas.width, canvas.height);
                //gl.drawArrays(gl.POINTS, 0, this.pointsUint16.length / 3);
                const arrayBufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) || 0;
                gl.drawArrays(gl.POINTS, 0, arrayBufferSize / 6);
            };
        } else {
            this.render = () => {
                const { gl, uniforms } = this;

                // Clear the canvas
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                uniforms.resolution = [canvas.width, canvas.height];
                uniforms.pointSize = this.pointSize;
                uniforms.color = this.color;
                uniforms.alpha = this.alpha;

                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, canvas.width, canvas.height);
                //gl.drawArrays(gl.POINTS, 0, this.pointsUint16.length / 3);
                const arrayBufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) || 0;
                gl.drawArrays(gl.POINTS, 0, arrayBufferSize / 6);
            };
        }

        this.setup();
    }
}
