var _ = require('underscore');
var scalar = require('./scalar');
var tensor = require('./tensor');


module.exports = {
	scalarTapify: function(x) { return new scalar.tape(x); },
	tensorTapify: function(x) { return new tensor.tape(x); },
	tapify: function(x) { return _.isNumber(x) ? new scalar.tape(x) : new tensor.tape(x); },
  	untapify: function(x) { return x.primal === undefined ? x : x.primal; },
  	makeUnaryScalarFunction: scalar.makeUnaryFunction,
  	makeBinaryScalarFunction: scalar.makeBinaryFunction,
  	makeUnaryTensorFunction: tensor.makeUnaryFunction,
  	makeBinaryTensorFunction: tensor.makeBinaryFunction,
  	vecselect: tensor.vecselect,
  	vec2scalars: tensor.vec2scalars,
  	math: scalar.math
};

// Scalar functions
for (var name in scalar.functions) {
	module.exports[name] = scalar.functions[name];
}



