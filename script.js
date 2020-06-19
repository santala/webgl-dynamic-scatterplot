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

        fetch("./example-data/isabel_250k.csv").then(res => res.text()).then(csv => {
            console.log("Fetched CSV");
            const densityMapSize = 2048;
            const densityMap = Array(densityMapSize);
            for (let i = 0; i < densityMap.length; i++) {
                densityMap[i] = Array(densityMapSize);
                for (let j = 0; j < densityMap[i].length; j++) {
                    densityMap[i][j] = [0, 0, 0, 0];
                }
            }

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
                    densityMap[yInt][xInt][0] = Math.floor(densityMap[yInt][xInt][0] / densityMap[yInt][xInt][2] * 255);
                    densityMap[yInt][xInt][1] = Math.floor(densityMap[yInt][xInt][1] / densityMap[yInt][xInt][2] * 255);
                    densityMap[yInt][xInt][3] = densityMap[yInt][xInt][2] % 256;
                    densityMap[yInt][xInt][2] = Math.min(255, Math.floor(densityMap[yInt][xInt][2] / 256));
                }
            }

            const dataTexture = new Uint8Array(densityMap.flat().flat());

            console.log("Rendering");
            render(dataTexture, densityMapSize);
        });
        if (false) {
            const img = document.querySelector("#overlap");
            img.onload = function() {
                render(img);
            };
            render(img);
        }

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
    width = 1006; height = width;

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

    // create 2 textures and attach them to framebuffers.
    // const textures = [];
    // const framebuffers = [];
    // for (var ii = 0; ii < 2; ++ii) {
    //     var texture = createAndSetupTexture(gl);
    //     textures.push(texture);
    //
    //     // make the texture the same size as the image
    //     gl.texImage2D(
    //         gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0,
    //         gl.RGBA, gl.UNSIGNED_BYTE, null);
    //
    //     // Create a framebuffer
    //     var fbo = gl.createFramebuffer();
    //     framebuffers.push(fbo);
    //     gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    //
    //     // Attach a texture to it.
    //     gl.framebufferTexture2D(
    //         gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    // }

    // lookup uniforms
    const stageLocation = gl.getUniformLocation(program, "u_stage");
    const srcSizeLocation = gl.getUniformLocation(program, "u_srcSize");
    const dstSizeLocation = gl.getUniformLocation(program, "u_dstSize");


    var resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    var textureSizeLocation = gl.getUniformLocation(program, "u_textureSize");
    var kernelLocation = gl.getUniformLocation(program, "u_kernel[0]");
    var kernelWeightLocation = gl.getUniformLocation(program, "u_kernelWeight");
    var flipYLocation = gl.getUniformLocation(program, "u_flipY");

    // Define several convolution kernels
    var kernels = {
        normal: [
            0, 0, 0,
            0, 1, 0,
            0, 0, 0
        ],
        test: [
            0, 1, 0,
            1, 1, 1,
            0, 1, 0
        ],
    };

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

    function computeKernelWeight(kernel) {
        var weight = kernel.reduce(function(prev, curr) {
            return prev + curr;
        });
        return weight <= 0 ? 1 : weight;
    }

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
        var size = 2;          // 2 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            positionLocation, size, type, normalize, stride, offset);

        // Turn on the texcoord attribute
        gl.enableVertexAttribArray(texcoordLocation);

        // bind the texcoord buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

        // Tell the texcoord attribute how to get data out of texcoordBuffer (ARRAY_BUFFER)
        var size = 2;          // 2 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            texcoordLocation, size, type, normalize, stride, offset);

        // set the size of the image
        gl.uniform2f(textureSizeLocation, textureSize, textureSize);

        // start with the original image
        gl.bindTexture(gl.TEXTURE_2D, originalPointDensity);

        // don't y flip images while drawing to the textures
        gl.uniform1f(flipYLocation, 1);

        // loop through each effect we want to apply.

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

