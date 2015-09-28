var scalar = require('./scalar');
var tensor = require('./tensor');


module.exports = {
	scalarTapify: function(x) { return new scalar.tape(x); },
	tensorTapify: function(x) { return new tensor.tape(x); },
  	untapify: function(x) { return x.primal === undefined ? x : x.primal; },
  	makeUnaryScalarFunction: scalar.makeUnaryFunction,
  	makeBinaryScalarFucntion: scalar.makeBinaryFunction,
  	makeUnaryTensorFunction: tensor.makeUnaryFunction,
  	makeBinaryTensorFucntion: tensor.makeBinaryFunction,
  	vecselect: tensor.vecselect,
  	math: scalar.math
};

// Scalar functions
for (var name in scalar.functions) {
	module.exports[name] = scalar.functions[name];
}



