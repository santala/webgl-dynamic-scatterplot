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
        vec2 normalizedPositionWithPadding = (a_position.xy / u_maxPosition * 2.0 - 1.) * (1.-relPointSize);

        gl_Position = vec4(normalizedPositionWithPadding, 0, 1);
        gl_PointSize = u_pointSize;
        v_pointCount = a_position.z;
        v_lookupTexCoord = vec2((v_pointCount + .5) / u_lookupTexWidth, u_alpha); // compute alpha lookup texture coordinate
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
const webGL2VertexShaderSource = `
`;

// language=glsl
const webGL2FragmentShaderSource = `
`;

const pixelRatio = window.devicePixelRatio || 1;
const maxResolution = Math.max(window.screen.width, window.screen.height);


const maxOverlap = 2**16 - 1; // Max Uint16 value
const alphaResolution = 1000;

const alphaInput = document.getElementById('alpha');
const markerSizeInput = document.getElementById('marker-size');
const colorInput = document.getElementById('color');

alphaInput.setAttribute('min', (1 / alphaResolution).toString());
alphaInput.setAttribute('step', (1 / alphaResolution).toString());
markerSizeInput.setAttribute('min', pixelRatio.toString());

const getWidth = () => canvas.clientWidth * pixelRatio;
const getHeight = () => canvas.clientHeight * pixelRatio;
const getAlpha = () => parseFloat(alphaInput.value);
const getMarkerSize = () => parseInt(markerSizeInput.value);
const getColor = () => colorInput.value;


let width = -1;
let height = -1;
let alpha = getAlpha();
let markerSize = getMarkerSize();
let colorHex = getColor();

function hex2rgb(hex) {
    const hexValues = (/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [null, "00", "00", "00"]).slice(1);
    return hexValues.map(v => (parseInt(v, 16) || 0) / 256);
}

let alphaLookupTable;

function computeLookupData(gl) {
    const maxTextureSize = Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const height = Math.min(maxTextureSize, alphaResolution);
    let width = Math.min(maxTextureSize, maxOverlap);

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

        this.gl = this.canvas.getContext("webgl2");
        this.useWebGL2 = !!this.gl;
        // If WebGL 2.0 isn’t supported, use WebGL 1.0
        this.gl = this.gl || this.canvas.getContext("webgl");
        const gl = this.gl;

        const vertexShaderSource = this.useWebGL2 ? webGL2VertexShaderSource : webGL1VertexShaderSource;
        const vertexShader = glUtil.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);

        const fragmentShaderSource = this.useWebGL2 ? webGL2FragmentShaderSource : webGL1FragmentShaderSource;
        const fragmentShader = glUtil.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = glUtil.createProgram(gl, [vertexShader, fragmentShader]);

        this.pointsUint16 = null;

        this.loadData = (url) => {
            const points = [];
            const groupOffsets = [];

            fetch("./example-data/isabel_250k.csv").then(res => res.text()).then(csv => {
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
                    const groupCol = ~~(yNorm * this.maxWidth); // cast to int
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

                console.log(`Rendering ${this.pointsUint16.length / 3} groups...`);
                this.render();
            });

        };

        this.render = () => {
            const gl = this.gl;
            const program = this.program;

            const attributes = glUtil.getAttributeLocations(gl, program, [
                "a_position"
            ]);
            console.log(attributes);
            const uniforms = glUtil.getUniforms(gl, program);

            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.pointsUint16, gl.DYNAMIC_DRAW);

            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // For data textures where row width is not a multiple of 4


            const lookupTableTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, lookupTableTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

            alphaLookupTable = alphaLookupTable || computeLookupData(gl);
            console.log(alphaLookupTable);

            gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, alphaLookupTable.width, alphaLookupTable.height, 0, gl.ALPHA, gl.UNSIGNED_BYTE, alphaLookupTable.data);

            // Clear the canvas
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            // Tell it to use our program (pair of shaders)
            gl.useProgram(program);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            uniforms.lookupTexWidth = alphaLookupTable.width;

            // Turn on the position attribute
            gl.enableVertexAttribArray(attributes["a_position"]);

            // Bind the position buffer.
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

            // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
            gl.vertexAttribPointer(attributes["a_position"], 3, gl.UNSIGNED_SHORT, false, 0, 0);

            uniforms.pointSize = getMarkerSize();
            uniforms.alpha = getAlpha();
            console.log("alpha", getAlpha());
            uniforms.maxPosition = 2**16 - 1;
            uniforms.resolution = [canvas.width, canvas.height];
            uniforms.color = hex2rgb(colorHex);

            console.log(
                uniforms.alpha, uniforms.color,
                gl.getUniform(program, uniforms.alpha),
                gl.getUniform(program, uniforms.color),
            );

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.drawArrays(gl.POINTS, 0, this.pointsUint16.length / 3);
        };
    }
}
