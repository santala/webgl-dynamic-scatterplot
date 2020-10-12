"use strict";

import Scatterplot from "./scatterplot.js";

function hex2rgb(hex) {
    const hexValues = (/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [null, "00", "00", "00"]).slice(1);
    return hexValues.map(v => (parseInt(v, 16) || 0) / 256);
}

const pixelRatio = window.devicePixelRatio || 1;
const alphaResolution = 1000;

let canvas = document.getElementById("canvas");

canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas);
const nCalls = Math.round(Math.random() * 100);
if (false) {
    console.log("loseContextInNCalls", nCalls);
    canvas.loseContextInNCalls(nCalls);
}

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
const getColor = () => hex2rgb(colorInput.value);


const plot = new Scatterplot({
    canvas,
    maxWidth: window.screen.width,
    maxHeight: window.screen.height
});

const refreshDesign = () => {
    plot.updateDesign({
        width: getWidth(),
        height: getHeight(),
        pointSize: getMarkerSize(),
        color: getColor(),
        alpha: getAlpha()
    });
    console.log("num calls: " + canvas.getNumCalls());
};

[alphaInput, markerSizeInput, colorInput].forEach(input => {
    input.addEventListener("input", refreshDesign);
});
window.addEventListener("resize", refreshDesign);

plot.loadData("./example-data/out5d.csv").then(refreshDesign);

