// WebGL - 2D image processing
// from https://webglfundamentals.org/webgl/webgl-2d-image-processing.html

"use strict";

function main() {
    if (false) {
        var image = new Image();
        requestCORSIfNotSameOrigin(image, "https://webglfundamentals.org/webgl/resources/leaves.jpg")
        image.src = "https://webglfundamentals.org/webgl/resources/leaves.jpg";
        image.onload = function() {
            render(image);
        };
    } else {

        fetch("./example-data/out5d.csv").then(res => res.text()).then(csv => {
            console.log("Fetched CSV");
            const densityMapSize = 2000;
            const densityMap = Array(densityMapSize);
            for (let i = 0; i < densityMap.length; i++) {
                densityMap[i] = Array(densityMapSize);
                for (let j = 0; j < densityMap[i].length; j++) {
                    densityMap[i][j] = [0, 0, 0, 0];
                }
            }

            const lines = csv.split("\n");

            const data = [];

            // TODO: add one pixel empty padding to the texture

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

            for (let i = 0; i < data.length; i++) {
                const [x, y] = data[i];
                const xNorm = (x - xMin) / xRange;
                const yNorm = (y - yMin) / yRange;
                const xScaled = xNorm * (densityMapSize - 1);
                const yScaled = yNorm * (densityMapSize - 1);
                const xInt = Math.floor(xScaled);
                const yInt = Math.floor(yScaled);
                const xOffset = xScaled - xInt;
                const yOffset = yScaled - yInt;

                densityMap[yInt][xInt][0] += xOffset;
                densityMap[yInt][xInt][1] += yOffset;
                densityMap[yInt][xInt][2]++;
            }

            for (let yInt = 0; yInt < densityMapSize; yInt++) {
                for (let xInt = 0; xInt < densityMapSize; xInt++) {
                    if (true) {
                        densityMap[yInt][xInt][0] = Math.floor(densityMap[yInt][xInt][0] / densityMap[yInt][xInt][2] * 255);
                        densityMap[yInt][xInt][1] = Math.floor(densityMap[yInt][xInt][1] / densityMap[yInt][xInt][2] * 255);
                        densityMap[yInt][xInt][3] = densityMap[yInt][xInt][2] % 256;
                        densityMap[yInt][xInt][2] = Math.min(255, Math.floor(densityMap[yInt][xInt][2] / 256));
                    } else {
                        densityMap[yInt][xInt][0] = 127;
                        densityMap[yInt][xInt][1] = 127;
                        densityMap[yInt][xInt][3] = 255 * Math.min(1, densityMap[yInt][xInt][2]);
                        densityMap[yInt][xInt][2] = 0;
                    }
                }
            }

            console.log("Rendering");

            if (true) {
                const dataTexture = new Uint8Array(densityMap.flat().flat());
                render(dataTexture, densityMapSize);
            } else {
                const dataTexture = new Uint8ClampedArray(densityMap.flat().flat());
                const canvas = document.querySelector("#canvas");

                let width = canvas.clientWidth;
                let height = canvas.clientHeight;
                //width = 900; height = width;
                canvas.width = width;
                canvas.height = height;
                const imageData = new ImageData(dataTexture, densityMapSize, densityMapSize);
                const ctx = canvas.getContext("2d");
                ctx.putImageData(imageData, 100, 100, 0, 0, densityMapSize, densityMapSize);
                ctx.fillRect(0, 0, 100, 100);
                console.log(canvas, imageData, ctx);
            }


        });
    }

}

