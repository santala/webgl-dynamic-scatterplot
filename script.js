// WebGL - 2D image processing
// from https://webglfundamentals.org/webgl/webgl-2d-image-processing.html

"use strict";

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
    //width = 900; height = width;
    canvas.width = width;
    canvas.height = height;

    let program,
        positionLocation,
        texcoordLocation,
        positionBuffer,
        texcoordBuffer,
        alignment,
        originalPointDensity,
        scaledPointDensityTx,
        scaledPointDensityFb,
        markerDensityTx,
        markerDensityFb,
        stageLocation,
        srcSizeLocation,
        dstSizeLocation,
        markerLocation,
        resolutionLocation,
        flipYLocation;

    function initWebGL() {
        // setup GLSL program
        program = webglUtils.createProgramFromScripts(gl, ["vertex-shader-2d", "fragment-shader-2d"]);

        // look up where the vertex data needs to go.
        positionLocation = gl.getAttribLocation(program, "a_position");
        texcoordLocation = gl.getAttribLocation(program, "a_texCoord");

        // Create a buffer to put three 2d clip space points in
        positionBuffer = gl.createBuffer();
        // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        // Set a rectangle the same size as the image.
        setRectangle( gl, 0, 0, gl.canvas.width, gl.canvas.clientWidth);

        // provide texture coordinates for the rectangle.
        texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0,  0.0,
            1.0,  0.0,
            0.0,  1.0,
            0.0,  1.0,
            1.0,  0.0,
            1.0,  1.0,
        ]), gl.STATIC_DRAW);

        alignment = 1;
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);

        // Create a texture and put the image in it.
        originalPointDensity = createAndSetupTexture(gl);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureSize, textureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataTexture);

        scaledPointDensityTx = createAndSetupTexture(gl);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        scaledPointDensityFb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, scaledPointDensityFb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scaledPointDensityTx, 0);

        markerDensityTx = createAndSetupTexture(gl);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        markerDensityFb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, markerDensityFb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, markerDensityTx, 0);

        // lookup uniforms
        stageLocation = gl.getUniformLocation(program, "u_stage");
        srcSizeLocation = gl.getUniformLocation(program, "u_srcSize");
        dstSizeLocation = gl.getUniformLocation(program, "u_dstSize");
        markerLocation = gl.getUniformLocation(program, "u_marker");

        resolutionLocation = gl.getUniformLocation(program, "u_resolution");
        flipYLocation = gl.getUniformLocation(program, "u_flipY");
    }

    initWebGL();

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


    function resize() {
        const width = gl.canvas.clientWidth;
        const height = gl.canvas.clientHeight;
        if (gl.canvas.width != width ||
            gl.canvas.height != height) {
            const canvas = gl.canvas;
            try {
                canvas.width = width;
                canvas.height = height;
            } catch (e) {
                console.error(e);
            }
            return true;
        }
        return false;
    }

    let needToRender = true;  // draw at least once
    let animationFrameRequestId;
    function checkRender() {
        if (resize() || needToRender) {
            needToRender = false;
            draw();
        }
        animationFrameRequestId = requestAnimationFrame(checkRender);
    }

    canvas.addEventListener("webglcontextlost", (event) => {
        console.log("Context lost");
        event.preventDefault();
        cancelAnimationFrame(animationFrameRequestId);
    }, false);
    canvas.addEventListener("webglcontextrestored", () => {
        console.log("Context restored");
        initWebGL();
        checkRender();
    }, false);

    checkRender();

    function draw() {
        webglUtils.resizeCanvasToDisplaySize(gl.canvas);
        console.log(gl.canvas.width, gl.canvas.clientWidth);

        // Set a rectangle the same size as the image.
        updateRectangle( gl, 0, 0, gl.canvas.width, gl.canvas.clientWidth);

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


        // start with the original image
        gl.bindTexture(gl.TEXTURE_2D, originalPointDensity);

        // don't y flip images while drawing to the textures
        gl.uniform1f(flipYLocation, 1);

        gl.uniform2f(srcSizeLocation, textureSize, textureSize);
        gl.uniform2f(dstSizeLocation, width, height);
        gl.uniform1i(stageLocation, 0);
        setFramebuffer(scaledPointDensityFb, width, height);
        drawRectangle();
        gl.bindTexture(gl.TEXTURE_2D, scaledPointDensityTx);

        gl.uniform2i(srcSizeLocation, width, height);

        gl.uniform1fv(markerLocation, [
            0, 1, 0,
            1, 1, 1,
            0, 1, 0
        ]);

        gl.uniform1i(stageLocation, 1);
        setFramebuffer(markerDensityFb, width, height);
        drawRectangle();
        gl.bindTexture(gl.TEXTURE_2D, markerDensityTx);

        // finally draw the result to the canvas.
        gl.uniform1i(stageLocation, 2);
        // need to y flip for canvas
        //gl.uniform1f(flipYLocation, -1); // No need to flip if data is not flipped
        setFramebuffer(null, gl.canvas.width, gl.canvas.height);
        drawRectangle();
    }

    function setFramebuffer(fbo, width, height) {
        // make this the framebuffer we are rendering to.
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        // Tell the shader the resolution of the framebuffer.
        gl.uniform2f(resolutionLocation, width, height);

        // Tell webgl the viewport setting needed for framebuffer.
        gl.viewport(0, 0, width, height);
    }


    function drawRectangle() {
        // Draw the rectangle.
        var primitiveType = gl.TRIANGLES;
        var offset = 0;
        var count = 6;
        gl.drawArrays(primitiveType, offset, count);
    }
}

const buffer = new Float32Array(12);

function setRectangle(gl, x, y, width, height) {

    const x1 = -1;
    const x2 = 1;
    const y1 = -1;
    const y2 = 1;

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2,
    ]), gl.STATIC_DRAW);

    return;
    updateRectangle(gl, x, y, width, height);
    gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
}

function updateRectangle(gl, x, y, width, height) {
    const x1 = x;
    const x2 = x + width;
    const y1 = y;
    const y2 = y + height;

    [
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2,
    ].forEach((v, i) => buffer[i] = v);
}

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

    const dataTexture = new Uint8Array(densityMap.flat().flat());
    render(dataTexture, densityMapSize);

});


