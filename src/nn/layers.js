var numeric = require('numeric');
var tensor = require('../tensor.js');
var ad = require('../ad/main.js');


// Fully connected layer (it's just a matrix/vector multiply, plus an additional add)
var ad_add = ad.makeBinaryTensorFunction(
	numeric.add,
	function(x1, x2) { return numeric.rep(numeric.dim(x1), 1); },
	function(x1, x2) { return numeric.rep(numeric.dim(x2), 1); }
);
var ad_mvmul = ad.makeBinaryTensorFunction(
	numeric.dot,
	function(m, v) { return v; },
	function(m, v) { return m; },
	numeric.tensor, numeric.dot
);
function fullyConnectedLayer(inputs, weights, biases) {
	return ad_add(ad_mvmul(weights, inputs), biases);
}



// Various nonlinearities

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function dsigmoid(x) { var s = sigmoid(x); return s * (1 - s); };
var ad_sigmoid = ad.makeUnaryTensorFunction(
	function(v) { return tensor.map(v, sigmoid); },
	function(v) { return tensor.map(v, dsigmoid); }
);

function dtanh(x) { var t = Math.tanh(x); return 1 - t*t; }
var ad_tanh = ad.makeUnaryTensorFunction(
	function(v) { return tensor.map(v, Math.tanh); },
	function(v) { return tensor.map(v, dtanh); }
);

function relu(x) { return x < 0 ? 0 : x; }
function drelu(x) { return x < 0 ? 0 : 1; }
var ad_relu = ad.makeUnaryTensorFunction(
	function(v) { return tensor.map(v, relu); },
	function(v) { return tensor.map(v, drelu); }
);



module.exports = {
	fullyConnected: fullyConnectedLayer,
	sigmoid: ad_sigmoid,
	tanh: ad_tanh,
	rectifiedLinear: ad_relu
};