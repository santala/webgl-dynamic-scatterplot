"use strict";

import Scatterplot from "./scatterplot.js";

const plot = new Scatterplot({ canvas: document.getElementById("canvas") });

plot.loadData("./example-data/out5d.csv");