function render(dataTexture, textureSize) {



    // Get A WebGL context
    /** @type {HTMLCanvasElement} */
    var canvas = document.querySelector("#canvas");
    var gl = canvas.getContext("webgl");
    if (!gl) {
        return;
    }

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    width = 900; height = width;
    canvas.width = width;
    canvas.height = height;

    // setup GLSL program
    var program = webglUtils.createProgramFromScripts(gl, ["vertex-shader-2d", "fragment-shader-2d"]);

    // look up where the vertex data needs to go.
    var positionLocation = gl.getAttribLocation(program, "a_position");
    var texcoordLocation = gl.getAttribLocation(program, "a_texCoord");

    // Create a buffer to put three 2d clip space points in
    var positionBuffer = gl.createBuffer();
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Set a rectangle the same size as the image.
    setRectangle( gl, 0, 0, width, height);

    // provide texture coordinates for the rectangle.
    var texcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0.0,  0.0,
        1.0,  0.0,
        0.0,  1.0,
        0.0,  1.0,
        1.0,  0.0,
        1.0,  1.0,
    ]), gl.STATIC_DRAW);

    function createAndSetupTexture(gl) {
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Set up texture so we can render any size image and so we are
        // working with pixels.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return texture;
    }

    const alignment = 1;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);

    // Create a texture and put the image in it.
    const originalPointDensity = createAndSetupTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureSize, textureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTexture);

    const scaledPointDensityTx = createAndSetupTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const scaledPointDensityFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, scaledPointDensityFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scaledPointDensityTx, 0);

    const markerDensityTx = createAndSetupTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const markerDensityFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, markerDensityFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, markerDensityTx, 0);

    // lookup uniforms
    const stageLocation = gl.getUniformLocation(program, "u_stage");
    const srcSizeLocation = gl.getUniformLocation(program, "u_srcSize");
    const dstSizeLocation = gl.getUniformLocation(program, "u_dstSize");


    var resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    var textureSizeLocation = gl.getUniformLocation(program, "u_textureSize");
    var flipYLocation = gl.getUniformLocation(program, "u_flipY");

    var effects = [
        { name: "test", on: true },
    ];

    // Setup a ui.
    var ui = document.querySelector("#ui");
    var table = document.createElement("table");
    var tbody = document.createElement("tbody");
    for (var ii = 0; ii < effects.length; ++ii) {
        var effect = effects[ii];
        var tr = document.createElement("tr");
        var td = document.createElement("td");
        var chk = document.createElement("input");
        chk.value = effect.name;
        chk.type = "checkbox";
        if (effect.on) {
            chk.checked = "true";
        }
        chk.onchange = drawEffects;
        td.appendChild(chk);
        td.appendChild(document.createTextNode('≡ ' + effect.name));
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    ui.appendChild(table);
    $("#ui table").tableDnD({onDrop: drawEffects});

    drawEffects();

    function drawEffects(name) {
        webglUtils.resizeCanvasToDisplaySize(gl.canvas);

        // Clear the canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Tell it to use our program (pair of shaders)
        gl.useProgram(program);

        // Turn on the position attribute
        gl.enableVertexAttribArray(positionLocation);

        // Bind the position buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Turn on the texcoord attribute
        gl.enableVertexAttribArray(texcoordLocation);

        // bind the texcoord buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

        // Tell the texcoord attribute how to get data out of texcoordBuffer (ARRAY_BUFFER)
        gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

        // set the size of the image
        gl.uniform2f(textureSizeLocation, textureSize, textureSize);

        // start with the original image
        gl.bindTexture(gl.TEXTURE_2D, originalPointDensity);

        // don't y flip images while drawing to the textures
        gl.uniform1f(flipYLocation, 1);

        gl.uniform2f(srcSizeLocation, textureSize, textureSize);
        gl.uniform2f(dstSizeLocation, width, height);
        gl.uniform1i(stageLocation, 0);
        setFramebuffer(scaledPointDensityFb, width, height);
        draw();
        gl.bindTexture(gl.TEXTURE_2D, scaledPointDensityTx);

        gl.uniform2i(srcSizeLocation, width, height);

        gl.uniform1i(stageLocation, 1);
        setFramebuffer(markerDensityFb, width, height);
        draw();
        gl.bindTexture(gl.TEXTURE_2D, markerDensityTx);

        // finally draw the result to the canvas.
        gl.uniform1i(stageLocation, 2);
        // need to y flip for canvas
        //gl.uniform1f(flipYLocation, -1); // No need to flip if data is not flipped
        setFramebuffer(null, gl.canvas.width, gl.canvas.height);
        draw();
    }

    function setFramebuffer(fbo, width, height) {
        // make this the framebuffer we are rendering to.
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        // Tell the shader the resolution of the framebuffer.
        gl.uniform2f(resolutionLocation, width, height);

        // Tell webgl the viewport setting needed for framebuffer.
        gl.viewport(0, 0, width, height);
    }


    function draw() {
        // Draw the rectangle.
        var primitiveType = gl.TRIANGLES;
        var offset = 0;
        var count = 6;
        gl.drawArrays(primitiveType, offset, count);
    }
}

function setRectangle(gl, x, y, width, height) {
    var x1 = x;
    var x2 = x + width;
    var y1 = y;
    var y2 = y + height;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2,
    ]), gl.STATIC_DRAW);
}

main();


// This is needed if the images are not on the same domain
// NOTE: The server providing the images must give CORS permissions
// in order to be able to use the image with WebGL. Most sites
// do NOT give permission.
// See: https://webglfundamentals.org/webgl/lessons/webgl-cors-permission.html
function requestCORSIfNotSameOrigin(img, url) {
    if ((new URL(url, window.location.href)).origin !== window.location.origin) {
        img.crossOrigin = "";
    }
}

